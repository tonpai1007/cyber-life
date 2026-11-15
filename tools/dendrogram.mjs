#!/usr/bin/env node
// Lineage dendrogram: run one seeded storm-gated world and draw a gene-lineage
// tree of the most abundant genes at the end. Genes drift ±1 per generation,
// so numeric distance |g_i − g_j| clusters related lineages; 2% random jumps
// appear as distant branches. Single-linkage agglomerative clustering.
//
// Usage: node tools/dendrogram.mjs [--seed 1001] [--gens 400]
import { writeFileSync, mkdirSync } from 'node:fs';
import { createWorld, stepWorld, computeFitness, parseRules } from '../src/engine.js';
import { mulberry32 } from '../src/prng.js';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const SEED = arg('seed', 1001);
const GENS = arg('gens', 400);
const K = 50;
const BASE_RULE = 'B3/S23';
const STORM_RULES = ['B36/S23', 'B3/S23', 'B2/S23', 'B34/S34', 'B3/S12345'];
const COLS = 65, ROWS = 41, DRIFT_BASE = 0.015, DRIFT_STORM = 0.06;
const TOP_N = 22;

const rng = mulberry32(SEED >>> 0);
const world = createWorld(COLS, ROWS, SEED, 0.85, rng);
let rule = BASE_RULE;
let { b, s } = parseRules(rule);
let driftRate = DRIFT_BASE;
const window = [];

for (let g = 0; g < GENS; g++) {
  if (g > 0 && g % K === 0) {
    const candidates = STORM_RULES.filter((r) => r !== rule);
    const stormRule = candidates[Math.floor(rng() * candidates.length)];
    const stormB = parseRules(stormRule);
    const preStats = (() => {
      const arr = window.filter((x) => x.rule === rule).slice(-40);
      return arr.length ? { mean: arr.reduce((a, x) => a + x.score, 0) / arr.length, n: arr.length } : null;
    })();
    for (let t = 0; t < 5; t++) {
      stepWorld(world, { neuralMode: false, b: stormB.b, s: stormB.s, driftRate: DRIFT_STORM, rng });
      const f = computeFitness(world);
      window.push({ rule: stormRule, score: f.score });
      if (window.length > 240) window.shift();
    }
    const afterStats = (() => {
      const arr = window.filter((x) => x.rule === stormRule).slice(-40);
      return arr.length ? { mean: arr.reduce((a, x) => a + x.score, 0) / arr.length, n: arr.length } : null;
    })();
    if (preStats && afterStats && afterStats.mean > preStats.mean) {
      rule = stormRule; // adopted
    }
    ({ b, s } = parseRules(rule));
    driftRate = rule === BASE_RULE ? DRIFT_BASE : DRIFT_STORM;
    continue;
  }
  stepWorld(world, { neuralMode: false, b, s, driftRate, rng });
  window.push({ rule, score: computeFitness(world).score });
  if (window.length > 240) window.shift();
}

// Gene histogram of the surviving population
const hist = new Map();
for (let i = 0; i < world.grid.length; i++) {
  if (world.grid[i] > 0) {
    const g = world.genes[i];
    hist.set(g, (hist.get(g) || 0) + 1);
  }
}
const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_N).map(([gene, count]) => ({ gene, count }));
top.sort((a, b) => a.gene - b.gene);

const dist = (a, b) => Math.abs(a.gene - b.gene) / 255; // normalized numeric distance

// Single-linkage agglomerative clustering
let clusters = top.map((t, i) => ({ id: i, members: [t], y: null, x: 0, children: null }));
const linkage = (A, B) => Math.min(...A.members.flatMap((a) => B.members.map((b) => dist(a, b))));
let nextId = top.length;
while (clusters.length > 1) {
  let best = { d: Infinity, i: -1, j: -1 };
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const d = linkage(clusters[i], clusters[j]);
      if (d < best.d) best = { d, i, j };
    }
  }
  const { i, j, d } = best;
  const merged = {
    id: nextId++,
    members: [...clusters[i].members, ...clusters[j].members],
    x: d,
    children: [clusters[i], clusters[j]],
    y: null,
  };
  clusters.splice(j, 1);
  clusters.splice(i, 1, merged);
}
const root = clusters[0];

// Layout: leaf slots in genome-value order; parent y = mean of children.
const leavesY = new Map();
let slot = 0;
const assignY = (node) => {
  if (!node.children) {
    node.y = slot++;
    leavesY.set(node.id, node.y);
    return node.y;
  }
  const ys = node.children.map(assignY);
  node.y = (Math.min(...ys) + Math.max(...ys)) / 2;
  return node.y;
};
assignY(root);

const W = 880, H = 640, PADX = 26, PADY = 34, LEAF_W = 150;
const maxX = root.x > 0 ? root.x : 1;
const xAt = (x) => PADX + LEAF_W + (x / maxX) * (W - PADX * 2 - LEAF_W);
const yAt = (y) => PADY + (y / (top.length - 1)) * (H - PADY * 2);

const edges = [];
const drawEdges = (node) => {
  if (!node.children) return;
  for (const child of node.children) {
    edges.push({ x1: xAt(node.x), y1: yAt(node.y), x2: xAt(child.x), y2: yAt(child.y) });
  }
  node.children.forEach(drawEdges);
};
drawEdges(root);

const leafText = (node) => {
  const gene = node.members[0];
  const barWidth = Math.round((gene.count / top[0].count) * 60);
  return `<g>
    <text x="${PADX}" y="${yAt(node.y) + 4}" fill="#9adfff" font-size="10">0x${gene.gene.toString(16).padStart(2, '0').toUpperCase()} <tspan fill="#4a6a7a">×${gene.count}</tspan></text>
    <rect x="${PADX + 64}" y="${yAt(node.y) - 4}" width="${barWidth}" height="7" fill="#00f3ff" opacity="0.28"/>
  </g>`;
};
const collectLeaves = (node, out) => {
  if (!node.children) out.push(node);
  else node.children.forEach((c) => collectLeaves(c, out));
};
const leaves = [];
collectLeaves(root, leaves);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="monospace" font-size="10">
<rect width="${W}" height="${H}" fill="#05050a"/>
<text x="${W / 2}" y="20" fill="#00f3ff" text-anchor="middle" font-size="13">LINEAGE DENDROGRAM — GENE CLUSTERS AT GEN ${GENS} (SEED ${SEED}, STORM-GATED)</text>
${edges.map((e) => `<path d="M${e.x1.toFixed(1)} ${e.y1.toFixed(1)} H${e.x2.toFixed(1)} V${e.y2.toFixed(1)}" fill="none" stroke="#00f3ff" stroke-opacity="0.55" stroke-width="1.4"/>`).join('\n')}
${leaves.map(leafText).join('\n')}
<text x="${PADX + LEAF_W}" y="${H - 6}" fill="#4a6a7a" font-size="9">distance → (|Δgene| / 255)</text>
</svg>`;

mkdirSync('docs/figures', { recursive: true });
writeFileSync('docs/figures/lineage_dendrogram.svg', svg);
console.log(`dendrogram: ${leaves.length} lineages, root distance ${maxX.toFixed(3)} → docs/figures/lineage_dendrogram.svg`);
