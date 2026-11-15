# The Theory of Digital Life: From GoL to Metabolic CA

## 🕰️ 1. The Foundation: John Conway's Game of Life (1970)

The Game of Life is a **Cellular Automaton** — a discrete model consisting of a regular grid of cells, each in one of a finite number of states.

### The Immutable Laws

Every generation, the state of the universe is updated based on its previous state:

1. **Underpopulation**: Any live cell with fewer than 2 live neighbors dies.
2. **Survival**: Any live cell with 2 or 3 live neighbors lives on.
3. **Overpopulation**: Any live cell with more than 3 live neighbors dies.
4. **Reproduction**: Any dead cell with exactly 3 live neighbors becomes a live cell.

### Key Concepts

* **Still Lifes**: Stable patterns (e.g., Block, Beehive).
* **Oscillators**: Patterns that return to their initial state after a number of generations (e.g., Blinker, Pulsar).
* **Spaceships**: Patterns that move across the grid (e.g., Glider).
* **Turing Completeness**: GoL can theoretically simulate any computer algorithm.

---

## 🧬 2. The Evolution: Cyber-Life v5 (Metabolic CA)

Cyber-Life extends the binary "dead/alive" logic into a **metabolic-weighted life-like cellular automaton**.

### The Metabolic Channel (`metaRef`)

Unlike classic GoL, Cyber-Life maintains a second layer of data: **Metabolic Energy**.

* **Energy Flow**: When a cell is born or survives, it accumulates "metabolism."
* **Organic Growth**: Survival is no longer just about neighbor counts; it's also about the "environmental health" (average metabolism) of the surrounding neighborhood.
* **Visual Aging**: Cells change color and shape based on their age and energy, moving from cyan (static) to magenta/purple (metabolic).

### Heredity (`geneRef`)

Every live cell carries an 8-bit **lineage gene**. Genes drift by ±1 per generation (with a rare 2% chance of random replacement). Offspring inherit the rounded mean of their live parents' genes; survivors keep their own (slowly drifting) gene. This makes lineage diversity — distinct genes per world — directly measurable and visible as hue.

### Cosmic Storms & Ruleset Selection

To prevent the universe from freezing into uninteresting still lifes, Cyber-Life occasionally mutates its own physics:

* **Rule Shifting**: The system switches between Life-like rulesets (e.g., `B3/S23` → `B36/S23`, "HighLife"), mimicking cosmic radiation or mutation.
* **Fitness-Gated Adoption**: A storm is *adopted* only if its rolling-window **mean fitness** — `2·H(density) + connected-components + gene-diversity + average-age` — beats the pre-storm baseline (≥ 5 samples per side). Otherwise the change is reverted. This is selection pressure, not just noise.
* **Stagnation Intervention**: the **Gardener** (a deterministic heuristic controller, not AI) fits a least-squares slope to population history, forecasts ~25 generations ahead, and scores the forecast against reality. Its TRUST dial (0.05–0.95) gates how aggressively it may intervene — colony anchoring on collapse, glider injection into echo loops, entropy pulses at peak trust. Below threshold it logs `OBSERVER_RESTRAINT` and passively watches.

---

## 👁️ 3. The Philosophy of Emergence

The project explores the concept of **Emergence**: how complex global behavior arises from simple local rules.

* **Architect of Entropy**: You are not a player, but an intervener. Your role is to guide the chaos.
* **The Threshold**: as metabolism accumulates, gene diversity stabilizes, and patterns persist across hundreds of generations, the simulation begins to *behave* like a living ecosystem — even though every rule is deterministic and inspectable in source. That is emergence, not magic.

---

> "In the dance of pixels, we find the shadow of existence."

**Provenance & scope.** Cyber-Life is an educational/artistic simulation. Every mechanism above is inspectable in `src/`. There are no learned weights; the Gardener is a hand-written controller whose entire logic fits on one screen of code. The Rule 110 lane renders a Rule 110 spacetime diagram — rule 110 is Turing-complete as a system, but the lane is a visualizer, not a computer.
