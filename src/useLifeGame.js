import { useState, useEffect, useRef, useCallback } from 'react';
import { mulberry32 } from './prng';
import {
  parseRules,
  driftGene,
  stepWorld,
  stepRule110,
  computeFitness,
  fillRandom,
} from './engine';

// Re-exported so existing consumers (App.jsx, tests) keep working.
export { parseRules, isValidRuleStr } from './engine';
export { nextAlive, rule110Bit } from './engine';

export const useLifeGame = (cols, rows, seed = 1) => {
  const [active, setActive] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [isStagnant, setIsStagnant] = useState(false);
  const [lastMutation, setLastMutation] = useState(null);
  const [ruleStr, setRuleStr] = useState('B3/S23');
  // Seeded PRNG stream — the single source of randomness for the whole
  // simulation so a given seed reproduces a world exactly (passive runs).
  const rngRef = useRef(mulberry32(seed >>> 0));
  // Audit log of per-generation metrics (for CSV export / offline analysis).
  const metricsRef = useRef([]);
  const [grid, setGrid] = useState(() => {
    const g = new Uint8Array(cols * rows);
    for (let i = 0; i < g.length; i++) {
      if (rngRef.current() > 0.85) g[i] = 1;
    }
    return g;
  });
  const [neuralMode, setNeuralMode] = useState(false);
  const [ruleHistory, setRuleHistory] = useState(['B3/S23']);
  const [ruleStats, setRuleStats] = useState([
    { rule: 'B3/S23', avg: 0, samples: 0, adopted: true },
  ]);
  const [computeMode, setComputeMode] = useState(false);
  const [laneOutput, setLaneOutput] = useState('');

  const gridRef = useRef(new Uint8Array(cols * rows));
  const backBufferRef = useRef(new Uint8Array(cols * rows));
  // Metabolic channel for Neural Mode
  const metaRef = useRef(new Float32Array(cols * rows));
  // Heredity channel: every live cell carries a lineage gene (visible phylogeny)
  const geneRef = useRef(new Uint8Array(cols * rows));
  const geneBackRef = useRef(new Uint8Array(cols * rows));
  const historyRef = useRef([]);
  const rules = useRef(parseRules('B3/S23'));
  const ruleStrRef = useRef('B3/S23');
  // Tracks the dimensions the buffers were allocated for, so a resize can
  // carry the world over instead of silently zeroing it.
  const dimsRef = useRef({ cols, rows });
  // Rolling window of fitness samples (per rule) used by the storm selector:
  // adoption is decided on means over this window, not on instantaneous reads.
  const fitnessWindowRef = useRef([]); // [{ rule, score }], capped
  const stormPendingRef = useRef(false);
  const ruleStatsRef = useRef({
    'B3/S23': { rule: 'B3/S23', avg: 0, samples: 0, adopted: true },
  });

  // Keep simulation buffers sized to the live grid. On resize the overlapping
  // region is copied into the new buffers (top-left aligned) so the universe
  // survives; cells outside the old bounds start dead. Returns true when a
  // reallocation happened.
  const ensureBuffers = useCallback(() => {
    const size = cols * rows;
    if (
      gridRef.current.length === size &&
      dimsRef.current.cols === cols &&
      dimsRef.current.rows === rows
    ) {
      return false;
    }
    const old = dimsRef.current;
    const oldGrid = gridRef.current;
    const oldMeta = metaRef.current;
    const oldGenes = geneRef.current;
    const newGrid = new Uint8Array(size);
    const newMeta = new Float32Array(size);
    const newGenes = new Uint8Array(size);
    const copyW = Math.min(old.cols, cols);
    const copyH = Math.min(old.rows, rows);
    for (let y = 0; y < copyH; y++) {
      const oldRow = y * old.cols;
      const newRow = y * cols;
      for (let x = 0; x < copyW; x++) {
        newGrid[newRow + x] = oldGrid[oldRow + x];
        newMeta[newRow + x] = oldMeta[oldRow + x];
        newGenes[newRow + x] = oldGenes[oldRow + x];
      }
    }
    gridRef.current = newGrid;
    backBufferRef.current = new Uint8Array(size);
    metaRef.current = newMeta;
    geneRef.current = newGenes;
    geneBackRef.current = new Uint8Array(size);
    dimsRef.current = { cols, rows };
    return true;
  }, [cols, rows]);

  // Apply a resize that happened while the sim was paused or between frames:
  // reallocates buffers (see ensureBuffers) and pushes the carried-over world
  // into React state so the canvas/HUD see the new dimensions immediately.
  // Stagnation hashes are cleared because indices changed meaning.
  useEffect(() => {
    if (ensureBuffers()) {
      historyRef.current = [];
      setGrid(new Uint8Array(gridRef.current));
      setIsStagnant(false);
    }
  }, [cols, rows, ensureBuffers]);

  const initGrid = useCallback((source = true) => {
    ensureBuffers(); // make sure gridRef matches the current cols x rows
    const newGrid = new Uint8Array(cols * rows);
    if (source === true) {
      fillRandom(
        { grid: newGrid, genes: geneRef.current, meta: metaRef.current, generation: 0 },
        0.85,
        rngRef.current
      );
    } else if (source instanceof Uint8Array && source.length === newGrid.length) {
      newGrid.set(source);
    } else if (source instanceof Uint8Array) {
      // Snapshot from a different world size: reject quietly, keep old world.
      return false;
    }
    gridRef.current.set(newGrid);
    geneRef.current.fill(0);
    metaRef.current.fill(0);
    metricsRef.current = [];
    setGrid(new Uint8Array(newGrid));
    setGeneration(0);
    setIsStagnant(false);
    historyRef.current = [];
    setLastMutation(null);
    setComputeMode(false);
    return true;
  }, [cols, rows, ensureBuffers]);

  const seedLaneFromBits = useCallback((bits) => {
    ensureBuffers();
    const newGrid = new Uint8Array(cols * rows);
    for (let x = 0; x < cols; x++) {
      const bit = bits[x] === '1' ? 1 : 0;
      newGrid[x] = bit;
      geneRef.current[x] = bit ? 180 : 0;
    }
    gridRef.current.set(newGrid);
    metaRef.current.fill(0);
    setGrid(new Uint8Array(newGrid));
    setGeneration(0);
    setIsStagnant(false);
    historyRef.current = [];
    setLastMutation(null);
    setLaneOutput('');
    setComputeMode(true);
  }, [cols, rows, ensureBuffers]);

  // Restore a previously saved grid snapshot: resets the state that must move
  // with it (heritage genes, metabolism, generation, stagnation, mutation pulse,
  // compute lane). History lives in the hook so undo can never touch the React
  // setters directly from the component tree.
  const reseed = useCallback((newSeed) => {
    rngRef.current = mulberry32((newSeed >>> 0) || 1);
    metricsRef.current = [];
    initGrid();
  }, [initGrid]);

  const exportMetricsCSV = useCallback(() => {
    const header = 'generation,rule,population,entropy,components,diversity,avgAge,fitness\n';
    const lines = metricsRef.current.map((m) =>
      [
        m.generation,
        m.rule,
        m.population,
        m.entropy.toFixed(6),
        m.components,
        m.diversity,
        m.avgAge.toFixed(4),
        m.score.toFixed(6),
      ].join(',')
    );
    return header + lines.join('\n') + (lines.length ? '\n' : '');
  }, []);

  const restoreSnapshot = useCallback((snapshot) => {
    if (!(snapshot instanceof Uint8Array)) return false;
    // Undo across a resize is meaningless (the old snapshot's row stride no
    // longer matches) — reject rather than scramble the world.
    if (snapshot.length !== gridRef.current.length) return false;
    metricsRef.current = [];
    gridRef.current.set(snapshot);
    geneRef.current.fill(0);
    metaRef.current.fill(0);
    setGrid(new Uint8Array(snapshot));
    setGeneration(0);
    setIsStagnant(false);
    historyRef.current = [];
    setLastMutation(null);
    setComputeMode(false);
    return true;
  }, []);

  // Seed the initial universe once, on mount. Resizes do NOT re-randomize —
  // they go through the preserving path in ensureBuffers.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    const t = setTimeout(() => initGrid(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const parsed = parseRules(ruleStr);
    // Keep the last known-good rules when the string is invalid (the UI
    // validates before calling setRuleStr, but the engine never trusts it).
    if (parsed) rules.current = parsed;
    ruleStrRef.current = ruleStr;
    const t = setTimeout(() => {
      setRuleHistory(prev => Array.from(new Set([...prev, ruleStr])).slice(-5));
    }, 0);
    return () => clearTimeout(t);
  }, [ruleStr]);

  const mutate = useCallback((forceCoord = null) => {
    const current = gridRef.current;
    const centerX = forceCoord ? forceCoord.x : Math.floor(rngRef.current() * (cols - 10)) + 5;
    const centerY = forceCoord ? forceCoord.y : Math.floor(rngRef.current() * (rows - 10)) + 5;

    const patternType = rngRef.current();
    const radius = Math.floor(rngRef.current() * 4) + 3;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = (centerX + dx + cols) % cols;
        const y = (centerY + dy + rows) % rows;
        const idx = y * cols + x;

        let shouldInfect = false;
        if (patternType > 0.6) {
          if (dx * dx + dy * dy < radius * radius) shouldInfect = rngRef.current() > 0.3;
        } else if (patternType > 0.3) {
          if (dx === 0 || dy === 0) shouldInfect = rngRef.current() > 0.2;
        } else {
          shouldInfect = rngRef.current() > 0.5;
        }

        if (shouldInfect) {
          current[idx] = 1;
          geneRef.current[idx] = Math.floor(rngRef.current() * 256);
          if (neuralMode) metaRef.current[idx] = 1.0;
        }
      }
    }

    setGrid(new Uint8Array(current));
    setIsStagnant(false);
    historyRef.current = [];
    setLastMutation({ x: centerX, y: centerY, time: Date.now() });
  }, [cols, rows, neuralMode]);

  const step = useCallback(() => {
    ensureBuffers();
    const world = {
      cols,
      rows,
      grid: gridRef.current,
      next: backBufferRef.current,
      meta: metaRef.current,
      genes: geneRef.current,
      geneBack: geneBackRef.current,
      generation: 0,
    };

    // Pure computation mode: the grid is the spacetime diagram of a 1D
    // elementary cellular automaton. Row 0 is the seed; every row below is
    // Rule 110 applied to the row above.
    if (computeMode) {
      const out = stepRule110(world);
      setLaneOutput(out);
      setGrid(new Uint8Array(world.grid));
      setIsStagnant(false);
      setGeneration(prev => prev + 1);
      return;
    }

    const { b, s } = rules.current;
    const driftRate = ruleStrRef.current !== 'B3/S23' ? 0.06 : 0.015;
    const hash = stepWorld(world, { neuralMode, b, s, driftRate, rng: rngRef.current });

    if (historyRef.current.includes(hash)) {
      setIsStagnant(true);
    } else {
      historyRef.current = [hash, ...historyRef.current].slice(0, 20);
      setIsStagnant(false);
    }

    setGrid(new Uint8Array(world.grid));
    setGeneration(prev => prev + 1);
  }, [cols, rows, neuralMode, computeMode, ensureBuffers]);

  const toggleCell = (x, y, radius = 0) => {
    if (computeMode) return;
    const current = gridRef.current;
    // Uniform brush: the state of the clicked cell decides for the whole
    // brush (click a live cell to erase, a dead cell to paint) — no more
    // independent per-cell toggling that produced checkerboard patches.
    const target = current[y * cols + x] > 0 ? 0 : 1;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = (x + dx + cols) % cols;
        const ny = (y + dy + rows) % rows;
        const idx = ny * cols + nx;
        current[idx] = target;
        geneRef.current[idx] = target ? Math.floor(rngRef.current() * 256) : 0;
        if (neuralMode) metaRef.current[idx] = target ? 1.0 : 0;
      }
    }
    setGrid(new Uint8Array(current));
  };

  const injectPattern = (pattern, x, y) => {
    if (computeMode) return;
    const current = gridRef.current;
    pattern.forEach((row, dy) => {
      row.forEach((val, dx) => {
        const nx = (x + dx + cols) % cols;
        const ny = (y + dy + rows) % rows;
        const idx = ny * cols + nx;
        const wasAlive = current[idx] > 0;
        current[idx] = val;
        if (val > 0) {
          geneRef.current[idx] = wasAlive ? geneRef.current[idx] : Math.floor(rngRef.current() * 256);
        } else {
          geneRef.current[idx] = 0;
        }
        if (neuralMode) metaRef.current[idx] = val > 0 ? 1.0 : 0;
      });
    });
    setGrid(new Uint8Array(current));
  };

  // For the Gardener: boost metabolic energy + lineage drift inside a region,
  // favouring metabolic births and fresh offspring around a colony.
  const amplifyRegion = useCallback((x, y, radius) => {
    const meta = metaRef.current;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = (x + dx + cols) % cols;
        const ny = (y + dy + rows) % rows;
        const idx = ny * cols + nx;
        if (gridRef.current[idx] > 0) {
          meta[idx] = 1.0;
          geneRef.current[idx] = driftGene(geneRef.current[idx], 0.02, rngRef.current);
        }
      }
    }
    setGrid(new Uint8Array(gridRef.current));
  }, [cols, rows]);

  // Metabolic presence under the cursor: hydrate the soil (meta) so metabolic births
  // are nudged around live cells; dead neighbours warm toward the birth brink.
  const fertilize = useCallback((x, y, radius) => {
    if (computeMode) return;
    const meta = metaRef.current;
    const current = gridRef.current;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = (x + dx + cols) % cols;
        const ny = (y + dy + rows) % rows;
        const idx = ny * cols + nx;
        if (current[idx] > 0) {
          meta[idx] = 1.0;
          geneRef.current[idx] = driftGene(geneRef.current[idx], 0.01, rngRef.current);
        } else if (meta[idx] < 0.35) {
          meta[idx] = 0.35;
        }
      }
    }
    setGrid(new Uint8Array(current));
  }, [cols, rows, computeMode]);

  // Sterilize a region: kill cells and flush their metabolism/gene.
  const suppress = useCallback((x, y, radius) => {
    if (computeMode) return;
    const current = gridRef.current;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = (x + dx + cols) % cols;
        const ny = (y + dy + rows) % rows;
        const idx = ny * cols + nx;
        current[idx] = 0;
        geneRef.current[idx] = 0;
        metaRef.current[idx] = 0;
      }
    }
    setGrid(new Uint8Array(current));
  }, [cols, rows, computeMode]);

  const measureFitness = useCallback(
    () => computeFitness({ cols, rows, grid: gridRef.current, genes: geneRef.current }),
    [cols, rows]
  );

  const recordRule = useCallback((rule, fitness) => {
    const rec = ruleStatsRef.current[rule] || { rule, avg: 0, samples: 0, adopted: false };
    rec.avg = rec.samples ? (rec.avg * rec.samples + fitness) / (rec.samples + 1) : fitness;
    rec.samples++;
    ruleStatsRef.current[rule] = rec;
  }, []);

  // Periodic fitness sampling for the currently active rule
  useEffect(() => {
    if (!active || generation === 0 || generation % 50 !== 0) return;
    const { score } = measureFitness();
    recordRule(ruleStr, score);
    const t = setTimeout(() => {
      setRuleStats(Object.values(ruleStatsRef.current).map(r => ({ ...r })));
    }, 0);
    return () => clearTimeout(t);
  }, [generation, active, ruleStr, measureFitness, recordRule]);

  // Cosmic radiation: occasionally a ruleset storm hits. Adoption is decided
  // on ROLLING-WINDOW MEANS of fitness (sampled every generation, tagged per
  // rule) rather than two instantaneous readings, so one lucky frame can't
  // steer selection. A storm needs at least MIN_SAMPLES samples on each side;
  // with too little data the pre-storm rule is kept (conservative revert).
  // Storms never pick the rule already in play.
  const MIN_STORM_SAMPLES = 5;
  const STORM_WINDOW = 40;
  const windowMean = (rule, max = STORM_WINDOW) => {
    const arr = fitnessWindowRef.current.filter(s => s.rule === rule).slice(-max);
    if (!arr.length) return null;
    const sum = arr.reduce((acc, s) => acc + s.score, 0);
    return { mean: sum / arr.length, n: arr.length };
  };

  useEffect(() => {
    if (!active || computeMode) return;

    // Every generation contributes a tagged fitness sample to the window,
    // and lands in the metrics audit log (CSV export).
    const metrics = measureFitness();
    const score = metrics.score;
    const window = fitnessWindowRef.current;
    window.push({ rule: ruleStr, score });
    if (window.length > 240) window.shift();
    metricsRef.current.push({ generation, rule: ruleStr, ...metrics });
    if (metricsRef.current.length > 5000) metricsRef.current.shift();

    if (stormPendingRef.current) return; // a storm is already in flight

    const chance = neuralMode ? 0.998 : 0.995;
    if (rngRef.current() <= chance) return;
    const oldRule = ruleStr;
    const randomRules = ['B36/S23', 'B3/S23', 'B2/S23', 'B34/S34', 'B3/S12345'].filter(r => r !== oldRule);
    const stormRule = randomRules[Math.floor(rngRef.current() * randomRules.length)];
    stormPendingRef.current = true;
    setRuleStr(stormRule);
    setTimeout(() => {
      const before = windowMean(oldRule);
      const after = windowMean(stormRule);
      const enough =
        before && after && before.n >= MIN_STORM_SAMPLES && after.n >= MIN_STORM_SAMPLES;
      const adopt = !!(enough && after.mean > before.mean);
      recordRule(oldRule, before ? before.mean : score);
      recordRule(stormRule, after ? after.mean : score);
      const stormRec = ruleStatsRef.current[stormRule];
      if (adopt) {
        if (stormRec) stormRec.adopted = true;
        setLastMutation({ x: Math.floor(cols / 2), y: Math.floor(rows / 2), time: Date.now() });
      } else {
        if (stormRec) stormRec.adopted = false;
        setRuleStr(oldRule);
      }
      setRuleStats(Object.values(ruleStatsRef.current).map(r => ({ ...r })));
      stormPendingRef.current = false;
    }, neuralMode ? 8000 : 5000);
  }, [active, computeMode, neuralMode, generation, ruleStr, measureFitness, recordRule, cols, rows]);

  useEffect(() => {
    if (!active) return;
    let lastTime = 0;
    const interval = 60;
    let rafId;
    const loop = (time) => {
      if (!lastTime) lastTime = time;
      if (time - lastTime >= interval) {
        step();
        lastTime = time;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [active, step]);

  return {
    grid, active, setActive, generation, isStagnant,
    lastMutation, initGrid, step, toggleCell, mutate,
    injectPattern, ruleStr, setRuleStr,
    neuralMode, setNeuralMode, ruleHistory,
    geneRef, gridRef, metaRef, amplifyRegion, fertilize, suppress,
    ruleStats, measureFitness,
    computeMode, setComputeMode, seedLaneFromBits, laneOutput,
    restoreSnapshot, reseed, exportMetricsCSV,
  };
};