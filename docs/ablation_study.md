# Ablation Study: Fitness-Gated Ruleset Selection vs Random Switching

**Question.** Does Cyber-Life's cosmic-storm mechanism — fitness-gated adoption
of a mutated ruleset — produce meaningfully different long-term behavior than
the obvious null model (the same random rule switches, adopted blindly)?

**Hypothesis (pre-registered informally).** Fitness-gated adoption sustains
higher lineage diversity and fitness than random rule switching. Spoiler: the
first half of that is **not supported**. The second half is.

## Design

| Parameter | Value |
|---|---|
| Grid | 65 × 41, toroidal |
| Seeds | 1000…1029 (n = 30, paired across conditions) |
| Generations | 400 per world |
| Storm clock | forced every 50 generations (in the UI storms are chance-driven; a fixed clock controls exposure) |
| Storm rule set | `B36/S23`, `B3/S23`, `B2/S23`, `B34/S34`, `B3/S12345` (identical to app) |
| Gated condition | storm rule adopted only if its rolling-window **mean** fitness (last 40 samples, ≥ 5 per rule) beats the incumbent's; else revert |
| Null condition (`storm-null`) | same storms, always adopted |
| Control (`fixed`) | `B3/S23` only, no storms |
| Fitness | `2·H(p) + min(components/30, 1.5) + min(distinctGenes/40, 1.5) + min(avgAge/4, 1.5)` |
| Drift | 0.015 in `B3/S23`, 0.06 under any storm rule (mirrors app) |
| Metrics | per generation: population, entropy, components, diversity, avgAge, fitness |

Implementation: `tools/sweep.mjs`; the sweep and the UI share the same engine
(`src/engine.js`), so the measured system **is** the app system.
Traces are written to `tools/out/sweep_traces.csv` (gitignored); a structured
summary is in `docs/sweep_summary.json`.

## Results (tail-mean of last 100 generations, mean ± 95% CI, n = 30)

| Metric | fixed | storm-gated | storm-null |
|---|---|---|---|
| Population | 154.6 ± 19.0 | **907.7 ± 68.5** | 826.1 ± 100.1 |
| Entropy | 0.217 ± 0.020 | 0.622 ± 0.040 | 0.561 ± 0.034 |
| Components | 25.4 ± 1.9 | **80.4 ± 8.6** | 43.5 ± 7.6 |
| Diversity (distinct genes) | 37.5 ± 3.1 | 70.9 ± 6.7 | 69.7 ± 6.6 |
| Fitness | 3.43 ± 0.11 | **4.74 ± 0.17** | 4.29 ± 0.13 |

Welch t-tests, gated vs null (two-tailed):

| Metric | t | df | Δ | p (approx.) |
|---|---|---|---|---|
| Diversity | 0.24 | 58.0 | +1.2 | ≈ 0.81 (n.s.) |
| Components | **6.19** | 57.0 | +36.9 | ≈ 5 × 10⁻⁸ |
| Fitness | **4.01** | 54.6 | +0.45 | ≈ 2 × 10⁻⁴ |
| Population | 1.30 | 51.2 | +81.7 | ≈ 0.20 (n.s.) |

## Findings

1. **Storms, in any form, dominate fixed physics.** Population, entropy,
   connectivity, diversity, and fitness are all higher under storms than under
   `B3/S23` alone — the universe stays lively instead of crystallizing into
   still lifes.
2. **Fitness-gating does NOT increase lineage diversity over random
   switching** (t = 0.24, n.s.). Both storm conditions sustain ≈ 70 distinct
   genes vs ≈ 38 fixed. Diversity is carried by the storm mechanism itself,
   not by the selection layer on top of it.
3. **Fitness-gating buys structure, not spread.** Gated worlds have ~1.85× the
   connected components (80.4 vs 43.5, p ≈ 5 × 10⁻⁸) and higher composite
   fitness (4.74 vs 4.29, p ≈ 2 × 10⁻⁴). Selection pressure assembles the
   population into coherent, fitness-optimal colonies rather than more kinds of
   genes.
4. The drift-pressure term (storm rule → 4× drift rate) is likely the main
   diversity driver; this experiment cannot separate it from the ruleset
   difference alone (both changed together) — a follow-up ablation should cross
   rule and drift rate independently.

## Honest interpretation

- The gate is real selection: it demonstrably rejects worse rulesets and keeps
  better ones, and the surviving configuration is measurably more coherent.
- But **"selection" here does not act on genomes**; it acts on *physics*. The
  fitness function measures world-level properties (entropy, connectivity,
  longevity, gene variety), so gating maximizes coherence, not variety.
- If your goal is diversity, crank drift — if your goal is elegant, persistent
  blooms, the gate works. The UI presents the gate as "evolution"; the data
  says it is closer to **structured metastability**.
- Small effect sizes on population (t = 1.30, n.s.) — the headline win is
  structural.

## Limitations

- Single grid size (65 × 41), single generation budget (400), single drift
  profile — no scaling analysis yet.
- Gene values are all initialized to 0, so lineages all descend from one
  ancestral gene; "diversity" measures drift-cone width, not true speciation.
  A future engine revision should seed founder genes randomly.
- Forced storms every 50 generations ≠ the app's chance-based cadence; treat
  absolute magnitudes as protocol-specific.
- 30 paired seeds; no correction for multiple comparisons. With 4 follow-up
  metrics at α = 0.05, expect occasional flukes — the two headline effects
  (components, fitness) are far beyond that threshold.
- Fitness is hand-designed, not learned; results inherit its biases.

## Reproducing

```bash
npm run sweep          # ~35 s, writes tools/out/sweep_traces.csv, docs/sweep_summary.json, docs/figures/*.svg
node tools/dendrogram.mjs   # lineage SVG (docs/figures/lineage_dendrogram.svg)
```

Traces CSV columns: `condition,seed,generation,rule,population,entropy,components,diversity,avgAge,fitness`.
