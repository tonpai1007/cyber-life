// Pure simulation engine for Cyber-Life — no React, no DOM, no globals.
// Shared by the UI hook (useLifeGame.js) and the headless tools
// (tools/sweep.mjs). Everything here is deterministic given a seeded RNG.
import { mulberry32 } from './prng.js';

// ---------------------------------------------------------------- rules ----

// Rule strings look like "B3/S23" (letters optional, any order, digits 0-8).
// Returns null when the string is not a valid ruleset so callers can keep the
// last known-good rules instead of silently simulating a dead universe.
export const parseRules = (ruleStr) => {
  if (typeof ruleStr !== 'string') return null;
  const parts = ruleStr.trim().toLowerCase().split('/');
  if (parts.length !== 2) return null;
  const parseList = (part, letter) => {
    const digits = part.replace(new RegExp(`^${letter}`), '');
    if (!/^[0-8]*$/.test(digits)) return null;
    return [...new Set(digits.split('').map(Number))];
  };
  const b = parseList(parts[0], 'b');
  const s = parseList(parts[1], 's');
  if (!b || !s) return null;
  return { b, s };
};

export const isValidRuleStr = (ruleStr) => parseRules(ruleStr) !== null;

// Rule 110: an elementary cellular automaton proven Turing-complete.
export const RULE_110 = 110;

// Heredity: a gene rarely drifts by +-1 (gradual lineage branching); 2% of the
// time it "mutates" to a random value. Storm rules raise the drift pressure,
// which acts as selection pressure on lineage diversity. `rng` is the
// seeded stream — keep it deterministic for reproducible runs.
export const driftGene = (gene, driftRate, rng) => {
  if (rng() < driftRate) {
    if (rng() < 0.02) return Math.floor(rng() * 256);
    return (gene + (rng() < 0.5 ? 1 : 255)) & 0xff;
  }
  return gene;
};

// Pure survival/birth decision.
export const nextAlive = ({ cell, neighbors, avgMeta, b, s, neuralMode }) => {
  if (neuralMode) {
    const threshold = 0.45;
    if (cell > 0) return s.includes(neighbors) || avgMeta > threshold;
    return b.includes(neighbors) || (neighbors > 1 && avgMeta > 0.7);
  }
  return cell > 0 ? s.includes(neighbors) : b.includes(neighbors);
};

// Pure Rule 110 lookup for a single triple.
export const rule110Bit = (l, c, r) => (RULE_110 >> ((l << 2) | (c << 1) | r)) & 1;

// ---------------------------------------------------------------- world ----

// Create a fully seeded world. `sparse` is the P(dead) threshold used by the
// original sim (0.85 → ~15% initial density).
export const createWorld = (cols, rows, seed = 1, sparse = 0.85, rng = null) => {
  const stream = rng || mulberry32((seed >>> 0) || 1);
  const grid = new Uint8Array(cols * rows);
  for (let i = 0; i < grid.length; i++) {
    if (stream() > sparse) grid[i] = 1;
  }
  return {
    cols,
    rows,
    grid,
    next: new Uint8Array(cols * rows),
    meta: new Float32Array(cols * rows),
    genes: new Uint8Array(cols * rows),
    geneBack: new Uint8Array(cols * rows),
    generation: 0,
  };
};

// Re-fill the world randomly (seeded) — used by RANDOM and reseed paths.
export const fillRandom = (world, sparse, rng) => {
  world.grid.fill(0);
  for (let i = 0; i < world.grid.length; i++) {
    if (rng() > sparse) world.grid[i] = 1;
  }
  world.genes.fill(0);
  world.meta.fill(0);
  world.generation = 0;
};

// One simulation step. Mutates the world's buffers in place (double-buffered).
// Returns a cheap grid hash used for stagnation detection.
export const stepWorld = (world, { neuralMode = false, b, s, driftRate = 0.015, rng }) => {
  const { cols, rows, grid: current, next, genes, geneBack: nextGenes, meta } = world;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let neighbors = 0;
      let avgMeta = 0;
      let geneSum = 0;
      let geneCount = 0;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          if (i === 0 && j === 0) continue;
          const nx = (x + i + cols) % cols;
          const ny = (y + j + rows) % rows;
          const nidx = ny * cols + nx;
          if (current[nidx] > 0) {
            neighbors++;
            avgMeta += meta[nidx];
            geneSum += genes[nidx];
            geneCount++;
          }
        }
      }
      avgMeta = neighbors > 0 ? avgMeta / neighbors : 0;

      const idx = y * cols + x;
      const cell = current[idx];

      const alive = nextAlive({ cell, neighbors, avgMeta, b, s, neuralMode });

      if (alive) {
        next[idx] = Math.min(cell + 1, 10);
        if (cell > 0) {
          nextGenes[idx] = driftGene(genes[idx], driftRate, rng);
        } else if (geneCount > 0) {
          nextGenes[idx] = driftGene(Math.round(geneSum / geneCount), driftRate, rng);
        } else {
          nextGenes[idx] = Math.floor(rng() * 256);
        }
        if (neuralMode) meta[idx] = cell > 0 ? Math.min(meta[idx] + 0.1, 1.0) : avgMeta * 0.9;
      } else {
        next[idx] = 0;
        nextGenes[idx] = 0;
        if (neuralMode) meta[idx] *= cell > 0 ? 0.8 : 0.5;
      }
    }
  }

  let hash = 0;
  for (let i = 0; i < next.length; i++) {
    if (next[i]) hash = (hash ^ i) + (hash << 5) + hash;
  }

  current.set(next);
  genes.set(nextGenes);
  world.generation += 1;
  return hash;
};

// Rule 110 spacetime step over row 0 (used by the UI's compute lane).
export const stepRule110 = (world) => {
  const { cols, rows, grid: current, next, geneBack: nextGenes, genes } = world;
  for (let y = 1; y < rows; y++) {
    const up = (y - 1) * cols;
    const row = y * cols;
    for (let x = 0; x < cols; x++) {
      const l = current[up + ((x - 1 + cols) % cols)];
      const c = current[up + x];
      const r = current[up + ((x + 1) % cols)];
      next[row + x] = rule110Bit(l, c, r);
      nextGenes[row + x] = next[row + x] ? 180 : 0;
    }
  }
  for (let x = 0; x < cols; x++) {
    next[x] = current[x];
    nextGenes[x] = genes[x];
  }
  let out = '';
  const last = (rows - 1) * cols;
  for (let x = 0; x < Math.min(cols, 128); x += 4) {
    let nib = 0;
    for (let bb = 0; bb < 4; bb++) nib = (nib << 1) | next[last + x + bb];
    out += nib.toString(16);
  }
  current.set(next);
  genes.set(nextGenes);
  world.generation += 1;
  return out;
};

// Fitness of a world: density entropy x connectivity x lineage diversity x
// longevity. Scores ~0..7; higher = more "alive".
export const computeFitness = ({ cols, rows, grid, genes }) => {
  let count = 0;
  let ageSum = 0;
  const geneSet = new Set();
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] > 0) {
      count++;
      ageSum += grid[i];
      geneSet.add(genes[i]);
    }
  }
  const cellCount = cols * rows;
  const p = cellCount > 0 ? count / cellCount : 0;
  const entropy = p > 0 && p < 1 ? -(p * Math.log(p) + (1 - p) * Math.log(1 - p)) : 0;

  let components = 0;
  if (count > 0) {
    const visited = new Uint8Array(cols * rows);
    for (let si = 0; si < grid.length; si++) {
      if (grid[si] === 0 || visited[si]) continue;
      components++;
      const stack = [si];
      visited[si] = 1;
      while (stack.length) {
        const idx = stack.pop();
        const cx = idx % cols;
        const cy = Math.floor(idx / cols);
        for (let a = -1; a <= 1; a++) {
          for (let b = -1; b <= 1; b++) {
            if (a === 0 && b === 0) continue;
            const nx = (cx + a + cols) % cols;
            const ny = (cy + b + rows) % rows;
            const nidx = ny * cols + nx;
            if (grid[nidx] > 0 && !visited[nidx]) {
              visited[nidx] = 1;
              stack.push(nidx);
            }
          }
        }
      }
    }
  }

  const avgAge = count ? ageSum / count : 0;
  const score =
    entropy * 2 +
    Math.min(components / 30, 1.5) +
    Math.min(geneSet.size / 40, 1.5) +
    Math.min(avgAge / 4, 1.5);
  return { score, population: count, entropy, components, diversity: geneSet.size, avgAge };
};
