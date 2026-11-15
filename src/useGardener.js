import { useState, useEffect, useRef, useCallback } from 'react';

const GLIDER = [[0, 1, 0], [0, 0, 1], [1, 1, 1]];

const PHASE_LABELS = {
  GROWTH: 'OUTBREAK',
  COLLAPSE: 'COLLAPSE',
  STABLE: 'EQUILIBRIUM',
  CHAOS: 'CHAOS',
  ECHO: 'ECHO_LOOP',
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const linearSlope = (arr) => {
  const n = arr.length;
  if (n < 3) return 0;
  const mid = (n - 1) / 2;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const x = i - mid;
    const y = arr[i];
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const denom = n * sxx - sx * sx;
  return denom ? (n * sxy - sx * sy) / denom : 0;
};

// The GARDENER: an observer that actually observes. It builds a live model of
// the world (activity, population slope, connected colonies), files predictions
// and scores them, evolving a TRUST value that gates how aggressively it may
// intervene. Interventions are targeted (seed the largest colony, syringe a
// glider into an echo loop) instead of blind entropy pulses.
export const useGardener = (opts) => {
  const {
    gridRef, active, generation, isStagnant, isStorming, computeMode,
    cols, rows, injectPattern, mutate, amplifyRegion,
  } = opts;

  const [logs, setLogs] = useState(['AI_OBSERVER: INITIALIZED. ACQUIRING_LENS...']);
  const [trust, setTrust] = useState(0.5);
  const [phase, setPhase] = useState('EQUILIBRIUM');
  const [focus, setFocus] = useState(null);
  const [events, setEvents] = useState(0);

  const bump = useCallback(() => setEvents(e => e + 1), []);

  const genRef = useRef(generation);
  genRef.current = generation;
  const popHistRef = useRef([]);
  const predsRef = useRef([]);
  const prevGridRef = useRef(new Uint8Array(cols * rows));
  const lastActRef = useRef(0);
  const trustRef = useRef(0.5);
  const sizeRef = useRef(cols * rows);
  if (sizeRef.current !== cols * rows) {
    sizeRef.current = cols * rows;
    prevGridRef.current = new Uint8Array(cols * rows);
  }

  const addLog = useCallback((msg) => {
    setLogs(prev => [`[GEN_${String(genRef.current).padStart(6, '0')}] ${msg}`, ...prev].slice(0, 14));
  }, []);

  const locateLargestColony = useCallback((g) => {
    const visited = new Uint8Array(cols * rows);
    let best = null;
    let bestSize = 0;
    for (let si = 0; si < g.length; si++) {
      if (g[si] === 0 || visited[si]) continue;
      let size = 0, cx = 0, cy = 0;
      const stack = [si];
      visited[si] = 1;
      while (stack.length) {
        const idx = stack.pop();
        size++;
        const x = idx % cols;
        const y = Math.floor(idx / cols);
        cx += x; cy += y;
        for (let a = -1; a <= 1; a++) {
          for (let b = -1; b <= 1; b++) {
            if (a === 0 && b === 0) continue;
            const nx = (x + a + cols) % cols;
            const ny = (y + b + rows) % rows;
            const nidx = ny * cols + nx;
            if (g[nidx] > 0 && !visited[nidx]) {
              visited[nidx] = 1;
              stack.push(nidx);
            }
          }
        }
      }
      if (size > bestSize) {
        bestSize = size;
        best = { x: Math.round(cx / size), y: Math.round(cy / size), size };
      }
    }
    return best;
  }, [cols, rows]);

  useEffect(() => {
    if (!active || generation === 0 || computeMode) return;

    const g = gridRef.current;
    const N = cols * rows;
    const prev = prevGridRef.current;

    let pop = 0;
    let activity = 0;
    for (let i = 0; i < N; i++) {
      if (g[i] > 0) pop++;
      if ((g[i] > 0) !== (prev[i] > 0)) activity++;
    }
    prevGridRef.current.set(g);

    const hist = popHistRef.current;
    hist.push(pop);
    if (hist.length > 60) hist.shift();
    const slope = linearSlope(hist);

    let ph;
    if (isStagnant) {
      ph = 'ECHO';
    } else if (hist.length >= 12) {
      if (slope > 0.7) ph = 'GROWTH';
      else if (slope < -0.7) ph = 'COLLAPSE';
      else if (activity > N * 0.18) ph = 'CHAOS';
      else ph = 'STABLE';
    } else {
      ph = 'STABLE';
    }

    const t = setTimeout(() => {
      // 1. Score all due predictions and evolve TRUST
      for (const p of predsRef.current) {
        if (generation < p.due) continue;
        const err = Math.abs(pop - p.target) / Math.max(pop, p.target, 4);
        const good = err < 0.15;
        trustRef.current = clamp(trustRef.current + (good ? 0.06 : -0.06), 0.05, 0.95);
        setTrust(trustRef.current);
        addLog(
          `CORRECTIVE_LOOP: PRED_POP:${p.target} ACTUAL:${pop} ERR:${(err * 100).toFixed(0)}% ` +
          `${good ? 'HYPOTHESIS_VALIDATED' : 'MODEL_REVISED'} TRUST:${trustRef.current.toFixed(2)}`
        );
      }
      predsRef.current = predsRef.current.filter(p => generation < p.due);

      setPhase(PHASE_LABELS[ph]);

      const due = generation - lastActRef.current;
      const forced = (ph === 'COLLAPSE' && pop < N * 0.15) || (ph === 'ECHO' && due >= 15);
      if (due >= 40 || forced) {
        const colony = locateLargestColony(g);
        const tTrust = trustRef.current;
        const slopeNow = linearSlope(hist.slice(-40));
        const horizon = 25;
        const targetPop = Math.max(0, Math.round(pop + slopeNow * horizon));

        if (colony) {
          setFocus({ x: colony.x, y: colony.y, size: colony.size, at: Date.now(), phase: ph });
        } else if (pop === 0) {
          setFocus(null);
        }

        if (ph === 'COLLAPSE') {
          if (tTrust >= 0.3 && colony) {
            predsRef.current.push({ due: generation + horizon, target: targetPop });
            const radius = 3 + Math.round(tTrust * 4);
            amplifyRegion(colony.x, colony.y, radius);
            bump();
            addLog(
              `SEED_ANCHOR // COLLAPSE_HALT @(${colony.x},${colony.y}) RADIUS:${radius} ` +
              `METABOLIC:LOCALIZED PREDICT:${targetPop}`
            );
          } else {
            addLog('OBSERVER_RESTRAINT: TRUST_BELOW_SEED_THRESHOLD. PASSIVE_MODE.');
          }
        } else if (ph === 'ECHO') {
          if (tTrust >= 0.35) {
            predsRef.current.push({ due: generation + horizon, target: targetPop });
            const gx = colony ? (colony.x + 6) % cols : Math.floor(cols / 2);
            const gy = colony ? (colony.y + 6) % rows : Math.floor(rows / 2);
            injectPattern(GLIDER, gx, gy);
            bump();
            addLog(`ECHO_LOOP_DETECTED. SYRINGE_GLIDER_INJECTED @(${gx},${gy}).`);
          } else {
            addLog('OBSERVER_RESTRAINT: ECHO_ACCEPTED_MARGINALLY.');
          }
        } else if (ph === 'GROWTH') {
          predsRef.current.push({ due: generation + horizon, target: targetPop });
          bump();
          addLog(`CIVILIZATION_EXPANSION: POP:${pop} SLOPE:${slopeNow.toFixed(2)} PREDICT:${targetPop}.`);
        } else if (ph === 'STABLE') {
          if (tTrust >= 0.9) {
            mutate();
            bump();
            addLog('ENTROPY_TRUST_PEAK. PROACTIVE_SPARK_DEPLOYED.');
          } else {
            addLog('EQUILIBRIUM. OBSERVING_STEADY_STATE.');
          }
        } else {
          addLog('HIGH_TURBULENCE. INTERVENTION_SUPPRESSED. CHAOS_IS_DATA.');
        }

        lastActRef.current = generation;
      }

      if (isStorming) {
        bump();
        addLog('RADIATION_STORM: RULESET_FLUCTUATING. LINEAGE_PRESSURE_RISING.');
      }
    }, 0);

    return () => clearTimeout(t);
  }, [generation, active, computeMode, isStagnant, isStorming, gridRef,
      cols, rows, injectPattern, mutate, amplifyRegion, locateLargestColony, addLog, bump]);

  return { logs, trust, phase, focus, events };
};