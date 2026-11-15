// Seeded pseudo-random number generation.
//
// mulberry32 is a small, fast, well-distributed 32-bit PRNG — plenty for a
// cellular automaton and fully deterministic from a 32-bit seed, which is
// what makes experimental runs reproducible (`?seed=1234`).

export const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// FNV-1a — turns an arbitrary seed string into a 32-bit integer.
export const hashString = (str) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const randomSeed = () => (Math.random() * 0x100000000) >>> 0;

// Parse a seed from a URL query string. Accepts ?seed=<unsigned 32-bit int>
// or ?seed=<arbitrary string> (hashed). Returns null when absent/invalid.
export const parseSeedParam = (search) => {
  try {
    const params = new URLSearchParams(search);
    const raw = params.get('seed');
    if (raw === null || raw === '') return null;
    if (/^\d+$/.test(raw)) {
      const n = Number(raw);
      return Number.isFinite(n) ? (Math.floor(n) >>> 0) : null;
    }
    return hashString(raw);
  } catch {
    return null;
  }
};
