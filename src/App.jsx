import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useLifeGame, isValidRuleStr } from './useLifeGame';
import { parseSeedParam, randomSeed } from './prng';
import { useGardener } from './useGardener';
import { useSonifier } from './useSonifier';
import { SimulationRenderer } from './renderer';

const PATTERNS = {
  STILL: [
    { name: 'BLOCK', data: [[1, 1], [1, 1]] },
    { name: 'BEEHIVE', data: [[0, 1, 1, 0], [1, 0, 0, 1], [0, 1, 1, 0]] }
  ],
  OSCILLATOR: [
    { name: 'BLINKER', data: [[1, 1, 1]] },
    { name: 'PULSAR', data: [
      [0,0,1,1,1,0,0,0,1,1,1,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
      [1,0,0,0,0,1,0,1,0,0,0,0,1],
      [1,0,0,0,0,1,0,1,0,0,0,0,1],
      [1,0,0,0,0,1,0,1,0,0,0,0,1],
      [0,0,1,1,1,0,0,0,1,1,1,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,1,1,1,0,0,0,1,1,1,0,0],
      [1,0,0,0,0,1,0,1,0,0,0,0,1],
      [1,0,0,0,0,1,0,1,0,0,0,0,1],
      [1,0,0,0,0,1,0,1,0,0,0,0,1],
      [0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,1,1,1,0,0,0,1,1,1,0,0]
    ]}
  ],
  SPACESHIP: [
    { name: 'GLIDER', data: [[0, 1, 0], [0, 0, 1], [1, 1, 1]] },
    { name: 'LW_SHIP', data: [[0, 1, 1, 1, 1], [1, 0, 0, 0, 1], [0, 0, 0, 0, 1], [1, 0, 0, 1, 0]] }
  ],
  SPECIAL: [
    { name: 'GOSPER_GUN', data: [
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1],
      [0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1],
      [1,1,0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [1,1,0,0,0,0,0,0,1,0,0,0,1,0,1,1,0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
    ]}
  ]
};

const stringToBits = (text, length) => {
  const bits = [];
  for (const ch of text) {
    let c = ch.charCodeAt(0);
    for (let i = 7; i >= 0; i--) bits.push((c >> i) & 1);
    if (bits.length >= length) break;
  }
  while (bits.length < length) bits.push(0);
  return bits.slice(0, length).map(b => (b ? '1' : '0')).join('');
};

const App = () => {
  const hudRef = useRef(null);
  const containerRef = useRef();
  const canvasRef = useRef();
  const [dimensions, setDimensions] = useState({ cols: 120, rows: 80 });
  const [activePattern, setActivePattern] = useState(null);
  const [brushSize, setBrushSize] = useState(0);
  const [showSidebar, setShowSidebar] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [ruleDraft, setRuleDraft] = useState("B3/S23");
  const [ruleError, setRuleError] = useState(null);
  // Deterministic seed: ?seed=<n> reproduces a passive run exactly.
  const [seed, setSeed] = useState(() => parseSeedParam(window.location.search) ?? randomSeed());
  const [seedCopied, setSeedCopied] = useState(false);
  const cellSize = 10;
  const MAX_COLS = 160;
  const MAX_ROWS = 100;

  // Everything new is configurable; the original UI stays as the default look.
  const [config, setConfig] = useState({
    sound: true,
    gaze: true,
    mouseField: true,
    compactLogs: false,
    autoHide: false,
    particles: true,
    heatmap: true,
    chromatic: true,
    colonyWeb: true,
  });
  const setCfg = useCallback((key) => setConfig(c => ({ ...c, [key]: !c[key] })), []);
  const [reducedMotion, setReducedMotion] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const [showOnboarding, setShowOnboarding] = useState(() => !sessionStorage.getItem('cyber-life-visited'));
  const [keyFlash, setKeyFlash] = useState(null);
  const [hoveredPattern, setHoveredPattern] = useState(null);
  const patternPreviewRef = useRef(null);
  const historyRef = useRef([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const MAX_HISTORY = 20;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const motionEnabled = !reducedMotion;

  // Onboarding: hide on first interaction
  useEffect(() => {
    if (!showOnboarding) return;
    const dismiss = () => {
      setShowOnboarding(false);
      sessionStorage.setItem('cyber-life-visited', '1');
    };
    window.addEventListener('pointerdown', dismiss, { once: true });
    window.addEventListener('keydown', dismiss, { once: true });
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', dismiss);
    };
  }, [showOnboarding]);

  // Keyboard shortcut visual feedback
  useEffect(() => {
    if (!keyFlash) return;
    const id = setTimeout(() => setKeyFlash(null), 500);
    return () => clearTimeout(id);
  }, [keyFlash]);

  // Pattern preview
  useEffect(() => {
    const c = patternPreviewRef.current;
    if (!c) return;
    if (!hoveredPattern) {
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      return;
    }
    const data = hoveredPattern.data;
    const scale = Math.min(c.width / data[0].length, c.height / data.length);
    const offsetX = (c.width - data[0].length * scale) / 2;
    const offsetY = (c.height - data.length * scale) / 2;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(0, 243, 255, 0.15)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#00f3ff';
    for (let y = 0; y < data.length; y++) {
      for (let x = 0; x < data[y].length; x++) {
        if (data[y][x]) {
          ctx.fillRect(offsetX + x * scale, offsetY + y * scale, scale - 1, scale - 1);
        }
      }
    }
  }, [hoveredPattern]);

  const { 
    grid, active, setActive, generation, isStagnant, 
    lastMutation, initGrid, step, toggleCell, mutate,
    injectPattern, ruleStr, setRuleStr,
    neuralMode, setNeuralMode, ruleHistory,
    geneRef, gridRef, metaRef, amplifyRegion, fertilize, suppress,
    ruleStats,
    computeMode, seedLaneFromBits, laneOutput,
    restoreSnapshot, reseed, exportMetricsCSV,
  } = useLifeGame(dimensions.cols, dimensions.rows, seed);

  // Keep the draft in sync when the engine changes rulesets externally
  // (cosmic storms). Documented "adjust state during render" pattern —
  // no effect, no extra render pass.
  const [syncedRule, setSyncedRule] = useState(ruleStr);
  if (syncedRule !== ruleStr) {
    setSyncedRule(ruleStr);
    setRuleDraft(ruleStr);
    setRuleError(null);
  }

  // Snapshots taken before a resize are invalid (row stride changed) — drop
  // the stale undo trail. historyIndex is reconciled lazily inside `undo`.
  useEffect(() => {
    historyRef.current = [];
  }, [dimensions.cols, dimensions.rows]);

  // History management: snapshots of the grid; undo restores via the hook so it
  // can reset every coupled channel (genes, metabolism, compute mode) safely.
  const saveHistory = useCallback(() => {
    const snapshot = new Uint8Array(gridRef.current);
    const newHistory = historyRef.current.slice(0, historyIndex + 1);
    newHistory.push(snapshot);
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    historyRef.current = newHistory;
    setHistoryIndex(newHistory.length - 1);
  }, [gridRef, historyIndex]);

  const downloadMetrics = useCallback(() => {
    const csv = exportMetricsCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cyber-life-seed-${seed}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportMetricsCSV, seed]);

  const seedHex = seed.toString(16).toUpperCase().padStart(8, '0');

  const copySeedLink = useCallback(() => {
    const link = `${window.location.origin}${window.location.pathname}?seed=${seed}`;
    try {
      navigator.clipboard?.writeText(link);
      setSeedCopied(true);
      setTimeout(() => setSeedCopied(false), 1200);
    } catch {
      // Clipboard unavailable (non-secure context) — select-free fallback:
      window.prompt('Copy this link to reproduce the run:', link);
    }
  }, [seed]);

  const newSeed = useCallback(() => {
    const s = randomSeed();
    setSeed(s);
    reseed(s);
    try {
      window.history.replaceState(null, '', `?seed=${s}`);
    } catch {
      // Non-browser context — ignore.
    }
  }, [reseed]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const snapshot = historyRef.current[newIndex];
    if (!restoreSnapshot(snapshot)) {
      // Snapshot was taken at a different world size (resize) — drop the
      // stale trail instead of scrambling the world.
      historyRef.current = historyRef.current.slice(newIndex + 1);
      setHistoryIndex(historyRef.current.length - 1);
      return;
    }
    setHistoryIndex(newIndex);
  }, [historyIndex, restoreSnapshot]);

  const isStorming = ruleStr !== 'B3/S23';
  const population = useMemo(() => {
    let count = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i] > 0) count++;
    return count;
  }, [grid]);

  const gardener = useGardener({
    gridRef, active, generation, isStagnant, isStorming, computeMode,
    cols: dimensions.cols, rows: dimensions.rows,
    injectPattern, mutate, amplifyRegion,
  });

  const density = population / (dimensions.cols * dimensions.rows);
  const sonifier = useSonifier({
    enabled: config.sound,
    density,
    isStorming,
    event: gardener.events,
  });
  const unlock = sonifier.unlock;

  const gestureRef = useRef({ button: -1, startX: 0, startY: 0, moved: false });
  const lastCellRef = useRef({ x: -1, y: -1 });
  const lastActivityRef = useRef(0);
  const rendererRef = useRef(null);
  const popHistoryRef = useRef([]);
  const sparklineRef = useRef();
  const [matrixRain, setMatrixRain] = useState(false);
  const [decodeHover, setDecodeHover] = useState(false);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        const cols = Math.max(1, Math.min(Math.floor(width / cellSize), MAX_COLS));
        const rows = Math.max(1, Math.min(Math.floor(height / cellSize), MAX_ROWS));
        setDimensions(prev => (prev.cols === cols && prev.rows === rows ? prev : { cols, rows }));
      }
    };
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Track any interaction so auto-hide can decide the sidebar is idle
  useEffect(() => {
    lastActivityRef.current = Date.now();
    const touch = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, []);

  // Auto-hide the sidebar when it sits idle mid-run (configurable)
  useEffect(() => {
    if (!showSidebar || !active || !config.autoHide) return;
    const id = setInterval(() => {
      if (Date.now() - lastActivityRef.current > 10000) setShowSidebar(false);
    }, 2000);
    return () => clearInterval(id);
  }, [showSidebar, active, config.autoHide]);

  // Keyboard shortcuts: SPACE run, N METABOLIC, M sound, C computation, G gaze, L logs, H autohide, Z undo
  useEffect(() => {
    const onKey = (e) => {
      unlock();
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      if (e.key === ' ') {
        e.preventDefault();
        setActive(a => !a);
        setKeyFlash('SPACE');
      } else if (k === 'n') {
        setNeuralMode(m => !m);
        setKeyFlash('METABOLIC');
      } else if (k === 'm') {
        setCfg('sound');
        setKeyFlash('SOUND');
      } else if (k === 'c') {
        if (computeMode) {
          initGrid(true);
        } else {
          seedLaneFromBits(stringToBits(prompt || 'CYBER_LIFE', dimensions.cols));
          setActive(true);
        }
        setKeyFlash('COMPUTE');
      } else if (k === 'g') {
        setCfg('gaze');
        setKeyFlash('GAZE');
      } else if (k === 'l') {
        setCfg('compactLogs');
        setKeyFlash('LOGS');
      } else if (k === 'h') {
        setCfg('autoHide');
        setKeyFlash('AUTOHIDE');
      } else if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault();
        undo();
        setKeyFlash('UNDO');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [computeMode, prompt, dimensions, initGrid, seedLaneFromBits, setNeuralMode, setCfg, unlock, setActive, undo]);

  // Main Render Loop: the SimulationRenderer owns all canvas drawing and all
  // per-frame mutable state (particles, matrix rain, frame counter), so this
  // effect is just a thin rAF driver wired to the live simulation buffers.
  // The latest frame inputs are kept in a ref so the loop mounts ONCE and is
  // never torn down on renders (previously every gardener.focus / config
  // identity change cancelled and re-created the rAF loop).
  const rendererStateRef = useRef(null);
  useEffect(() => {
    rendererStateRef.current = {
      dimensions,
      grid: gridRef.current,
      genes: geneRef.current,
      meta: metaRef.current,
      config,
      neuralMode,
      motionEnabled,
      lastMutation,
      gardenerFocus: gardener.focus,
      isStorming,
      computeMode,
    };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!rendererRef.current) {
      rendererRef.current = new SimulationRenderer(canvas, { cellSize });
    }
    const renderer = rendererRef.current;
    let rafId;
    let renderErrorLogged = 0;
    const loop = () => {
      if (rendererStateRef.current) {
        try {
          renderer.update(rendererStateRef.current);
        } catch (err) {
          // Never let a bad frame kill the render loop — log the first few.
          if (renderErrorLogged < 5) {
            renderErrorLogged++;
            console.error('[cyber-life] renderer frame failed', err);
          }
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    popHistoryRef.current.push(population);
    if (popHistoryRef.current.length > 200) popHistoryRef.current.shift();
    const c = sparklineRef.current;
    if (!c) return;
    const parent = c.parentElement;
    if (!parent) return;
    const desiredWidth = parent.clientWidth - 48;
    const desiredHeight = 36;
    if (desiredWidth <= 0) return;
    if (c.width !== desiredWidth || c.height !== desiredHeight) {
      c.width = desiredWidth;
      c.height = desiredHeight;
    }
    const data = popHistoryRef.current;
    const cw = c.width;
    const ch = c.height;
    const cx = c.getContext('2d');
    cx.clearRect(0, 0, cw, ch);
    if (data.length < 2) return;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const stepX = cw / (data.length - 1);
    cx.beginPath();
    cx.strokeStyle = '#00f3ff';
    cx.lineWidth = 1;
    for (let i = 0; i < data.length; i++) {
      const px = i * stepX;
      const py = ch - ((data[i] - min) / range) * (ch - 2) - 1;
      if (i === 0) cx.moveTo(px, py); else cx.lineTo(px, py);
    }
    cx.stroke();
    const grad = cx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, 'rgba(0, 243, 255, 0.25)');
    grad.addColorStop(1, 'rgba(0, 243, 255, 0)');
    cx.lineTo((data.length - 1) * stepX, ch);
    cx.lineTo(0, ch);
    cx.closePath();
    cx.fillStyle = grad;
    cx.fill();
  }, [population]);

  const cellFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.floor((e.clientX - rect.left) / cellSize),
      y: Math.floor((e.clientY - rect.top) / cellSize),
    };
  };

  const inBounds = (x, y) => x >= 0 && x < dimensions.cols && y >= 0 && y < dimensions.rows;

  const handlePointerDown = (e) => {
    unlock();
    e.preventDefault();
    const g = gestureRef.current;
    g.button = e.button;
    g.startX = e.clientX;
    g.startY = e.clientY;
    g.moved = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = cellFromEvent(e);
    if (g.button === 2 && config.mouseField && inBounds(x, y)) {
      suppress(x, y, 0);
    }
  };

  const handlePointerMove = (e) => {
    const g = gestureRef.current;
    if (g.button < 0 || !config.mouseField) return;
    if (Math.abs(e.clientX - g.startX) > 4 || Math.abs(e.clientY - g.startY) > 4) g.moved = true;
    if (!g.moved) return;
    const { x, y } = cellFromEvent(e);
    if (x === lastCellRef.current.x && y === lastCellRef.current.y) return;
    lastCellRef.current = { x, y };
    if (inBounds(x, y)) {
      if (g.button === 0) fertilize(x, y, 2);
      else if (g.button === 2) suppress(x, y, 2);
    }
  };

  const handlePointerUp = (e) => {
    const g = gestureRef.current;
    if (g.button === 0 && !g.moved) {
      const { x, y } = cellFromEvent(e);
      if (inBounds(x, y)) {
        saveHistory();
        if (activePattern) {
          injectPattern(activePattern.data, x, y);
        } else {
          toggleCell(x, y, brushSize);
        }
      }
    }
    g.button = -1;
  };

  const handlePromptSubmit = (e) => {
    if (e.key === 'Enter') {
        const cmd = prompt.toUpperCase().trim();

        if (cmd.startsWith('R110 ')) {
            const bits = cmd.slice(5).replace(/[^01]/g, '');
            seedLaneFromBits(bits.padEnd(dimensions.cols, '0').slice(0, dimensions.cols));
            setActive(true);
        } else if (computeMode) {
            seedLaneFromBits(stringToBits(prompt, dimensions.cols));
        } else if (cmd === 'INFINITY') {
            initGrid(false);
            const cx = Math.floor(dimensions.cols / 2);
            const cy = Math.floor(dimensions.rows / 2);
            const data = [[0,1,1,1,0],[1,0,0,0,1],[0,1,1,1,0],[1,0,0,0,1],[0,1,1,1,0]];
            injectPattern(data, cx - 2, cy - 2);
        } else if (cmd === 'GALAXY') {
            initGrid(false);
            for (let i = 0; i < 5; i++) {
                const rx = Math.floor(Math.random() * dimensions.cols);
                const ry = Math.floor(Math.random() * dimensions.rows);
                mutate({ x: rx, y: ry });
            }
        } else if (cmd === 'STORM') {
            const newGrid = new Uint8Array(dimensions.cols * dimensions.rows);
            for (let i = 0; i < newGrid.length; i++) {
                if (Math.random() > 0.7) newGrid[i] = 1;
            }
            initGrid(newGrid);
        } else if (cmd === 'COLONY') {
            initGrid(false);
            const pts = [[10,10], [dimensions.cols-10, 10], [10, dimensions.rows-10], [dimensions.cols-10, dimensions.rows-10]];
            pts.forEach(p => mutate({ x: p[0], y: p[1] }));
        } else if (cmd === 'SIGNAL') {
            const newGrid = new Uint8Array(dimensions.cols * dimensions.rows);
            for (let x = 0; x < dimensions.cols; x++) {
                if (Math.random() > 0.5) {
                    const idx = Math.floor(dimensions.rows/2) * dimensions.cols + x;
                    newGrid[idx] = 1;
                }
            }
            initGrid(newGrid);
        } else {
            // "Evolve" from an arbitrary prompt: seed density derives from the
            // prompt (deterministic per prompt length), then one pulse.
            const newGrid = new Uint8Array(dimensions.cols * dimensions.rows);
            const seedDensity = (prompt.length % 5 + 1) * 0.02 + 0.05;
            for (let i = 0; i < newGrid.length; i++) {
                if (Math.random() < seedDensity) newGrid[i] = 1;
            }
            initGrid(newGrid);
            mutate();
        }

        setPrompt("");
    }
  };

  const streamText = useMemo(() => {
    const src = (gardener.logs && gardener.logs[0]) || 'WAITING_FOR_SIGNAL...';
    let hex = '';
    for (let i = 0; i < src.length; i++) {
      hex += src.charCodeAt(i).toString(16).padStart(2, '0') + ' ';
      if (hex.length > 60) break;
    }
    return hex.trim().toUpperCase();
  }, [gardener.logs]);

  useEffect(() => {
    const el = hudRef.current;
    if (!el) return;
       const cx = 50 + Math.min(density * 100, 20);
      const cy = neuralMode ? 70 : 30;
      const inner = density > 0.15 ? '#1a0a0a' : (neuralMode ? '#0a0514' : '#0a0a14');
      el.style.setProperty('--bg-x', `${cx}%`);
      el.style.setProperty('--bg-y', `${cy}%`);
      el.style.setProperty('--bg-inner', inner);
  }, [density, neuralMode, population]);

  useEffect(() => {
    const el = hudRef.current;
    if (!el) return;
    let color = 'rgba(0, 0, 0, 0.8)';
    if (isStorming) {
      color = `rgba(40, 0, 20, ${0.55 + 0.25 * Math.abs(Math.sin(Date.now() / 220))})`;
    } else if (density < 0.02) {
      color = 'rgba(0, 0, 30, 0.7)';
    }
    el.style.setProperty('--vignette-color', color);
    const id = setInterval(() => {
      let c = 'rgba(0, 0, 0, 0.8)';
      if (ruleStr !== 'B3/S23') {
        c = `rgba(40, 0, 20, ${0.55 + 0.25 * Math.abs(Math.sin(Date.now() / 220))})`;
      } else if (density < 0.02) {
        c = 'rgba(0, 0, 30, 0.7)';
      }
      el.style.setProperty('--vignette-color', c);
    }, 220);
    return () => clearInterval(id);
  }, [isStorming, density, ruleStr, population]);

  useEffect(() => {
    if (!matrixRain) return;
    const id = setTimeout(() => {
      if (rendererRef.current) rendererRef.current.matrixRain.active = false;
      setMatrixRain(false);
      initGrid(false);
    }, 800);
    return () => clearTimeout(id);
  }, [matrixRain, initGrid]);

  return (
    <div ref={hudRef} className={`hud-container scanlines ${isStorming ? 'storm-glitch' : ''} ${density < 0.02 ? 'entropy-low' : ''} ${neuralMode ? 'neural-active' : ''}`}>
      {showOnboarding && (
        <div className="onboarding-overlay" onClick={() => { setShowOnboarding(false); sessionStorage.setItem('cyber-life-visited', '1'); }}>
          <div className="onboarding-content">
            <h2>CYBER-LIFE // v5.0</h2>
            <div className="onboarding-hints">
              <div><span className="key">CLICK</span> SEED_CELLS</div>
              <div><span className="key">SPACE</span> RUN / PAUSE</div>
              <div><span className="key">N</span> METABOLIC_MODE</div>
              <div><span className="key">M</span> SOUND</div>
              <div><span className="key">CTRL+Z</span> UNDO</div>
            </div>
            <div className="onboarding-hint-bottom">CLICK_ANYWHERE_TO_BEGIN</div>
          </div>
        </div>
      )}
      {keyFlash && (
        <div className="key-flash" key={keyFlash}>
          {keyFlash}
        </div>
      )}
      <div className="vignette"></div>
      
      <header className="header panel">
        <div className="logo-group">
            <h1 className="glitch-text">{neuralMode ? 'CYBER-LIFE // METABOLIC_CA' : 'CYBER-LIFE // LIFE-LIKE_CA'}</h1>
            <span className="version">v5.0.0 // METABOLIC CORE</span>
        </div>
        <div className="observer-hud panel">
            <div className="observer-header">GARDENER // TRUST-GATED CONTROLLER</div>
            <div className="observer-logs">
                {(config.compactLogs ? gardener.logs.slice(0, 1) : gardener.logs).map((log, i) => (
                    <div key={i} className="log-entry" style={{ opacity: 1 - i * 0.1 }}>{log}</div>
                ))}
            </div>
        </div>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <button 
            className={`btn small ${showSidebar ? 'active' : ''}`} 
            onClick={() => setShowSidebar(!showSidebar)}
          >
            {showSidebar ? 'CLOSE_CORE' : 'DATA_CORE'}
          </button>
          <div className="status-group">
            <div className="status-engine">STABILITY: {isStagnant ? 'RECALIBRATING' : (neuralMode ? 'METABOLIC_FLOW' : 'OPTIMAL')}</div>
            <div className={`status-mode ${active ? 'active' : ''}`}>
               {active ? (neuralMode ? 'METABOLIC_MODE' : 'RUNNING_SIM') : 'STANDBY'}
            </div>
          </div>
        </div>
      </header>

      <div className="main-layout" role="main">
        <div
          className={`sidebar-backdrop ${showSidebar ? 'visible' : ''}`}
          onClick={() => setShowSidebar(false)}
          aria-label="Close sidebar"
        />
        <aside className={`sidebar panel scrollbar ${showSidebar ? 'open' : ''}`}>
          <div className="sidebar-header">GENETIC_SEQUENCER // LINEAGE</div>
          <div className="genetic-list">
              {ruleHistory.map((h, i) => {
                  const st = ruleStats.find(s => s.rule === h);
                  return (
                  <button key={i} className={`rule-card ${ruleStr === h ? 'active' : ''} ${st?.adopted ? 'adopted' : ''}`} onClick={() => setRuleStr(h)}>
                      <span>{h}</span>
                      <span className="rule-meta">
                          {st && st.samples > 0 ? st.avg.toFixed(2) : '--'}
                          {st?.adopted ? ' ✦' : ''}
                      </span>
                  </button>
                  );
              })}
          </div>

          <div className="sidebar-header" style={{ marginTop: '2rem' }}>METABOLIC_CORE // SECOND_CHANNEL</div>
          <div className="config-item">
              <button 
                className={`btn full ${neuralMode ? 'active' : ''}`} 
                onClick={() => setNeuralMode(!neuralMode)}
              >
                {neuralMode ? 'DEACTIVATE_METABOLIC' : 'ACTIVATE_METABOLIC'}
              </button>
          </div>

          <div className="sidebar-header" style={{ marginTop: '2rem' }}>COMPUTATION_LANE</div>
          <div className="config-item">
              <button 
                className={`btn full ${computeMode ? 'active' : ''}`} 
                onClick={() => {
                    if (computeMode) {
                        initGrid(true);
                    } else {
                        seedLaneFromBits(stringToBits('CYBER_LIFE', dimensions.cols));
                        setActive(true);
                    }
                }}
              >
                {computeMode ? 'EXIT_COMPUTATION' : 'ACTIVATE_RULE_110'}
              </button>
              {computeMode && <span className="config-hint">RULE_110 // TURING_COMPLETE SPACETIME</span>}
          </div>

          <div className="sidebar-header" style={{ marginTop: '2rem' }}>CONFIG_CORE // SYSTEM</div>
          <div className="config-grid">
              <button className={`btn ${config.sound ? 'active' : ''}`} onClick={() => setCfg('sound')}>SOUND</button>
              <button className={`btn ${config.gaze ? 'active' : ''}`} onClick={() => setCfg('gaze')}>GAZE</button>
              <button className={`btn ${config.mouseField ? 'active' : ''}`} onClick={() => setCfg('mouseField')}>MOUSE_FIELD</button>
              <button className={`btn ${config.compactLogs ? 'active' : ''}`} onClick={() => setCfg('compactLogs')}>COMPACT_LOGS</button>
              <button className={`btn ${config.autoHide ? 'active' : ''}`} onClick={() => setCfg('autoHide')}>AUTOHIDE</button>
          </div>
          <div className="config-grid" style={{ marginTop: '0.8rem' }}>
              <button className={`btn ${config.particles ? 'active' : ''}`} onClick={() => setCfg('particles')}>PARTICLES</button>
              <button className={`btn ${config.heatmap ? 'active' : ''}`} onClick={() => setCfg('heatmap')}>HEATMAP</button>
              <button className={`btn ${config.chromatic ? 'active' : ''}`} onClick={() => setCfg('chromatic')}>CHROMATIC</button>
              <button className={`btn ${config.colonyWeb ? 'active' : ''}`} onClick={() => setCfg('colonyWeb')}>COLONY_WEB</button>
          </div>
          <span className="config-hint">KEYS: SPACE=RUN M=SOUND N=METABOLIC C=COMPUTE G=GAZE L=LOGS H=AUTOHIDE</span>

          <div className="sidebar-header" style={{ marginTop: '2rem' }}>SEED_GENERATOR</div>
          <div className="config-item">
            <label>EVOLVE_FROM_PROMPT:</label>
            <input 
              type="text" 
              placeholder="E.g. 'Swirl', 'Infinity'..."
              className="terminal-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handlePromptSubmit}
            />
          </div>

           <div className="sidebar-header" style={{ marginTop: '2rem' }}>DATA_CORE // PATTERNS</div>
           {hoveredPattern && (
             <div className="pattern-preview-wrapper">
               <canvas ref={patternPreviewRef} width={120} height={60} className="pattern-preview" />
               <div className="pattern-preview-label">{hoveredPattern.name}</div>
             </div>
           )}
           {Object.entries(PATTERNS).map(([category, patterns]) => (
             <div key={category} className="pattern-category">
               <div className="category-label">{category}</div>
               <div className="pattern-grid">
                 {patterns.map(p => (
                   <button 
                     key={p.name} 
                     className={`pattern-btn ${activePattern?.name === p.name ? 'active' : ''}`}
                     onClick={() => setActivePattern(activePattern?.name === p.name ? null : p)}
                     onMouseEnter={() => setHoveredPattern(p)}
                     onMouseLeave={() => setHoveredPattern(null)}
                   >
                     {p.name}
                   </button>
                 ))}
               </div>
             </div>
           ))}
          
          <div className="sidebar-header" style={{ marginTop: '2rem' }}>ENGINE_CONFIG</div>
          <div className="config-item">
            <label>RULESET:</label>
            <input
              type="text"
              value={ruleDraft}
              onChange={(e) => {
                const v = e.target.value;
                setRuleDraft(v);
                if (isValidRuleStr(v)) {
                  // Valid rulesets go straight into the engine; invalid ones
                  // only update the draft + error and the engine keeps the
                  // last known-good rule (never a silent dead universe).
                  setRuleStr(v);
                  setRuleError(null);
                } else {
                  setRuleError('EXPECTED FORMAT B…/S…, DIGITS 0-8 — E.G. B3/S23');
                }
              }}
              onBlur={() => {
                if (!isValidRuleStr(ruleDraft)) setRuleDraft(ruleStr);
                setRuleError(null);
              }}
              className={`terminal-input ${ruleError ? 'input-error' : ''}`}
              spellCheck={false}
            />
            {ruleError && <span className="config-hint error-hint">{ruleError}</span>}
          </div>
          <div className="config-item">
            <label>BRUSH_SIZE: {brushSize}</label>
            <input
              type="range" min="0" max="5"
              value={brushSize}
              onChange={(e) => {
                setBrushSize(parseInt(e.target.value));
                setActivePattern(null);
              }}
            />
          </div>

          <div className="sidebar-header" style={{ marginTop: '2rem' }}>DATA_CORE // METRICS</div>
          <div className="config-item">
            <button className="btn full" onClick={downloadMetrics}>EXPORT_FITNESS_CSV</button>
            <span className="config-hint">GEN,RULE,POP,ENTROPY,COMPONENTS,GENE_DIVERSITY,AVG_AGE,FITNESS</span>
            <span className="config-hint">PER-GENERATION AUDIT LOG FOR OFFLINE ANALYSIS</span>
          </div>
        </aside>

<main ref={containerRef} className="canvas-container">
          <div className="scan-beam"></div>
          <canvas
            id="game-canvas"
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onContextMenu={(e) => e.preventDefault()}
            style={{ cursor: activePattern ? 'cell' : 'crosshair' }}
          />
          
          <div className="stats-panel panel">
            <div className="stat-item">
              <span className="stat-label">GENERATION:</span>
              <span className="stat-value">{String(generation).padStart(7, '0')}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">POPULATION:</span>
              <span className="stat-value">{population}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">MODE:</span>
              <span className="stat-value">{neuralMode ? 'METABOLIC' : 'CLASSIC_LIFE'}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">GARDENER:</span>
              <span className="stat-value">{gardener.phase} // TRUST {(gardener.trust * 100).toFixed(0)}%</span>
            </div>
            {computeMode && (
                <div className="stat-item">
                  <span className="stat-label">RULE_110 OUT:</span>
                  <span className="stat-value lane-out">{laneOutput}</span>
                </div>
            )}
            {isStagnant && (
               <div className="warning-msg">
                  WARNING: ENTROPY_MINIMUM. GARDENER_LENS_LOCKED.
               </div>
            )}
            <canvas ref={sparklineRef} className="sparkline" />
          </div>

          <div className="controls-overlay panel">
            <button className={`btn ${active ? 'active' : ''}`} onClick={() => setActive(!active)}>
              {active ? 'PAUSE' : 'EXECUTE'}
            </button>
            <button className="btn" onClick={step} disabled={active}>STEP</button>
            <button className="btn" onClick={() => { saveHistory(); mutate(); }}>PULSE</button>
            <button className="btn" onClick={() => initGrid(true)}>RANDOM</button>
            <button className="btn" onClick={() => {
              saveHistory();
              if (motionEnabled) {
                if (rendererRef.current) rendererRef.current.startMatrixRain();
                setMatrixRain(true);
              } else {
                initGrid(false);
              }
            }}>WIPE</button>
          </div>
        </main>
      </div>

      <footer className="footer">
        <div className="footer-content">
          <span>LIFE-LIKE CA // METABOLIC CORE v5.0.0</span>
          <div className={`data-stream ${decodeHover ? 'decoded' : ''}`}
            data-text={streamText}
            onMouseEnter={() => setDecodeHover(true)}
            onMouseLeave={() => setDecodeHover(false)}>
          {decodeHover ? ((gardener.logs && gardener.logs[0]) || 'WAITING_FOR_SIGNAL...') : ''}
        </div>
          <div className="seed-box" title="Deterministic seed — a passive run with this seed reproduces exactly">
            <span className="seed-label">SEED:</span>
            <span className="seed-hex">0x{seedHex}</span>
            <button className="seed-btn" onClick={copySeedLink}>{seedCopied ? 'COPIED' : 'COPY_LINK'}</button>
            <button className="seed-btn" onClick={newSeed}>NEW_SEED</button>
          </div>
          <span className="port">PORT: 1337 // LOCALHOST</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
