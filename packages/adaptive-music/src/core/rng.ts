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

const K = { harmony: 0x27d4eb2f, melody: 0x165667b1, rhythm: 0xd3a2646c, motif: 0xb55a4f09 } as const;
export type StreamName = keyof typeof K;
export type Streams = { readonly [P in StreamName]: Rng };

export function createStreams(seed: number): Streams {
  const out = {} as Record<StreamName, Rng>;
  for (const k of Object.keys(K) as StreamName[]) out[k] = mulberry32(splitmix32((seed ^ K[k]) >>> 0));
  return out;
}

export function normal(rng: Rng): number {
  const u1 = 1 - rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
