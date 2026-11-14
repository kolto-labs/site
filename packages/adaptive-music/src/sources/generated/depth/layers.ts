import { splitmix32 } from '../../../core/rng';

export type LayerId = 'drone' | 'pad' | 'bass' | 'kick' | 'arp' | 'hats' | 'ticks' | 'pulse' | 'glint' | 'melody';
export const IDS: readonly LayerId[] = ['drone', 'pad', 'bass', 'kick', 'arp', 'hats', 'ticks', 'pulse', 'glint', 'melody'];
export const LONG: readonly LayerId[] = ['arp', 'ticks', 'pulse', 'glint'];

export const h32 = (...k: number[]): number => {
  let h = 0x70a9;
  for (const x of k) h = splitmix32((h ^ x) >>> 0);
  return h;
};
export const u = (...k: number[]): number => h32(...k) / 4294967296;
const fr = (x: number): number => x - Math.floor(x);
const eu = (k: number, n: number, i: number): boolean => ((((i % n) + n) % n) * k) % n < k;

export const W: readonly number[] = [0, 0, Math.SQRT2 - 1, 0, 0.6180339887, Math.sqrt(3) - 1, Math.sqrt(17) - 4, Math.sqrt(19) - 4, Math.sqrt(23) - 4];
export const SPEC: readonly (readonly [n: number, kLo: number, kHi: number, mLo: number, mHi: number])[] = [
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
  [32, 4, 10, 2, 5],
  [16, 2, 4, 0, 0],
  [13, 5, 9, 3, 7],
  [12, 3, 8, 4, 9],
  [7, 1, 3, 2, 6],
  [10, 2, 5, 3, 8],
  [11, 1, 3, 3, 9],
];
const GHOST = 0.8 * Math.pow(10, -9 / 20);

export interface Section {
  i: number;
  n0: number;
  len: number;
  e: number;
  set: LayerId[];
  k: number[];
  r: number[];
  push: number[];
}

export interface Pat {
  o: Uint8Array;
  a: number;
  m: number;
  j: number;
  h: number;
}

export interface Hit {
  s: number;
  g: number;
  f: 0 | 1 | 2;
  c: number;
  q: number;
  o: number;
}

export interface BarLayers {
  n: number;
  sec: Section;
  on: readonly LayerId[];
  hits: Partial<Record<LayerId, Hit[]>>;
}

export function arpIdx(o: number, q: number, len: number, c: number): number {
  const p = 2 * len - 2 || 1;
  const x = q % p;
  return o === 0 ? q % len : o === 1 ? len - 1 - (q % len) : o === 2 ? (x < len ? x : p - x) : Math.floor(len * fr(q * W[4] + c * W[2]));
}

export class Layers {
  private bars = [0];
  private last?: Section;

  constructor(readonly seed: number, readonly lite = false) {}

  section(n: number): Section {
    const b = this.bars;
    while (b[b.length - 1] <= n) b.push(b[b.length - 1] + 12 + Math.floor(29 * u(this.seed, 1, b.length - 1)));
    let i = 0;
    while (b[i + 1] <= n) i++;
    return this.last?.i === i && this.last.n0 === b[i] ? this.last : (this.last = this.recipe(i, b[i], b[i + 1] - b[i], u(this.seed, 2, i)));
  }

  recipe(i: number, n0: number, len: number, e: number, pick?: readonly LayerId[]): Section {
    const S = this.seed;
    const lo = this.lite ? 3 : 4;
    const hi = this.lite ? 6 : 9;
    const order = IDS.slice(2).sort((a, b) => u(S, 4, i, IDS.indexOf(a)) - u(S, 4, i, IDS.indexOf(b)));
    const want: LayerId[] = pick ? pick.filter((x) => x !== 'drone' && x !== 'pad') : [];
    const cand = [...want, ...order.filter((x) => !want.includes(x))];
    const cnt = Math.min(hi, Math.max(lo, pick ? want.length + 2 : Math.round(lo + (hi - lo) * (0.6 * e + 0.4 * u(S, 3, i)))));
    const set: LayerId[] = ['drone', 'pad', ...cand.slice(0, cnt - 2)];
    if (!set.some((x) => LONG.includes(x))) set[cnt < hi ? cnt : cnt - 1] = order.find((x) => LONG.includes(x))!;
    const k: number[] = [];
    const r: number[] = [];
    const push: number[] = [];
    SPEC.forEach(([, a, b], L) => {
      const x = Math.round((b - a) * (0.5 * e + 0.5 * u(S, 5, i, L)));
      const v = a + (this.lite ? Math.round(x * 0.6) : x);
      k[L] = L === 3 ? (v > 3 ? 4 : 2) : v;
      r[L] = L === 4 && u(S, 6, i) < 0.25 ? 0.75 : L === 5 && !this.lite && u(S, 7, i) < 0.1 + 0.3 * e ? 2 : 1;
      push[L] = L === 3 ? 0 : 0.004 * (2 * u(S, 8, i, L) - 1);
    });
    return { i, n0, len, e, set, k, r, push };
  }

  pat(L: number, sec: Section, c: number): Pat {
    const S = this.seed;
    const i = sec.i;
    const [n, , , mLo, mHi] = SPEC[L];
    const k = sec.k[L];
    const off = L === 3 ? 0 : u(S, 9, i, L);
    const c0 = L < 4 ? Math.floor((sec.n0 * 16) / n) : Math.floor(Math.ceil(16 * sec.n0 * sec.r[L]) / n);
    const o = new Uint8Array(n);
    let j = 0;
    let R = 0;
    let a = 0;
    let m = 0;
    let h = 0;
    const base = (x: number): number => +eu(k, n, x + R);
    const reset = (): void => {
      R = Math.floor(n * fr(j * W[L] + off));
      for (let x = 0; x < n; x++) o[x] = base(x);
      a = o.indexOf(1);
    };
    const gap = (e: number): number => mLo + Math.floor((mHi - mLo + 1) * u(S, 10, i, L, e));
    reset();
    if (mHi) {
      for (let e = c0 + gap(c0); e <= c; e += gap(e)) {
        const t = u(S, 11, i, L, e);
        const v = u(S, 12, i, L, e);
        const on: number[] = [];
        o.forEach((y, x) => y === 1 && on.push(x));
        const x = on[Math.floor(v * on.length)];
        if (t < 0.25) {
          const d = fr(v * on.length) < 0.5 ? 1 : n - 1;
          const y = !o[(x + d) % n] ? (x + d) % n : !o[(x + n - d) % n] ? (x + n - d) % n : -1;
          if (y >= 0) {
            o[x] = 0;
            o[y] = 1;
            if (a === x) a = y;
          }
        } else if (t < 0.5) {
          const y = Math.floor(v * n);
          if (o[y] !== 1) o[y] = o[y] ? 0 : 2;
        } else if (t < 0.75) {
          a = x;
        } else {
          const R0 = R;
          R = Math.floor(n * fr(++j * W[L] + off));
          const d = (((R - R0) % n) + n) % n;
          const p = o.slice();
          for (let y = 0; y < n; y++) o[y] = p[(y + d) % n];
          a = (a - d + n) % n;
        }
        h = 0;
        for (let y = 0; y < n; y++) h += +(+(o[y] > 0) !== base(y));
        if (h > 3) {
          j++;
          reset();
          h = 0;
        }
        m++;
      }
    }
    return { o, a, m, j, h };
  }

  bar(n: number, st: number, meter: number, sec: Section = this.section(n)): BarLayers {
    const hits: Partial<Record<LayerId, Hit[]>> = {};
    for (const id of sec.set) {
      const L = IDS.indexOf(id);
      const N = SPEC[L]?.[0];
      if (!N) continue;
      const out: Hit[] = (hits[id] = []);
      const r = sec.r[L];
      const lk = L < 4;
      let P!: Pat;
      let pc = -1;
      for (let g = lk ? 0 : Math.ceil(st * r), g1 = lk ? meter : Math.ceil((st + meter) * r); g < g1; g++) {
        const c = lk ? Math.floor((n * 16) / N) : Math.floor(g / N);
        const q = lk ? (n % (N / 16)) * 16 + g : g - c * N;
        if (c !== pc) P = this.pat(L, sec, (pc = c));
        const f = P.o[q];
        if (!f) continue;
        const acc = f === 1 && (L === 5 ? g % 7 === P.a % 7 : q === P.a);
        out.push({
          s: lk ? g : g / r - st,
          g: f === 2 ? GHOST : acc ? 1 : 0.8,
          f: f === 2 ? 2 : acc ? 1 : 0,
          c,
          q,
          o: L === 4 ? Math.floor(4 * fr(c * W[4] + u(this.seed, 13, sec.i))) : 0,
        });
      }
    }
    return { n, sec, on: sec.set, hits };
  }
}
