// Seeded PRNG helpers so chips / distractors are reproducible in tests.

/** mulberry32: returns a function yielding floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash to a 32-bit seed. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Fisher-Yates on a copy. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Shuffle that never returns the original order (when at least two distinct items exist). */
export function shuffleDifferent<T>(items: readonly T[], rng: () => number): T[] {
  if (new Set(items).size < 2) return items.slice();
  for (let i = 0; i < 20; i++) {
    const out = shuffle(items, rng);
    if (out.some((x, k) => x !== items[k])) return out;
  }
  // Deterministic fallback: rotate by one.
  return [...items.slice(1), items[0]!];
}

/** Pick `n` distinct items. */
export function sample<T>(items: readonly T[], n: number, rng: () => number): T[] {
  return shuffle(items, rng).slice(0, n);
}
