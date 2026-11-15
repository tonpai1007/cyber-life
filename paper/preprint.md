# Ruleset-Level Selection in a Life-Like Cellular Automaton Shows Structural Gains Without Diversity Gains: A Null-Model Ablation

*Preliminary manuscript (v1, 2026-11-15). Not peer reviewed. Work-in-progress — please cite nothing yet.*

**Authors:** [To be completed]
**Correspondence:** [To be completed]
**Keywords:** cellular automata; artificial life; evolution of rules; fitness-gated selection; null model

## Abstract

We study *Cosmic Storms* — a mechanism built into the open-source
simulation [Cyber-Life](https://github.com/tonpai1007/cyber-life) in which a
Life-like cellular automaton occasionally switches its own update ruleset and,
optionally, adopts a fitter replacement. Using a null model of identical
random rule switching without fitness-gating, we ran 30 paired seeds × 3
conditions × 400 generations and measured population, density entropy,
connected components, gene diversity, and composite fitness each generation.
Storm mechanisms in general dominate fixed physics (p ≪ 10⁻¹⁰ for population
and diversity vs B3/S23). Fitness-gating, however, does **not** increase
lineage diversity over random switching (Welch t = 0.24, df = 58.0, p ≈ 0.81),
while it substantially increases connected structure (+36.9 components,
t = 6.19, p ≈ 5 × 10⁻⁸) and composite fitness (+0.45, t = 4.01, p ≈ 2 × 10⁻⁴).
We conclude that ruleset-level selection optimizes *coherence*, not *variety*,
and that its contribution over random perturbation is structural rather than
diversifying. Code, data, and reproduction commands are included.

## 1. Introduction

Life-like cellular automata (LLCA) — Conway's B3/S23 being the canonical
instance — sit near a boundary between order and chaos that sustains emergent,
long-lived structures [1, 2, 3]. Small rule variations change this balance
dramatically: HighLife (B36/S23) replicates where Life does not [2]. A natural
question for artificial life is whether a system that *selects* among its own
rulesets can sustain richer dynamics than the incumbent or a random switcher.

Cyber-Life implements such a mechanism ("Cosmic Storms"): the running ruleset
is occasionally mutated; the mutated ruleset is adopted if its **rolling-window
mean fitness** exceeds the incumbent's over a minimum of five samples, and is
otherwise reverted. Every cell additionally carries a slowly drifting 8-bit
*gene* (±1 per generation, 2% random reset), allowing lineage diversity to be
measured directly.

This work asks a single, narrow question: **does fitness-gating the storm
increase the emergent richness of the world, beyond what random switching
already provides?** We answer with a paired-seed null-model ablation.

## 2. Related Work

Conway's Game of Life demonstrated unbounded complexity from four local rules
[1]. Wolfram's classification of cellular automata placed life-like rules in
Class IV — long transients and complex, localized structures [2]. Langton's
λ parameter quantified the phase transition to computational universality, and
argued computation peaks at the edge of chaos [3]. Packard showed rules could
*evolve* under selection pressure toward the complex regime [4]. More recently,
Mordvintsev et al. demonstrated that neural cellular automata can learn
morphogenetic behaviors by gradient descent [5], and continuous kernels
(Lenia) revived interest in biological-looking emergent organization [6]. Our
work differs in that the *rule* — not the cell state — is the unit of
selection, and selection acts via a rolling-window fitness comparison with no
learned components.

## 3. Methods

### 3.1 Engine

Toroidal 65 × 41 grid (matching the interactive build's minimum sensible
window); `Uint8Array` cell ages (min(age+1, 10)); parallel `Float32Array`
metabolic channel and 8-bit gene channel; double-buffered update; deterministic
seeded PRNG (mulberry32). The UI and the headless sweeper share the same engine
module (`src/engine.js`), so measurements reflect the deployed system.

### 3.2 Update rules

Classic mode: a cell with n neighbors survives (dies) iff n ∈ S (∉); a dead
cell is born iff n ∈ B.

**Fitness:** `2·H(p) + min(C/30, 1.5) + min(D/40, 1.5) + min(A/4, 1.5)`, where
`H(p)` is binary entropy of live-density p, `C` the number of 8-connected
components (fewer than ~30 contribute meaningfully), `D` the number of distinct
gene values among live cells, `A` mean cell age.

**Storm (gated):** every 50 generations a uniformly drawn alternative ruleset
from {B36/S23, B3/S23, B2/S23, B34/S34, B3/S12345} replaces the incumbent.
If the rolling-window mean fitness (window = 40 samples, ≥ 5 per rule required)
of the challenger exceeds the incumbent's, it is adopted; otherwise the
universe reverts to the pre-storm rule. **Storm (null):** identical storms,
challenges are always adopted. **Fixed:** B3/S23 always.

**Drift:** gene drift rate is 0.015 under B3/S23, 0.06 under any storm rule.

### 3.3 Protocol

- 30 paired seeds (1000–1029); identical initial worlds across conditions;
- 400 generations per world; metrics logged every generation;
- summaries computed over the last 100 generations (tail mean);
- Welch t-tests (two-tailed) for gated vs null; 95% CIs across seeds;
- full traces retained for inspection.

Initial gene values are all zero (all lineages descend from one ancestral
gene); diversity therefore measures drift-cone width, not speciation.

## 4. Results

Table 1. Tail-mean (last 100 generations) ± 95% CI, n = 30 paired seeds.

| Metric | fixed | storm-gated | storm-null |
|---|---|---|---|
| Population | 154.6 ± 19.0 | 907.7 ± 68.5 | 826.1 ± 100.1 |
| Entropy | 0.217 ± 0.020 | 0.622 ± 0.040 | 0.561 ± 0.034 |
| Components | 25.4 ± 1.9 | **80.4 ± 8.6** | 43.5 ± 7.6 |
| Gene diversity | 37.5 ± 3.1 | 70.9 ± 6.7 | 69.7 ± 6.6 |
| Composite fitness | 3.43 ± 0.11 | **4.74 ± 0.17** | 4.29 ± 0.13 |

Storms dominate fixed physics on every metric (population t ≈ 11, diversity
t ≈ 17, both vs fixed; p ≪ 10⁻¹⁰). Gated vs null: population not significant
(t = 1.30, df = 51.2, p ≈ 0.20); **diversity not significant (t = 0.24,
df = 58.0, p ≈ 0.81)**; **components very highly significant (t = 6.19,
df = 57.0, p ≈ 5 × 10⁻⁸)**; **fitness very highly significant (t = 4.01,
df = 54.6, p ≈ 2 × 10⁻⁴)**. See `docs/figures/diversity_curves.svg` for mean
diversity trajectories (gated ≈ null throughout, both ≫ fixed) and
`docs/figures/lineage_dendrogram.svg` for the gene-cluster structure at
generation 400 (seed 1001).

## 5. Discussion

The null model is the result. Random rule switching already buys most of the
"richness" one would naively attribute to selection: the mutational pressure
itself keeps the universe from crystallizing. Fitness-gating is not useless —
its effect is **structural**: worlds under gating maintain ~1.85× as many
connected components and a higher composite fitness (driven partly by the
connectivity and longevity terms). In short, the gate assembles the same kinds
of lineages into more coherent colonies; it does not diversify them.

Two interpretations follow. First, an optimization reading: the fitness
function weighs coherence heavily (components + entropy + longevity), and
gating tractably maximizes what it measures. Second, a dynamics reading:
LLCA dynamics under any non-B3/S23 rule in the storm set are simply livelier,
and the gate's role is to avoid the (real) failure modes — e.g., extinction
under B2/S23 — rather than to invent diversity.

For practitioners: if you want lineage variety, amplify gene drift, not the
gate; if you want elegant, persistent, high-fitness textures, the gate earns
its keep.

## 6. Limitations

Single grid size and one seed budget; forced (not chance-driven) storm cadence;
founder genes all zero; gene drift and ruleset change co-varying (not crossed
independently); hand-designed fitness; no comparison against a neutral-drift
control nor against evolved non-LLCA rules; multiple comparisons not
Bonferroni-corrected (the two headline effects survive it); 30 seeds only.

## 7. Conclusion

In this system, ruleset-level selection outperforms random switching on
composite fitness and connectivity, but not on diversity. Selection on physics
builds coherence, not variety. The result is modest, honest, and
reproducible — and is offered as a cautionary template for other
"evolution of rules" claims: always run the null model.

## Acknowledgements

[To be completed]

## Data & code availability

Repository: <https://github.com/tonpai1007/cyber-life>. Reproduce with
`npm install && npm run sweep && node tools/dendrogram.mjs`; traces and summary
land in `tools/out/` (gitignored) and `docs/sweep_summary.json`.

## References

1. Conway, J.H. (1970). *The Game of Life*. Mathematics Magazine, 45(2).
2. Wolfram, S. (1984). Computation theory of cellular automata. *Communications in Mathematical Physics*, 96(1), 15–57. Also Wolfram (2002), A New Kind of Science, Wolfram Media.
3. Langton, C.G. (1990). Computation at the edge of chaos: Phase transitions and emergent computation. In C.G. Langton (Ed.), *Artificial Life II* (pp. 12–37). Addison-Wesley.
4. Packard, N. (1988). Adaptation toward the edge of chaos. In J.A.S. Kelso, A.J. Mandell, & M.F. Shlesinger (Eds.), *Dynamic Patterns in Complex Systems* (pp. 293–301). World Scientific.
5. Mordvintsev, A., Randazzo, E., Niklasson, E., & Levin, M. (2020). Growing neural cellular automata. *Distill*, 5(2), e23.
6. Chan, B.W.C. (2019). Lenia: Biology of artificial life. *Complex Systems*, 28(3), 251–286.
7. Poundstone, W. (1985). *The Recursive Universe: Cosmic Complexity and the Limits of Scientific Knowledge*. William Morrow. (Accessible history of Conway's Life and emergent complexity.)
