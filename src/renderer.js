// SimulationRenderer: owns all canvas drawing for Cyber-Life.
// The render loop reads the mutable simulation buffers (grid/genes/meta) via
// refs every frame, so it is kept outside the React component tree and driven
// by a single requestAnimationFrame loop in App. All per-frame mutable state
// (previous grid, particles, matrix rain, frame counter) lives here instead of
// on the component, so App.jsx stops being a 1000-line render monolith.

const SECTORS = ['VEGA', 'ZETA', 'ORION', 'KEPLER', 'AQUILA', 'SIRAC'];

const sectorName = (f) =>
  `${SECTORS[((f.x + f.y) % SECTORS.length + SECTORS.length) % SECTORS.length]}-${String(
    (f.x * 13 + f.y * 7) % 99
  ).padStart(2, '0')}`;

export class SimulationRenderer {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cellSize = opts.cellSize;
    this.prevGrid = new Uint8Array(0);
    this.particles = [];
    this.matrixRain = { active: false, t0: 0, cols: null };
    this.frame = 0;
  }

  update(state) {
    const ctx = this.ctx;
    const {
      dimensions, grid, genes, meta,
      config, neuralMode, motionEnabled,
      lastMutation, gardenerFocus, isStorming,
      computeMode,
    } = state;
    const { cols, rows } = dimensions;
    const cellSize = this.cellSize;
    const g = grid;
    const canvas = this.canvas;

    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;

    // Trail overlay (Cyber-Trailing)
    ctx.fillStyle = neuralMode ? 'rgba(2, 5, 10, 0.15)' : 'rgba(2, 2, 5, 0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Metabolic heatmap (neural mode)
    if (neuralMode && config.heatmap && motionEnabled) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const idx = y * cols + x;
          const m = meta[idx];
          if (m > 0.05) {
            const hue = 180 + m * 120;
            ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${Math.min(m * 0.3, 0.3)})`;
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
          }
        }
      }
    }

    // Draw grid cells
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        const age = grid[idx];
        if (age > 0) {
          const gene = genes[idx];
          const hue = gene > 0 ? ((gene * 360) / 256) : (neuralMode ? 280 : 190);
          const alpha = Math.min(0.4 + age * 0.1, 1);

          ctx.shadowBlur = age > 1 ? (neuralMode ? 15 : 5) : 0;
          ctx.shadowColor = `hsla(${hue}, 100%, 50%, ${alpha})`;
          ctx.fillStyle = `hsla(${hue}, 100%, 65%, ${alpha})`;

          ctx.beginPath();
          if (neuralMode) {
            ctx.arc(x * cellSize + cellSize / 2, y * cellSize + cellSize / 2, (cellSize / 2) - 1, 0, Math.PI * 2);
          } else {
            ctx.roundRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2, 2);
          }
          ctx.fill();

          if (age > 2) {
            const rings = age >= 5 ? 2 : 1;
            ctx.lineWidth = 1;
            for (let r = 1; r <= rings; r++) {
              const ringAlpha = 0.35 / r;
              ctx.strokeStyle = `hsla(${hue}, 100%, 75%, ${ringAlpha})`;
              ctx.beginPath();
              const inset = 2 + r * 2;
              const ringRadius = (cellSize / 2) - inset;
              // Guard against negative/zero radius to prevent arc() errors.
              if (ringRadius <= 0) break;
              if (neuralMode) {
                ctx.arc(x * cellSize + cellSize / 2, y * cellSize + cellSize / 2, ringRadius, 0, Math.PI * 2);
              } else {
                ctx.roundRect(x * cellSize + inset, y * cellSize + inset, cellSize - inset * 2, cellSize - inset * 2, 1);
              }
              ctx.stroke();
            }
          }

          if (isStorming && config.chromatic && motionEnabled && age > 2) {
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            if (neuralMode) {
              ctx.arc(x * cellSize + cellSize / 2 - 2, y * cellSize + cellSize / 2, (cellSize / 2) - 1, 0, Math.PI * 2);
            } else {
              ctx.roundRect(x * cellSize - 1, y * cellSize + 1, cellSize - 2, cellSize - 2, 2);
            }
            ctx.fill();

            ctx.fillStyle = '#0000ff';
            ctx.beginPath();
            if (neuralMode) {
              ctx.arc(x * cellSize + cellSize / 2 + 2, y * cellSize + cellSize / 2, (cellSize / 2) - 1, 0, Math.PI * 2);
            } else {
              ctx.roundRect(x * cellSize + 3, y * cellSize + 1, cellSize - 2, cellSize - 2, 2);
            }
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        } else {
          // Subtle "Neural Fabric" dots
          if ((x + y) % 4 === 0) {
            ctx.fillStyle = neuralMode ? 'rgba(157, 0, 255, 0.05)' : 'rgba(0, 243, 255, 0.03)';
            ctx.fillRect(x * cellSize + 4, y * cellSize + 4, 1, 1);
          }
        }
      }
    }

    // Birth / death particle bursts
    if (config.particles && motionEnabled) {
      if (this.prevGrid.length !== grid.length) {
        this.prevGrid = new Uint8Array(grid);
      }
      const prev = this.prevGrid;
      const newParticles = [];
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] > 0 && !prev[i]) {
          const x = i % cols;
          const y = Math.floor(i / cols);
          const hue = genes[i] > 0 ? ((genes[i] * 360) / 256) : (neuralMode ? 280 : 190);
          for (let p = 0; p < 4; p++) {
            newParticles.push({
              x: x * cellSize + cellSize / 2,
              y: y * cellSize + cellSize / 2,
              vx: (Math.random() - 0.5) * 3,
              vy: (Math.random() - 0.5) * 3,
              life: 1.0,
              hue,
              size: Math.random() * 2 + 0.5,
            });
          }
        }
      }
      prev.set(grid);
      this.particles.push(...newParticles);
      if (this.particles.length > 400) {
        this.particles = this.particles.slice(-400);
      }

      this.particles = this.particles.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.025;
        if (p.life <= 0) return false;
        ctx.globalAlpha = p.life * 0.8;
        ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, 1)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        return true;
      });
      ctx.globalAlpha = 1;
    }

    // Colony connection web (throttled to every 15 frames)
    if (config.colonyWeb && motionEnabled && !computeMode && this.frame % 15 === 0) {
      const colonies = this._findColonies(g, cols, rows);
      colonies.sort((a, b) => b.size - a.size);
      const topColonies = colonies.slice(0, 4);
      if (topColonies.length > 1) {
        const now = Date.now();
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 12]);
        for (let i = 0; i < topColonies.length; i++) {
          for (let j = i + 1; j < topColonies.length; j++) {
            const a = topColonies[i];
            const b = topColonies[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 50) {
              const pulse = 0.15 + 0.15 * Math.sin(now / 600 + i * 1.3 + j * 0.7);
              ctx.strokeStyle = `rgba(0, 243, 255, ${pulse})`;
              ctx.lineDashOffset = -now / 80;
              ctx.beginPath();
              ctx.moveTo(a.x * cellSize + cellSize / 2, a.y * cellSize + cellSize / 2);
              ctx.lineTo(b.x * cellSize + cellSize / 2, b.y * cellSize + cellSize / 2);
              ctx.stroke();
            }
          }
        }
        ctx.setLineDash([]);
      }
    }

    // Neural pulse animation
    if (lastMutation) {
      const elapsed = Date.now() - lastMutation.time;
      if (elapsed < 1200) {
        const progress = elapsed / 1200;
        const radius = progress * 300;
        const alpha = 1 - progress;

        ctx.beginPath();
        ctx.arc(lastMutation.x * cellSize, lastMutation.y * cellSize, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 243, 255, ${alpha * 0.4})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(lastMutation.x * cellSize, lastMutation.y * cellSize, radius * 0.7, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 0, 255, ${alpha * 0.2})`;
        ctx.stroke();
      }
    }

    // Matrix rain on wipe
    if (this.matrixRain.active && motionEnabled) {
      this._drawMatrixRain();
    }

    // Gardener's Gaze: pulsing reticle + codename on the colony being watched
    if (config.gaze && gardenerFocus) {
      const f = gardenerFocus;
      const now = Date.now();
      const age = now - f.at;
      if (age < 4000) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 180);
        const rad = 18 + pulse * 10;
        const fade = 0.35 * (1 - age / 4000);
        const cx = f.x * cellSize;
        const cy = f.y * cellSize;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 243, 255, ${fade})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - rad - 5, cy); ctx.lineTo(cx + rad + 5, cy);
        ctx.moveTo(cx, cy - rad - 5); ctx.lineTo(cx, cy + rad + 5);
        ctx.stroke();
        ctx.fillStyle = `rgba(0, 243, 255, ${Math.min(0.9, fade * 2.5)})`;
        ctx.font = '10px monospace';
        const name = `${sectorName(f)} // ${f.phase}`;
        ctx.fillText(name, cx + rad + 6, cy - 6);
      }
    }

    this.frame++;
  }

  startMatrixRain() {
    this.matrixRain = { active: true, t0: Date.now(), cols: null };
  }

  _findColonies(g, cols, rows) {
    const visited = new Uint8Array(cols * rows);
    const colonies = [];
    for (let si = 0; si < g.length; si++) {
      if (g[si] === 0 || visited[si]) continue;
      let size = 0, cx = 0, cy = 0;
      const stack = [si];
      visited[si] = 1;
      while (stack.length) {
        const idx = stack.pop();
        size++;
        cx += idx % cols;
        cy += Math.floor(idx / cols);
        for (let a = -1; a <= 1; a++) {
          for (let b = -1; b <= 1; b++) {
            if (a === 0 && b === 0) continue;
            const nx = ((idx % cols) + a + cols) % cols;
            const ny = (Math.floor(idx / cols) + b + rows) % rows;
            const nidx = ny * cols + nx;
            if (g[nidx] > 0 && !visited[nidx]) {
              visited[nidx] = 1;
              stack.push(nidx);
            }
          }
        }
      }
      if (size > 20) {
        colonies.push({ x: Math.round(cx / size), y: Math.round(cy / size), size });
      }
    }
    return colonies;
  }

  _drawMatrixRain() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const elapsed = Date.now() - this.matrixRain.t0;
    const dur = 800;
    if (!this.matrixRain.cols) {
      const cols = Math.max(8, Math.floor(canvas.width / 18));
      this.matrixRain.cols = [];
      for (let i = 0; i < cols; i++) {
        this.matrixRain.cols.push({
          speed: 8 + Math.random() * 14,
          y: Math.random() * -canvas.height,
        });
      }
    }
    ctx.font = '14px monospace';
    ctx.fillStyle = `rgba(0, 243, 255, ${1 - elapsed / dur})`;
    const mcols = this.matrixRain.cols;
    for (let i = 0; i < mcols.length; i++) {
      const c = mcols[i];
      c.y += c.speed;
      if (c.y > canvas.height + 40) c.y = -40;
      const x = i * 18;
      const ch = '0123456789ABCDEF'[Math.floor(Math.random() * 16)];
      ctx.fillText(ch, x, c.y);
    }
  }
}

export { sectorName };
