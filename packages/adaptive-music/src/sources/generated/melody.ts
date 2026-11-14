import type { Rng } from '../../core/rng';
import type { Scale } from './theory';
import { clampN, idxNear, pick, poisson, sem } from './theory';

export interface Nt {
  p: number;
  s: number;
  l: number;
}

export interface MelCtx {
  m: Scale;
  centre: number;
  onsets: number;
  lambda: number;
  odd: boolean;
  meters: readonly number[];
  chords: readonly (readonly number[])[];
  tHigh: boolean;
}

const CELLS: readonly (readonly number[])[] = [[1, 1, 1, 1], [2, 1, 1], [1, 1, 2], [2, 2], [3, 1], [1, 3], [4], []];
const CN = CELLS.map((c) => c.length);
const IVW = [0.55, 0.25, 0.1, 0.07, 0.03];

export function drawIv(r: Rng): number {
  const k = pick(r, IVW);
  const mag = k < 4 ? k + 1 : 5 + Math.floor(r() * 3);
  return r() < 0.5 ? -mag : mag;
}

function bad(n: Nt[]): boolean {
  if (n.length >= 3) {
    const a = n[1].p - n[0].p;
    const b = n[2].p - n[1].p;
    if (a >= 3 && Math.abs(b) >= 2) return true;
  }
  if (n.length >= 2 && n[1].p - n[0].p >= 3 && n[0].l <= 1) return true;
  return false;
}

export function drawMotif(r: Rng): Nt[] {
  for (let tries = 0; tries < 40; tries++) {
    const len = 3 + Math.floor(r() * 4);
    const out: Nt[] = [];
    let p = 0;
    let s = 0;
    let lo = 0;
    let hi = 0;
    let ok = true;
    for (let i = 0; i < len; i++) {
      if (i > 0) p += drawIv(r);
      lo = Math.min(lo, p);
      hi = Math.max(hi, p);
      const l = [1, 2, 2, 3, 4][Math.floor(r() * 5)];
      out.push({ p, s, l });
      s += l;
      if (s > 15) {
        ok = i >= 2;
        break;
      }
    }
    if (ok && hi - lo <= 7 && !bad(out)) return out;
  }
  return [{ p: 0, s: 0, l: 2 }, { p: -1, s: 2, l: 2 }, { p: 1, s: 4, l: 4 }];
}

export const motifEnd = (n: readonly Nt[]): number => n.reduce((a, x) => Math.max(a, x.s + x.l), 0);

function xform(r: Rng, n: Nt[], op: number): Nt[] {
  const c = n.map((x) => ({ ...x }));
  const tot = motifEnd(c);
  switch (op) {
    case 0: {
      const k = Math.floor(r() * 7) - 3;
      return c.map((x) => ({ ...x, p: x.p + k }));
    }
    case 1:
      return c.map((x) => ({ ...x, p: -x.p }));
    case 2:
      return c.reverse().map((x) => ({ p: x.p, s: tot - x.s - x.l, l: x.l }));
    case 3:
      return c.map((x) => ({ p: x.p, s: x.s * 2, l: x.l * 2 }));
    case 4:
      return c.map((x) => ({ p: x.p, s: Math.floor(x.s / 2), l: Math.max(1, Math.floor(x.l / 2)) }));
    case 5: {
      const j = Math.floor(r() * c.length);
      if (c[j].l < 2) return c;
      const nb = r() < 0.5 ? 1 : -1;
      const x = c[j];
      c.splice(j, 1, { p: x.p + nb, s: x.s, l: 1 }, { p: x.p, s: x.s + 1, l: x.l - 1 });
      return c;
    }
    case 6: {
      const k = 2 + Math.floor(r() * 2);
      const part = r() < 0.5 ? c.slice(0, k) : c.slice(-k);
      const s0 = part[0].s;
      return part.map((x) => ({ ...x, s: x.s - s0 }));
    }
    default: {
      const sh = r() < 0.5 ? 1 : -1;
      return c.concat(c.map((x) => ({ p: x.p + sh, s: x.s + tot, l: x.l })));
    }
  }
}

const sim = (a: readonly number[], b: readonly number[]): number => {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return 0;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    for (let j = 1; j <= m; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[m] / Math.max(n, m);
};

export const tokens = (n: readonly Nt[]): number[] => {
  const t: number[] = [];
  for (let i = 1; i < n.length; i++) t.push((n[i].p - n[i - 1].p) * 32 + n[i].l);
  return t;
};

export class Melody {
  dna: Nt[][];
  mem: number[][] = [];
  fallbacks = 0;
  recalled = -99;
  count = 0;
  lastOp = -1;
  lastMaxSim = 0;
  private rm!: Rng;
  constructor(ri: Rng) {
    this.dna = [drawMotif(ri), drawMotif(ri), drawMotif(ri), drawMotif(ri)];
  }

  private fill(c: MelCtx, n: Nt[], bars: readonly number[], taken: Set<number>, start: number): void {
    const r = this.rm;
    let p = n.length ? n[n.length - 1].p : start;
    let d1 = 0;
    let d2 = 0;
    for (const b of bars) {
      const meter = c.meters[b];
      const per = c.onsets / Math.ceil(meter / 4);
      let prevCell = -1;
      for (let beat = 0; beat * 4 < meter; beat++) {
        const w = CELLS.map((_, i) => {
          let x = Math.exp(-Math.pow(CN[i] - per, 2) / 1.2);
          if (i === prevCell) x *= 0.6;
          if (i === 0 && prevCell === 0 && !c.tHigh) x = 0;
          if (CN[i] === 0 && per > 1.5) x *= 0.3;
          return x + 0.01;
        });
        const ci = pick(r, w);
        prevCell = ci;
        let s = beat * 4;
        for (const d of CELLS[ci]) {
          if (s >= meter) break;
          const key = b * 32 + s;
          if (!taken.has(key)) {
            let iv = drawIv(r);
            if (d1 !== 0 && Math.sign(d1) === Math.sign(d2) && r() < 0.4) iv = Math.sign(d1) * Math.abs(iv);
            if (Math.abs(p + iv - c.centre) > 7) iv = -iv;
            p = clampN(p + iv, c.centre - 7, c.centre + 7);
            d2 = d1;
            d1 = iv;
            n.push({ p, s: b * 16 + s, l: Math.min(d, meter - s) });
          }
          s += d;
        }
      }
    }
  }

  private cand(c: MelCtx): Nt[] {
    const r = this.rm;
    const w = [0.4, 0.3, 0.2, 0.1];
    const mi = pick(r, w);
    const mo = this.dna[mi];
    const start = c.centre + Math.floor(r() * 5) - 2;
    const n: Nt[] = [];
    const taken = new Set<number>();
    const place = (m: readonly Nt[], bar: number): void => {
      for (const x of m) {
        const s = x.s + bar * 16;
        const b = Math.floor(s / 16);
        if (b > 3) continue;
        n.push({ p: start + x.p, s, l: x.l });
        for (let k = 0; k < x.l; k++) taken.add(b * 32 + ((s % 16) + k));
      }
    };
    place(mo, 0);
    this.fill(c, n, [0, 1], taken, start);
    const k = 1 + poisson(r, c.lambda);
    let t = mo.map((x) => ({ ...x }));
    for (let i = 0; i < k; i++) {
      const op = pick(r, [1, 1, 1, 1, 1, 1, 1, 1].map((_, j) => (j === this.lastOp ? 0.3 : 1)));
      this.lastOp = op;
      t = xform(r, t, op);
    }
    place(t, 2);
    this.fill(c, n, [2, 3], taken, n.length ? n[n.length - 1].p : start);
    const set = c.odd ? [1, 3, 4] : [0, 2, 4];
    const last = n[n.length - 1];
    if (last) {
      const o = [0, 1, -1, 2, -2, 3, -3, 4, -4].find((d) => set.includes((((last.p + d) % 7) + 7) % 7));
      last.p += o ?? 0;
    }
    n.sort((a, b) => a.s - b.s);
    return n;
  }

  private score(c: MelCtx, n: readonly Nt[]): { s: number; ms: number } {
    let strong = 0;
    let fit = 0;
    let iv = 0;
    for (const [j, x] of n.entries()) {
      if (x.s % 8 === 0) {
        strong++;
        if (c.chords[x.s >> 4]?.some((y) => (((y - sem(c.m, x.p)) % 12) + 12) % 12 === 0)) fit++;
      }
      if (j) iv += Math.abs(x.p - n[j - 1].p);
    }
    const tk = tokens(n);
    const ms = n.length < 3 ? 0 : Math.max(0, ...this.mem.map((m) => sim(tk, m)));
    const smooth = 1 - iv / Math.max(1, n.length - 1) / 4;
    return { s: (strong ? fit / strong : 0.5) + 0.6 * smooth - 1.5 * ms + 0.3, ms };
  }

  /** `r` is a stream addressed by the phrase's first bar, so earlier draws elsewhere never shift it. */
  phrase(c: MelCtx, r: Rng): Nt[] {
    this.rm = r;
    this.count++;
    type Cd = { n: Nt[]; s: number; ms: number };
    const recall = this.count - this.recalled >= 8;
    let pool: Cd[] = [];
    let all: Cd[] = [];
    for (let round = 0; round < 4 && !pool.length; round++) {
      all = [];
      for (let i = 0; i < 14 && all.length < 6; i++) {
        const n = this.cand(c);
        if (!bad(n)) all.push({ n, ...this.score(c, n) });
      }
      if (!all.length) {
        const n = this.cand(c);
        all.push({ n, ...this.score(c, n) });
      }
      pool = all.filter((x) => x.ms <= 0.8 || (recall && x.ms <= 0.92));
    }
    if (!pool.length) {
      pool = [all.sort((a, b) => a.ms - b.ms)[0]];
      this.fallbacks++;
    }
    const top = Math.max(...pool.map((x) => x.s));
    const ch = pool[pick(this.rm, pool.map((x) => Math.exp((x.s - top) / 0.3)))];
    if (ch.ms > 0.8) this.recalled = this.count;
    this.lastMaxSim = ch.ms;
    if (ch.n.length >= 3) {
      this.mem.push(tokens(ch.n));
      if (this.mem.length > 24) this.mem.shift();
    }
    return ch.n;
  }
}

export function onsetsFor(e: number, dens: number): number {
  return clampN(Math.round(2 + 4 * e * dens), 0, 6);
}

export function centreFor(m: Scale, e: number, f: number, reg: number, l5: number): number {
  const midi = clampN(74 + reg + Math.round(4 * (e - 0.5)) - Math.round(2 * f) + Math.round(2 * l5), 67, 84);
  return idxNear(m, midi);
}
