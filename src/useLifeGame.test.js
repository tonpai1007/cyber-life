import { describe, it, expect } from 'vitest';
import { parseRules, isValidRuleStr, nextAlive, rule110Bit } from './useLifeGame';

describe('parseRules', () => {
  it('parses the canonical B3/S23 rule', () => {
    expect(parseRules('B3/S23')).toEqual({ b: [3], s: [2, 3] });
  });

  it('accepts lowercase letters and rulesets without letters', () => {
    expect(parseRules('b36/s23')).toEqual({ b: [3, 6], s: [2, 3] });
    expect(parseRules('3/23')).toEqual({ b: [3], s: [2, 3] });
  });

  it('dedupes repeated digits', () => {
    expect(parseRules('B33/S22')).toEqual({ b: [3], s: [2] });
  });

  it('accepts empty birth/survival lists (B2/S-style)', () => {
    expect(parseRules('B/S')).toEqual({ b: [], s: [] });
  });

  it('rejects neighbor counts above 8', () => {
    expect(parseRules('B9/S23')).toBeNull();
    expect(parseRules('B3/S89')).toBeNull();
  });

  it('rejects malformed strings', () => {
    expect(parseRules('')).toBeNull();
    expect(parseRules('B3')).toBeNull();
    expect(parseRules('B3/S23/X4')).toBeNull();
    expect(parseRules('B3/S2x')).toBeNull();
    expect(parseRules('garbage')).toBeNull();
    expect(parseRules(null)).toBeNull();
    expect(parseRules(undefined)).toBeNull();
  });

  it('isValidRuleStr mirrors parseRules', () => {
    expect(isValidRuleStr('B3/S23')).toBe(true);
    expect(isValidRuleStr('B36/S23')).toBe(true);
    expect(isValidRuleStr('B9/S23')).toBe(false);
    expect(isValidRuleStr('')).toBe(false);
  });
});

describe('nextAlive (classic rules)', () => {
  const life = parseRules('B3/S23');
  const base = { b: life.b, s: life.s, avgMeta: 0, neuralMode: false };

  it('births on exactly 3 neighbors', () => {
    expect(nextAlive({ ...base, cell: 0, neighbors: 3 })).toBe(true);
    expect(nextAlive({ ...base, cell: 0, neighbors: 2 })).toBe(false);
    expect(nextAlive({ ...base, cell: 0, neighbors: 4 })).toBe(false);
  });

  it('survives on 2 or 3 neighbors only', () => {
    expect(nextAlive({ ...base, cell: 4, neighbors: 2 })).toBe(true);
    expect(nextAlive({ ...base, cell: 4, neighbors: 3 })).toBe(true);
    expect(nextAlive({ ...base, cell: 4, neighbors: 1 })).toBe(false);
    expect(nextAlive({ ...base, cell: 4, neighbors: 4 })).toBe(false);
  });
});

describe('nextAlive (neural mode)', () => {
  const life = parseRules('B3/S23');
  const base = { b: life.b, s: life.s, neuralMode: true };

  it('keeps a live cell alive via high metabolic energy even off-rule', () => {
    expect(nextAlive({ ...base, cell: 5, neighbors: 5, avgMeta: 0.5 })).toBe(true);
    expect(nextAlive({ ...base, cell: 5, neighbors: 5, avgMeta: 0.4 })).toBe(false);
  });

  it('births a dead cell via metabolic surge with at least 2 neighbors', () => {
    expect(nextAlive({ ...base, cell: 0, neighbors: 2, avgMeta: 0.8 })).toBe(true);
    expect(nextAlive({ ...base, cell: 0, neighbors: 2, avgMeta: 0.6 })).toBe(false);
    expect(nextAlive({ ...base, cell: 0, neighbors: 1, avgMeta: 0.9 })).toBe(false);
  });
});

describe('rule110Bit', () => {
  // Rule 110 = 0b01101110: 111->0 110->1 101->1 100->0 011->1 010->1 001->1 000->0
  const table = [
    [0, 0, 0, 0],
    [0, 0, 1, 1],
    [0, 1, 0, 1],
    [0, 1, 1, 1],
    [1, 0, 0, 0],
    [1, 0, 1, 1],
    [1, 1, 0, 1],
    [1, 1, 1, 0],
  ];
  it.each(table)('pattern %i%i%i -> %i', (l, c, r, expected) => {
    expect(rule110Bit(l, c, r)).toBe(expected);
  });
});
