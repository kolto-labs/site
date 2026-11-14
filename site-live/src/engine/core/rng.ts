/** A uniform generator on [0, 1). */
export type Rng = () => number;

/**
 * One splitmix32 step: a 32-bit mix of `x` (golden-ratio increment, then the
 * 0x21f0aaad / 0x735a2d97 finaliser). Frozen: shared seeds depend on it.
 */
export function splitmix32(x: number): number {
  let a = (x + 0x9e3779b9) | 0;
  a = Math.imul(a ^ (a >>> 16), 0x21f0aaad);
  a = Math.imul(a ^ (a >>> 15), 0x735a2d97);
  return (a ^ (a >>> 15)) >>> 0;
}

/** mulberry32. Bit-identical to `mulberry` in hero/sprites.ts. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const STREAM_K = {
  world: 0x9e3779b9,
  events: 0x85ebca6b,
  latent: 0xc2b2ae35,
  harmony: 0x27d4eb2f,
  melody: 0x165667b1,
  rhythm: 0xd3a2646c,
  motif: 0xb55a4f09,
  motion: 0xfd7046c5,
} as const;

export type StreamName = keyof typeof STREAM_K;
export type Streams = { readonly [K in StreamName]: Rng };

export function streamSeed(seed: number, name: StreamName): number {
  return splitmix32((seed ^ STREAM_K[name]) >>> 0);
}

export function stream(seed: number, name: StreamName): Rng {
  return mulberry32(streamSeed(seed, name));
}

/** One independent generator per purpose, so one stream's draw count never shifts another. */
export function createStreams(seed: number): Streams {
  const out = {} as Record<StreamName, Rng>;
  for (const k of Object.keys(STREAM_K) as StreamName[]) out[k] = stream(seed, k);
  return out;
}

/** Box–Muller, two uniform draws per call. */
export function normal(rng: Rng): number {
  const u1 = 1 - rng(); // (0, 1]: never log(0)
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const U32 = 4294967296;

/** uint32 → 1–7 Crockford base32 characters, upper case, no padding. */
export function encodeSeed(seed: number): string {
  let n = seed >>> 0;
  let s = '';
  do {
    s = B32[n % 32] + s;
    n = Math.floor(n / 32);
  } while (n > 0);
  return s;
}

/** 1–7 Crockford base32 characters → uint32, or null when invalid. I and L read as 1, O as 0. */
export function decodeSeed(code: string): number | null {
  if (typeof code !== 'string' || code.length < 1 || code.length > 7) return null;
  let v = 0;
  for (let i = 0; i < code.length; i++) {
    let c = code[i].toUpperCase();
    if (c === 'I' || c === 'L') c = '1';
    else if (c === 'O') c = '0';
    const d = B32.indexOf(c);
    if (d < 0) return null;
    v = v * 32 + d;
  }
  return v < U32 ? v : null;
}

/** The `seed` query parameter of a search string, decoded; null when absent or invalid. */
export function parseSeedParam(search: string): number | null {
  const code = new URLSearchParams(search).get('seed');
  return code === null ? null : decodeSeed(code);
}

export function randomSeed(): number {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') return c.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * U32) >>> 0;
}
