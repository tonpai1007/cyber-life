import { describe, it, expect } from 'vitest';
import { mulberry32 } from './prng';
import { createWorld, stepWorld, computeFitness, parseRules } from './engine';

describe('engine determinism', () => {
  it('two worlds stepped with identical seeds stay byte-identical', () => {
    const a = createWorld(24, 18, 42, 0.85, mulberry32(42));
    const b = createWorld(24, 18, 42, 0.85, mulberry32(42));
    const rules = parseRules('B3/S23');
    const stepRngA = mulberry32(7);
    const stepRngB = mulberry32(7);
    for (let i = 0; i < 60; i++) {
      stepWorld(a, { b: rules.b, s: rules.s, driftRate: 0.015, rng: stepRngA });
      stepWorld(b, { b: rules.b, s: rules.s, driftRate: 0.015, rng: stepRngB });
    }
    expect(Buffer.from(a.grid).equals(Buffer.from(b.grid))).toBe(true);
    expect(Buffer.from(a.genes).equals(Buffer.from(b.genes))).toBe(true);
    expect(computeFitness(a).score).toBe(computeFitness(b).score);
  });

  it('different seeds diverge', () => {
    const a = createWorld(24, 18, 1, 0.85, mulberry32(1));
    const b = createWorld(24, 18, 2, 0.85, mulberry32(2));
    expect(Buffer.from(a.grid).equals(Buffer.from(b.grid))).toBe(false);
  });
});
