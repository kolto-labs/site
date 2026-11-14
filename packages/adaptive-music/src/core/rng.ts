export type Rng = () => number;

export function splitmix32(x: number): number {
  let a = (x + 0x9e3779b9) | 0;
  a = Math.imul(a ^ (a >>> 16), 0x21f0aaad);
  a = Math.imul(a ^ (a >>> 15), 0x735a2d97);
  return (a ^ (a >>> 15)) >>> 0;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Counter-based randomness (design §6.10). A draw is addressed by its musical position
 * (stream id, bar, layer, slot...), not by how many draws came before it, so a draw added
 * in one place shifts nothing anywhere else.
 */
export function h32(...k: number[]): number {
  let a = 0x2545f491;
  for (const x of k) a = splitmix32((a ^ x) >>> 0);
  return a;
}

export const u = (...k: number[]): number => h32(...k) / 4294967296;

/** A short sequential stream that starts at a counter address, for draws that come in a burst. */
export const at = (...k: number[]): Rng => mulberry32(h32(...k));

export function normal(rng: Rng): number {
  const u1 = 1 - rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
