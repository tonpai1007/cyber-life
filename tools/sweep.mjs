#!/usr/bin/env node
// Headless ablation study for Cyber-Life: does fitness-gated ruleset selection
// beat random rule switching (the null model)?
//
// Protocol
//   Conditions: 'fixed' (B3/S23 only) · 'storm‑gated' (storms every K gens,
//   adopted only when their rolling-window mean fitness beats the incumbent's)
//   · 'storm‑null' (same storms, always adopted).
//   Seeds 1000..1029 (30), 400 generations, metrics sampled every generation.
//   Storms are forced on a fixed clock (every K generations) to control the
//   experimental exposure; this differs from the UI (random chance) by design.
//
// Outputs
//   tools/out/sweep_traces.csv  — per (condition, seed, generation) metrics
//   docs/sweep_summary.json     — summary stats (means, 95% CIs, Welch t)
//   docs/figures/diversity_curves.svg — mean diversity curves per condition
//
// Usage: node tools/sweep.mjs [--gens 400] [--seeds 30] [--k 50]
import { writeFileSync, mkdirSync } from 'node:fs';
import { createWorld, stepWorld, computeFitness, parseRules } from '../src/engine.js';
import { mulberry32 } from '../src/prng.js';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const GENS = arg('gens', 400);
const N_SEEDS = arg('seeds', 30);
const K = arg('k', 50); // forced storm every K generations
const COLS = 65;
const ROWS = 41; // match the default window in the app
const SEED0 = 1000;
const BASE_RULE = 'B3/S23';
const STORM_RULES = ['B36/S23', 'B3/S23', 'B2/S23', 'B34/S34', 'B3/S12345'];
const STORM_WINDOW = 40;
const MIN_SAMPLES = 5;
const DRIFT_BASE = 0.015;
const DRIFT_STORM = 0.06;

const windowMean = (window, rule, max = STORM_WINDOW) => {
  const arr = window.filter((s) => s.rule === rule).slice(-max);
  if (!arr.length) return null;
  const sum = arr.reduce((acc, s) => acc + s.score, 0);
  return { mean: sum / arr.length, n: arr.length };
};

function runCondition(condition, seed) {
  const rng = mulberry32(seed >>> 0);
  const world = createWorld(COLS, ROWS, seed, 0.85, rng);
  let rule = BASE_RULE;
  let { b, s } = parseRules(rule);
  let driftRate = DRIFT_BASE;
  const window = []; // rolling fitness window (per rule), like the app
  const traces = [];

  for (let g = 0; g < GENS; g++) {
    if (condition !== 'fixed' && g > 0 && g % K === 0) {
      const candidates = STORM_RULES.filter((r) => r !== rule);
      const stormRule = candidates[Math.floor(rng() * candidates.length)];
      if (condition === 'storm-null') {
        rule = stormRule; // null model: adopt blindly
      } else {
        // gated: switch, sample, decide on window means (mirrors app logic)
        const pre = rule;
        const preStats = windowMean(window, pre);
        // Collect MIN_SAMPLES on the storm rule first, then decide.
        const stormB = parseRules(stormRule);
        for (let t = 0; t < MIN_SAMPLES; t++) {
          const m = stepWorld(world, { neuralMode: false, b: stormB.b, s: stormB.s, driftRate: DRIFT_STORM, rng });
          const f = computeFitness(world);
          window.push({ rule: stormRule, score: f.score });
          if (window.length > 240) window.shift();
          traces.push({ condition, seed, generation: world.generation, rule: stormRule, ...f });
        }
        const afterStats = windowMean(window, stormRule);
        const enough = preStats && afterStats && preStats.n >= MIN_SAMPLES && afterStats.n >= MIN_SAMPLES;
        if (!enough || afterStats.mean <= preStats.mean) {
          rule = pre; // conservative revert
        } else {
          rule = stormRule; // adopted
        }
        ({ b, s } = parseRules(rule));
        driftRate = rule === BASE_RULE ? DRIFT_BASE : DRIFT_STORM;
        continue;
      }
      ({ b, s } = parseRules(rule));
      driftRate = rule === BASE_RULE ? DRIFT_BASE : DRIFT_STORM;
    }

    stepWorld(world, { neuralMode: false, b, s, driftRate, rng });
    const metrics = computeFitness(world);
    window.push({ rule, score: metrics.score });
    if (window.length > 240) window.shift();
    traces.push({ condition, seed, generation: world.generation, rule, ...metrics });
  }
  return traces;
}

// ------------------------------------------------- aggregate & summarize ----
const CONDITIONS = ['fixed', 'storm-gated', 'storm-null'];
const all = [];
for (const condition of CONDITIONS) {
  const t0 = Date.now();
  for (let i = 0; i < N_SEEDS; i++) {
    all.push(...runCondition(condition, SEED0 + i));
    if ((i + 1) % 10 === 0) process.stderr.write(`${condition}: ${i + 1}/${N_SEEDS} seeds\n`);
  }
  process.stderr.write(`${condition} done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
}

mkdirSync('tools/out', { recursive: true });
mkdirSync('docs/figures', { recursive: true });

// CSV trace
const header = 'condition,seed,generation,rule,population,entropy,components,diversity,avgAge,fitness\n';
const lines = all.map((r) =>
  [
    r.condition, r.seed, r.generation, r.rule, r.population,
    r.entropy.toFixed(6), r.components, r.diversity, r.avgAge.toFixed(4), r.score.toFixed(6),
  ].join(',')
);
writeFileSync('tools/out/sweep_traces.csv', header + lines.join('\n') + '\n');

// Summary stats per condition: mean of per-seed terminal-100-gen averages.
const seeds = [...new Set(all.map((r) => r.seed))];
const summary = {};
for (const condition of CONDITIONS) {
  const perSeed = [];
  for (const seed of seeds) {
    const rows = all.filter((r) => r.condition === condition && r.seed === seed);
    const tail = rows.slice(-100);
    const mean = (fn) => tail.reduce((a, r) => a + fn(r), 0) / tail.length;
    perSeed.push({
      seed,
      population: mean((r) => r.population),
      entropy: mean((r) => r.entropy),
      components: mean((r) => r.components),
      diversity: mean((r) => r.diversity),
      fitness: mean((r) => r.score),
      finalGeneration: rows[rows.length - 1].generation,
    });
  }
  const mean = (arr) => arr.reduce((a, v) => a + v, 0) / arr.length;
  const ci95 = (arr) => {
    const m = mean(arr);
    const v = mean(arr.map((x) => (x - m) ** 2));
    return 1.96 * Math.sqrt(v / arr.length);
  };
  const metric = (name) => {
    const arr = perSeed.map((p) => p[name]);
    return { mean: mean(arr), ci95: ci95(arr), min: Math.min(...arr), max: Math.max(...arr) };
  };
  summary[condition] = {
    seeds: perSeed.length,
    population: metric('population'),
    entropy: metric('entropy'),
    components: metric('components'),
    diversity: metric('diversity'),
    fitness: metric('fitness'),
  };
}

// Welch t-test: storm-gated vs storm-null on diversity (the key claim).
const welch = (a, b) => {
  const m1 = a.reduce((x, y) => x + y, 0) / a.length;
  const m2 = b.reduce((x, y) => x + y, 0) / b.length;
  const v1 = a.reduce((x, y) => x + (y - m1) ** 2, 0) / (a.length - 1);
  const v2 = b.reduce((x, y) => x + (y - m2) ** 2, 0) / (b.length - 1);
  const t = (m1 - m2) / Math.sqrt(v1 / a.length + v2 / b.length);
  const df = (v1 / a.length + v2 / b.length) ** 2 /
    ((v1 / a.length) ** 2 / (a.length - 1) + (v2 / b.length) ** 2 / (b.length - 1));
  return { t, df, m1, m2 };
};
const divGated = seeds.map((seed) => {
  const rows = all.filter((r) => r.condition === 'storm-gated' && r.seed === seed);
  const tail = rows.slice(-100);
  return tail.reduce((a, r) => a + r.diversity, 0) / tail.length;
});
const divNull = seeds.map((seed) => {
  const rows = all.filter((r) => r.condition === 'storm-null' && r.seed === seed);
  const tail = rows.slice(-100);
  return tail.reduce((a, r) => a + r.diversity, 0) / tail.length;
});
summary.welchDiversityGatedVsNull = welch(divGated, divNull);

writeFileSync('docs/sweep_summary.json', JSON.stringify({ protocol: { GENS, N_SEEDS, K, SEED0, COLS, ROWS, STORM_WINDOW, MIN_SAMPLES }, summary }, null, 2));

// Mean diversity curve per condition → SVG
const meanCurve = (condition) => {
  const byGen = [];
  for (let g = 1; g <= GENS; g++) {
    const rows = all.filter((r) => r.condition === condition && r.generation === g);
    byGen.push(rows.length ? rows.reduce((a, r) => a + r.diversity, 0) / rows.length : null);
  }
  return byGen;
};
const curves = Object.fromEntries(CONDITIONS.map((c) => [c, meanCurve(c)]));
const W = 720, H = 420, PAD = 48;
const maxDiv = Math.max(...Object.values(curves).flatMap((c) => c.filter((v) => v !== null)), 1);
const xAt = (g) => PAD + ((g - 1) / (GENS - 1)) * (W - 2 * PAD);
const yAt = (v) => H - PAD - (v / maxDiv) * (H - 2 * PAD);
const palette = { fixed: '#8888aa', 'storm-gated': '#00f3ff', 'storm-null': '#ff5577' };
const path = (vals) => {
  let d = '';
  vals.forEach((v, i) => {
    if (v === null) return;
    d += (d ? 'L' : 'M') + xAt(i + 1).toFixed(1) + ' ' + yAt(v).toFixed(1) + ' ';
  });
  return d.trim();
};
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="monospace" font-size="12">
<rect width="${W}" height="${H}" fill="#05050a"/>
<text x="${W / 2}" y="20" fill="#00f3ff" text-anchor="middle">GENE DIVERSITY OVER TIME — 30 SEEDS (MEAN)</text>
<line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="#333"/>
<line x1="${PAD}" y1="${PAD}" x2="${PAD}" y2="${H - PAD}" stroke="#333"/>
<text x="${PAD}" y="${H - PAD + 16}" fill="#888" font-size="10">gen 1</text>
<text x="${W - PAD}" y="${H - PAD + 16}" fill="#888" font-size="10" text-anchor="end">gen ${GENS}</text>
<text x="${PAD - 6}" y="${PAD}" fill="#888" font-size="10" text-anchor="end">${maxDiv.toFixed(1)}</text>
<text x="${PAD - 6}" y="${H - PAD}" fill="#888" font-size="10" text-anchor="end">0</text>
${CONDITIONS.map((c) => `<path d="${path(curves[c])}" fill="none" stroke="${palette[c]}" stroke-width="2"/>`).join('\n')}
${CONDITIONS.map((c, i) => `<text x="${W - PAD}" y="${36 + i * 16}" fill="${palette[c]}" font-size="11" text-anchor="end">${c}</text>`).join('\n')}
</svg>`;
writeFileSync('docs/figures/diversity_curves.svg', svg);

console.log(JSON.stringify(summary, null, 2));
process.stderr.write('sweep complete\n');
