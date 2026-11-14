import { splitmix32 } from '../../../core/rng';

export const DEPTH_LAYERS = ['drone', 'pad', 'bass', 'kick', 'arp', 'hats', 'ticks', 'pulse', 'glint', 'melody'] as const;
export type DepthLayer = (typeof DEPTH_LAYERS)[number];
export type Cause = 'plan' | 'route' | 'nudge' | 'reentry';
export type Centres = Readonly<Record<string, readonly number[]>>;

export interface Recipe {
  readonly layers: number;
  readonly sub: number;
  readonly hr: number;
  readonly phrase: number;
  readonly plen: number;
  readonly reg: number;
  readonly pal: number;
  readonly dens: number;
  readonly colour: number;
}

export interface Section {
  readonly i: number;
  readonly n0: number;
  bars: number;
  readonly t0: number;
  readonly recipe: Recipe;
  readonly hash: number;
  readonly centre: number;
  readonly from: number;
  readonly arc: number;
  readonly cause: Cause;
  readonly settle: boolean;
}

export interface BarForm {
  readonly s: Section;
  readonly k: number;
  readonly arc: number;
  readonly centre: number;
  readonly drone: number;
}

export interface FormOpts {
  readonly centres?: Centres;
  readonly visit?: number;
  readonly lite?: boolean;
  readonly barSec?: number;
}

export interface Form {
  at(n: number, t: number, state?: string): BarForm;
  force(n: number, cause: Exclude<Cause, 'plan'>): void;
  arc(t: number): number;
  has(s: Section, l: DepthLayer): boolean;
  readonly sections: readonly Section[];
  readonly relax: number;
  readonly barSec: number;
}

export const h32 = (...k: number[]): number => {
  let h = 0;
  for (const x of k) h = splitmix32((h ^ x) >>> 0);
  return h;
};
export const u32 = (...k: number[]): number => h32(...k) / 4294967296;

export const pickw = (w: readonly number[], r: number): number => {
  let s = 0;
  for (const x of w) s += x;
  r *= s;
  for (let i = 0; i < w.length; i++) if ((r -= w[i]) < 0) return i;
  return w.length - 1;
};

const LENS = [12, 16, 20, 24, 28, 32, 40];
const PHI = 0.6180339887;
const cl = (x: number, a = 0, b = 1): number => (x < a ? a : x > b ? b : x);
const FIELDS = ['layers', 'sub', 'hr', 'phrase', 'plen', 'reg', 'pal', 'dens', 'colour'] as const;

export function createForm(seed: number, o: FormOpts = {}): Form {
  const secs: Section[] = [];
  const mem: [number, number][] = [];
  const snap: number[][] = [];
  const v = o.visit ?? 0;
  const off = v > 0 ? (v * PHI % 1) * 3000 : 0;
  const rot = Math.floor(8 * ((v * (Math.SQRT2 - 1)) % 1));
  let barSec = o.barSec ?? 240 / 116;
  let lastN = -1;
  let lastT = 0;
  let t0 = NaN;
  let moved = 0;
  let stint = 0;
  let away = 0;
  let pend: Cause = 'plan';
  let relax = 0;

  const arc = (t: number): number => {
    let a = 0;
    [480, 1200, 3000].forEach((p, j) => {
      const x = (t + off) / p;
      const c = Math.floor(x);
      const f = x - c;
      a += [0.5, 0.3, 0.2][j] * (u32(seed, 9, j, c) + (u32(seed, 9, j, c + 1) - u32(seed, 9, j, c)) * f * f * (3 - 2 * f));
    });
    return a;
  };

  const plan = (n: number, t: number, state: string): void => {
    const i = secs.length;
    const prev = secs[i - 1];
    snap[i] = [moved, stint, away];
    const a = arc(t);
    const settle = v < 1 && t < 180;
    const x = settle ? 0 : cl(0.5 + 1.6 * (a - 0.5));
    const d = (f: number, r: number): number => u32(seed, 1, i, f, r);
    const bars = LENS[pickw(LENS.map((_, j) => 1 + (0.8 * (1 - 2 * x) * (j - 3)) / 3), d(0, 0))];
    const lo = o.lite ? 3 : 4;
    const hi = o.lite ? 6 : 8;
    let rc: Recipe | undefined;
    let hash = 0;
    for (let r = 0; r < 64 && !rc; r++) {
      const cnt = settle ? lo : Math.round(cl(lo + x * (hi - lo) + (d(1, r) - 0.5) * 2.2, lo, hi));
      const ks = [2, 3, 4, 5, 6, 7, 8, 9].map((j) => [j, d(10 + j, r) - (j === 3 ? 0.3 * (1 - x) : 0) + (j === 9 ? 0.2 : 0)]);
      ks.sort((p, q) => q[1] - p[1]);
      let layers = 3;
      for (let j = 0; j < cnt - 2; j++) layers |= 1 << ks[j][0];
      const c: Recipe = {
        layers,
        sub: Math.floor(d(2, r) * 4),
        hr: pickw([2 - x, 1, 1 + x], d(3, r)),
        phrase: Math.floor(d(4, r) * 4),
        plen: 3 + Math.floor(d(5, r) * 4),
        reg: pickw([1.6 - x, 1, 0.6 + x], d(6, r)),
        pal: (Math.floor(d(7, r) * 8) + rot) % 8,
        dens: Math.round(cl((x - 0.5) * 2 + d(8, r) - 0.5, -1, 1)),
        colour: Math.floor(d(9, r) * 3),
      };
      hash = h32(...FIELDS.map((k) => c[k]));
      const diff = prev ? FIELDS.filter((k) => c[k] !== prev.recipe[k]).length : 9;
      if (diff >= 2 && !mem.some(([h, tt]) => h === hash && t - tt < 1200)) rc = c;
      else if (r === 63) {
        relax++;
        rc = c;
      }
    }
    while (mem.length && t - mem[0][1] >= 1200) mem.shift();
    mem.push([hash, t]);
    const from = prev ? prev.centre : 0;
    if (prev && from) away += t - prev.t0;
    const set = o.centres?.[state] ?? [0];
    const est = bars * barSec;
    let centre = from;
    if (from) {
      if (!set.includes(from) || t - moved >= stint || t - moved + est > 720) {
        centre = 0;
        moved = t;
      }
    } else if (!settle && set.length > 1 && t - moved >= 360 && u32(seed, 2, i) < 0.5) {
      const L = 360 + 240 * u32(seed, 3, i);
      if (t - moved >= 1.5 * L && away + L + 100 <= 0.4 * (t + L + 100)) {
        const opts = set.filter((c) => c);
        centre = opts[Math.floor(u32(seed, 4, i) * opts.length)];
        moved = t;
        stint = L;
      }
    }
    secs.push({ i, n0: n, bars, t0: t, recipe: rc!, hash, centre, from, arc: a, cause: pend, settle });
    pend = 'plan';
  };

  const find = (n: number): Section => {
    for (let j = secs.length - 1; j > 0; j--) if (secs[j].n0 <= n) return secs[j];
    return secs[0];
  };

  return {
    sections: secs,
    get relax() {
      return relax;
    },
    get barSec() {
      return barSec;
    },
    arc,
    has: (s, l) => !!(s.recipe.layers & (1 << DEPTH_LAYERS.indexOf(l))),
    force(n, cause) {
      for (let j = secs.length - 1; j >= 0; j--) {
        const s = secs[j];
        if (s.n0 >= n) continue;
        if (n < s.n0 + s.bars && (cause !== 'nudge' || n - s.n0 >= 8)) {
          const k = secs.length - j - 1;
          if (k) [moved, stint, away] = snap[j + 1];
          mem.length = Math.max(0, mem.length - k);
          secs.length = snap.length = j + 1;
          s.bars = n - s.n0;
          pend = cause;
        }
        return;
      }
    },
    at(n, tt, state = '') {
      if (t0 !== t0) t0 = tt;
      const t = tt - t0;
      if (n > lastN && lastN >= 0) barSec = cl((t - lastT) / (n - lastN), 1.5, 3);
      if (n > lastN) {
        lastN = n;
        lastT = t;
      }
      for (let s = secs[secs.length - 1]; !s || n >= s.n0 + s.bars; s = secs[secs.length - 1]) {
        const n0 = s ? s.n0 + s.bars : n;
        plan(n0, t - (n - n0) * barSec, state);
      }
      const s = find(n);
      let drone = s.centre;
      for (let j = s.i; j >= 0 && secs[j].n0 > n - 16; j--) {
        const g = secs[j];
        if (g.from !== g.centre) {
          drone = g.from + ((g.centre - g.from) * (n - g.n0)) / 16;
          break;
        }
      }
      return { s, k: n - s.n0, arc: arc(t), centre: s.centre, drone };
    },
  };
}
