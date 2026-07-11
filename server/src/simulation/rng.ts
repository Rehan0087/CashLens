// Deterministic PRNG (mulberry32) so seeded demo data is reproducible for judges.
export function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rand: () => number, min: number, max: number) {
  return min + rand() * (max - min);
}

export function randInt(rand: () => number, min: number, max: number) {
  return Math.floor(randRange(rand, min, max + 1));
}

export function choice<T>(rand: () => number, items: T[]): T {
  return items[randInt(rand, 0, items.length - 1)];
}

// Box-Muller transform for a normal distribution sample.
export function randNormal(rand: () => number, mean: number, stddev: number) {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}
