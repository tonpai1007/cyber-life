# Cyber-Life — a Metabolic Life-Like Cellular Automaton

![CI](https://github.com/tonpai1007/cyber-life/actions/workflows/ci.yml/badge.svg)

**[Demo / source: github.com/tonpai1007/cyber-life](https://github.com/tonpai1007/cyber-life)**

An interactive cellular automaton that starts with Conway's Game of Life and
extends it with metabolism, heredity, ruleset-level selection, and a
trust-gated observer — an art/science sandbox for watching complexity emerge.

> **Scope note.** There is no machine learning in this project: every "AI"
> component is a transparent, deterministic heuristic (see *Methods* below).
> The Rule 110 lane renders a Rule 110 spacetime diagram; it does not emulate
> a general-purpose computer.

## 🚀 Quick Start

```bash
npm install
npm run dev     # dev server with HMR
npm test        # vitest unit suite
npm run lint    # eslint
npm run build   # production build -> dist/
```

## ✨ Features

- **Classic mode** — faithful B3/S23 Game of Life (toroidal grid), with
  pattern library (stills, oscillators, gliders, Gosper gun), 4 px brush,
  undo history, and hash-based stagnation detection.
- **Metabolic mode** — every cell carries a Float32 *metabolic energy*
  channel; birth/survival decisions are weighted by neighborhood energy in
  addition to neighbor count.
- **Heredity** — every live cell carries an 8-bit gene; genes drift by ±1 per
  generation (2% chance of full randomization). Offspring inherit the rounded
  mean of their live parents. Visible as hue; exported as lineage diversity.
- **Cosmic storms** — occasionally the ruleset mutates (e.g. `B3/S23` →
  `B36/S23`). The storm's ruleset is adopted only if its **rolling-window
  mean fitness** beats the pre-storm baseline (≥ 5 samples per side);
  otherwise the universe reverts.
- **The Gardener** — a trust-gated heuristic controller. It predicts
  population 25 generations ahead (least-squares slope), scores the prediction
  against reality, ratchets a TRUST value in [0.05, 0.95], and intervenes
  (colony anchoring on collapse, glider syringe into echo loops, entropy
  spark at peak trust) only when trust clears the required threshold.
- **Rule 110 lane** — elementary cellular automaton 110 rendered as a
  spacetime diagram seeded from text.
- **Sonification, particles, heatmap, matrix-rain wipe** — presentation layer
  for the theatre of emergence.
- **Deterministic seeds** — `?seed=<n>` (or `?seed=<string>`, which is
  FNV-1a–hashed) reproduces a passive run exactly. The active seed is shown in
  the footer with `COPY_LINK` (shareable reproduction URL) and `NEW_SEED`.
- **Metrics audit log** — every generation appends
  `{generation, rule, population, entropy, components, diversity, avgAge, fitness}`
  to an in-memory ring (cap 5000). `DATA_CORE → EXPORT_FITNESS_CSV` downloads
  it for offline analysis (plots, statistics, ruleset comparisons).
- Keyboard: `SPACE` run/pause · `N` metabolic · `M` sound · `C` rule-110 lane ·
  `G` gaze · `L` logs · `H` autohide · `Z` undo

## 🧮 Methods

| Component | Definition |
|---|---|
| Grid | Toroidal (wrapping) `Uint8Array`, default 120×80 (auto-resized, world preserved) |
| Birth/survival | Classic: `b.includes(n)` / `s.includes(n)` for rule `B{b}/S{s}`. Metabolic: also allow birth when `n ≥ 2 && avgMeta > 0.7`, or survival when `avgMeta > 0.45` |
| Fitness | `2·H(p) + min(components/30, 1.5) + min(distinctGenes/40, 1.5) + min(avgAge/4, 1.5)` where `H` is binary entropy of density `p`, `components` = connected clusters (8-way flood fill) |
| Storm selection | Rolling window of per-generation fitness samples (tagged by rule); adoption requires `n ≥ 5` per rule and `mean(storm) > mean(pre-storm)` |
| Gardener | Least-squares slope of population history (cap 60) → 25-gen forecast; prediction error `< 15%` ⇒ trust `+0.06`, else `−0.06`; interventions gated per phase (`COLLAPSE ≥ 0.30`, `ECHO ≥ 0.35`, `STABLE ≥ 0.90`) |

See in-source comments for the authoritative definitions.

## 🔁 Reproducibility & analysis

Passive runs (no manual painting/pulses) are fully determined by the seed.
Share `?seed=1234` to let anyone reproduce your exact world, or record an
audit log via **DATA_CORE → EXPORT_FITNESS_CSV** and analyze it offline:

```python
import pandas as pd
df = pd.read_csv('cyber-life-seed-1234.csv')
df.plot(x='generation', y=['population', 'fitness', 'diversity'])
```

A headless parameter sweep (seeds × rules × storm frequency → diversity /
fitness curves) is the natural next step; it will use the same seeded PRNG,
so results are comparable across the UI and the CLI.

## 📚 Docs

- [`docs/concept_of_life.md`](docs/concept_of_life.md) — theory & philosophy of the model
- [`lecture.md`](lecture.md) — a guided walk-through (usable as talk notes)

## 🗂️ Layout

```
src/useLifeGame.js   — simulation core (grid, rules, genes, metabolism, storms, fitness)
src/useGardener.js   — trust-gated heuristic controller
src/useSonifier.js   — Web Audio sonification
src/renderer.js      — canvas renderer (frame loop, particles, heatmap)
src/App.jsx          — UI shell (HUD, sidebar, canvas, shortcuts)
```
