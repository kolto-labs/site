import type { Rng } from '../../core/rng';
import { splitmix32 } from '../../core/rng';
import type { LayerKey, Scale, ScoreProfile, StateDef } from './profile';

export type { LayerKey, Scale };
export const G3 = 55;

export const sem = (m: Scale, i: number): number => m[((i % 7) + 7) % 7] + 12 * Math.floor(i / 7);
export const midiOf = (m: Scale, i: number): number => G3 + sem(m, i);
export const hz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const clampN = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const db = (x: number): number => Math.pow(10, x / 20);

export function idxNear(m: Scale, midi: number): number {
  let best = 0;
  for (let i = -7; i < 28; i++) if (Math.abs(midiOf(m, i) - midi) < Math.abs(midiOf(m, best) - midi)) best = i;
  return best;
}

export const triad = (m: Scale, d: number): number[] => [sem(m, d), sem(m, d + 2), sem(m, d + 4)];
export const isDim = (t: readonly number[]): boolean => t[1] - t[0] === 3 && t[2] - t[0] === 6;

const CHORDS: readonly (readonly number[])[] = [
  [0.05, 0.1, 0.15, 0.25, 0.15, 0, 0.3],
  [0.2, 0, 0.15, 0.2, 0.25, 0, 0.2],
  [0.15, 0.1, 0, 0.3, 0.1, 0, 0.35],
  [0.35, 0.1, 0.1, 0, 0.15, 0, 0.3],
  [0.3, 0.1, 0.2, 0.15, 0, 0, 0.25],
  [0.5, 0, 0, 0, 0, 0, 0.5],
  [0.4, 0.05, 0.15, 0.25, 0.15, 0, 0],
];

export interface Chord {
  deg: number;
  pcs: number[];
  kind: 0 | 1 | 2;
  add9: boolean;
  sev: boolean;
}

export function makeChord(m: Scale, deg: number, kind: 0 | 1 | 2 = 0, add9 = false, sev = false): Chord {
  const t = triad(m, deg);
  const pcs = kind === 1 ? [t[0], sem(m, deg + 1), t[2]] : kind === 2 ? [t[0], sem(m, deg + 3), t[2]] : t;
  if (add9) pcs.push(sem(m, deg + 8));
  if (sev) pcs.push(sem(m, deg + 6));
  return { deg, pcs, kind, add9, sev };
}

const fold = (d: number): number => {
  const x = ((d % 12) + 12) % 12;
  return x > 6 ? 12 - x : x;
};

export const vlCost = (a: readonly number[], b: readonly number[]): number =>
  a.reduce((s, x) => s + Math.min(...b.map((y) => fold(x - y))), 0);

export function pick(rng: Rng, w: readonly number[]): number {
  let s = 0;
  for (const x of w) s += x;
  if (s <= 0) return 0;
  let r = rng() * s;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r < 0) return i;
  }
  return w.length - 1;
}

export const LAYERS: readonly LayerKey[] = ['drone', 'pad', 'arp', 'bass', 'hats', 'kick', 'melody', 'cuep', 'cuefx'];

export class Harmony {
  m: Scale;
  state: string;
  def: StateDef;
  hist: number[] = [];
  cur: Chord;
  constructor(private rng: Rng, private P: ScoreProfile) {
    this.state = P.initial;
    this.def = P.states[P.initial];
    this.m = P.scales[this.def.mode];
    this.cur = makeChord(this.m, 0);
  }

  use(state: string): void {
    this.state = state;
    this.def = this.P.states[state] ?? this.def;
    this.m = this.P.scales[this.def.mode];
  }

  weights(prev: Chord, grav: readonly number[], exclude: readonly number[] = []): number[] {
    const m = this.m;
    const row = (this.P.chords ?? CHORDS)[prev.deg].slice();
    const q = this.def.row;
    if (q && prev.deg === q[0]) row[q[1]] = q[2];
    const pt = triad(m, prev.deg);
    return row.map((b, d) => {
      const t = triad(m, d);
      if (isDim(t) || exclude.includes(d)) return 0;
      let n = 0;
      for (const h of this.hist.slice(-4)) if (h === d) n++;
      return b * (grav.includes(d + 1) ? 2.5 : 1) * Math.pow(0.6, n) * Math.exp(-0.25 * vlCost(pt, t));
    });
  }

  next(slot: number, perSlots: number, grav: readonly number[], tMid: boolean, noCad: boolean, pivotFrom?: Chord): Chord {
    const i = slot % perSlots;
    const m = this.m;
    let d: number;
    if (pivotFrom) {
      const g = triad(m, grav[0] - 1);
      const w = this.weights(this.cur, grav);
      const common = (x: number, ps: readonly number[]): number => +ps.some((y) => (y - x) % 12 === 0);
      const sc = (k: number): number => triad(m, k).reduce((a, x) => a + common(x, pivotFrom.pcs) + common(x, g), 0) + w[k];
      d = [0, 1, 2, 3, 4, 5, 6].filter((k) => w[k] > 0).sort((a, b) => sc(b) - sc(a))[0] ?? 0;
    } else if (!noCad && i === perSlots - 1) {
      d = 0;
    } else if (!noCad && i === perSlots - 2) {
      d = pick(this.rng, this.weights(this.cur, [], this.def.penult ?? [0, 1, 2, 5]));
    } else {
      d = pick(this.rng, this.weights(this.cur, grav));
    }
    const r = this.rng;
    const u = r();
    const u2 = r();
    const u3 = r();
    const kind: 0 | 1 | 2 = u < 0.15 + (tMid ? 0.15 : 0) ? (u2 < 0.5 ? 1 : 2) : 0;
    this.hist.push(d);
    if (this.hist.length > 8) this.hist.shift();
    return (this.cur = makeChord(m, d, kind, d === 0 && kind === 0 && u3 < 0.3, !!this.def.seventh && kind === 0 && u3 > 0.6));
  }
}

export function voice(prev: readonly number[], pcs: readonly number[]): number[] {
  const free = pcs.slice(0, 4);
  const out: number[] = [];
  const near = (t: number, pc: number): number => {
    let best = G3 + pc;
    for (let o = -48; o <= 48; o += 12) {
      const v = G3 + pc + o;
      if (v >= 52 && v <= 70 && Math.abs(v - t) < Math.abs(best - t)) best = v;
    }
    return best;
  };
  for (const p of prev.length ? prev : [57, 60, 64]) {
    if (!free.length) break;
    let bi = 0;
    for (let i = 1; i < free.length; i++) if (Math.abs(near(p, free[i]) - p) < Math.abs(near(p, free[bi]) - p)) bi = i;
    out.push(near(p, free[bi]));
    free.splice(bi, 1);
  }
  for (const pc of free) out.push(near(60, pc));
  return out.sort((a, b) => a - b);
}

export function snapTo(pcs: readonly number[], midi: number): number {
  let best = midi;
  let bd = 99;
  for (const y of pcs) {
    for (let o = -24; o <= 36; o += 12) {
      const d = Math.abs(G3 + y + o - midi);
      if (d < bd) {
        bd = d;
        best = G3 + y + o;
      }
    }
  }
  return best;
}

export const eu = (k: number, n: number, i: number, r: number): boolean => (((((i + r) % n) + n) % n) * k) % n < k;

export const WEYL: Readonly<Record<string, number>> = {
  arp: 0.6180339887,
  bass: Math.SQRT2 - 1,
  hats: Math.sqrt(3) - 1,
  harvest: Math.sqrt(5) - 2,
  pack: Math.sqrt(7) - 2,
  load: Math.sqrt(11) - 3,
  station: Math.sqrt(13) - 3,
};

export const frac = (x: number): number => x - Math.floor(x);

export const LFO_T: readonly number[] = [11 * Math.SQRT2, 23 * Math.sqrt(3), 37 * Math.sqrt(5), 53 * Math.sqrt(7), 79 * Math.sqrt(11), 113 * Math.sqrt(13)];

export function lfo(phases: readonly number[], k: number, t: number): number {
  return Math.sin(2 * Math.PI * (t / LFO_T[k] + phases[k]));
}

const hash = (seed: number, o: number, c: number): number => splitmix32((seed ^ Math.imul(o + 1, 0x9e3779b1) ^ Math.imul(c, 0x85ebca6b)) >>> 0) / 4294967296;

export function vnoise(seed: number, n: number): number {
  let s = 0;
  const P = [4, 32, 256];
  const A = [0.5, 0.3, 0.2];
  for (let o = 0; o < 3; o++) {
    const x = n / P[o];
    const c = Math.floor(x);
    const f = x - c;
    const u = f * f * (3 - 2 * f);
    s += A[o] * lerp(hash(seed, o, c), hash(seed, o, c + 1), u);
  }
  return s;
}

export function poisson(rng: Rng, lam: number): number {
  const L = Math.exp(-lam);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L && k < 8);
  return k - 1;
}
