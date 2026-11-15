import { describe, it, expect } from 'vitest';
import { mulberry32, hashString, parseSeedParam, randomSeed } from './prng';

describe('mulberry32', () => {
  it('produces a deterministic sequence from a seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('stays in [0, 1)', () => {
    const r = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('hashString', () => {
  it('is deterministic', () => {
    expect(hashString('CYBER_LIFE')).toBe(hashString('CYBER_LIFE'));
  });
  it('differs for different strings', () => {
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});

describe('parseSeedParam', () => {
  it('parses numeric seeds', () => {
    expect(parseSeedParam('?seed=1234')).toBe(1234);
    expect(parseSeedParam('?seed=0')).toBe(0);
  });
  it('hashes non-numeric seeds deterministically', () => {
    expect(parseSeedParam('?seed=CYBER_LIFE')).toBe(hashString('CYBER_LIFE'));
  });
  it('returns null when missing or malformed', () => {
    expect(parseSeedParam('')).toBeNull();
    expect(parseSeedParam('?other=1')).toBeNull();
    expect(parseSeedParam('?seed=')).toBeNull();
  });
});

describe('randomSeed', () => {
  it('returns a uint32', () => {
    const s = randomSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });
});
