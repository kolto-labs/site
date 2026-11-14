import { splitmix32 } from '../../../core/rng';

export interface MNote {
  readonly p: number;
  readonly s: number;
  readonly l: number;
}

export interface MCand {
  readonly n: readonly MNote[];
  readonly s: number;
}

export interface Choice {
  i: number;
  step: number;
  sim: number;
}

export interface Relax {
  L1: number;
  L2: number;
  L3: number;
  L4: number;
  F: number;
  F4: number;
}

export type Keyed = 'L5' | 'L5w' | 'L6' | 'M';

export interface Windows {
  L1: number;
  L2: number;
  L3: number;
  L3x: number;
  L4: number;
  L5: number;
  L5w: number;
  L6: number;
  M: number;
}

export const ROUNDS = 4;

const mix = (h: number, x: number): number => splitmix32((h ^ Math.imul(x, 0x9e3779b1)) >>> 0) | 0;

export const hashOf = (xs: ArrayLike<number>): number => {
  let h = 7;
  for (let i = 0; i < xs.length; i++) h = mix(h, xs[i]);
  return h;
};

const tok = (q: readonly MNote[], j: number): number => (q[j].p - q[j - 1].p) * 32 + q[j].l;

const toks = (n: readonly MNote[]): number[] => n.slice(1, 32).map((_, i) => tok(n, i + 1));

interface Ring {
  h: Int32Array;
  t: Uint16Array;
  i: number;
  n: number;
}

const ring = (c: number): Ring => ({ h: new Int32Array(c), t: new Uint16Array(c), i: 0, n: 0 });

const push = (r: Ring, h: number, t: number): void => {
  const c = r.h.length;
  r.h[r.i] = h;
  r.t[r.i] = t;
  r.i = (r.i + 1) % c;
  r.n = Math.min(r.n + 1, c);
};

const live = (r: Ring, t: number, w: number): Map<number, number> => {
  const m = new Map<number, number>();
  for (let k = 0; k < r.n; k++) if (((t - r.t[k]) & 0xffff) <= w) m.set(r.h[k], (m.get(r.h[k]) ?? 0) + 1);
  return m;
};

const keys = (tail: readonly MNote[], n: readonly MNote[]): number[][] => {
  const q = tail.concat(n);
  const o: number[][] = [[], [], []];
  for (let i = tail.length; i < q.length; i++) {
    if (i > 3) o[0].push(hashOf([3, 2, 1, 0].map((d) => tok(q, i - d))));
    if (i > 6) {
      let h = q[i - 7].l;
      let k = 0;
      for (let j = i - 6; j <= i; j++) {
        h = mix(h, tok(q, j));
        k = k * 3 + Math.sign(q[j].p - q[j - 1].p) + 1;
      }
      o[1].push(h);
      o[2].push(k);
    }
  }
  return o;
};

const lev = (eq: Map<number, number>, m: number, b: readonly number[]): number => {
  let pv = -1;
  let mv = 0;
  let d = m;
  for (const y of b) {
    const e = eq.get(y) ?? 0;
    const xv = e | mv;
    const xh = (((e & pv) + pv) ^ pv) | e;
    const ph = mv | ~(xh | pv);
    const mh = pv & xh;
    d += (ph >>> (m - 1)) & 1 ? 1 : (mh >>> (m - 1)) & 1 ? -1 : 0;
    const ps = (ph << 1) | 1;
    pv = (mh << 1) | ~(xv | ps);
    mv = ps & xv;
  }
  return d;
};

export class NoveltyMemory {
  readonly w: Windows;
  readonly relax: Relax = { L1: 0, L2: 0, L3: 0, L4: 0, F: 0, F4: 0 };
  private g = [320, 768, 2048].map(ring);
  private kr: Record<Keyed, Ring> = { L5: ring(40), L5w: ring(320), L6: ring(64), M: ring(32) };
  private ph: number[][] = [];
  private tl: MNote[] = [];
  private bs: number[][] = [];
  private k: number;

  constructor(seed: number, lite = false) {
    this.w = { L1: lite ? 30 : 60, L2: lite ? 32 : 64, L3: 180, L3x: 600, L4: 32, L5: 32, L5w: 600, L6: 1200, M: 600 };
    this.k = seed;
  }

  propose(cs: readonly MCand[], t: number, round: number): Choice | null {
    const { w, g, relax: r } = this;
    const m1 = live(g[0], t, w.L1);
    const m3 = live(g[1], t, w.L3);
    const mx = live(g[2], t, w.L3x);
    const e = cs.map((c) => {
      const [g4, x, k] = keys(this.tl, c.n);
      let ex = 0;
      let rep = 0;
      let con = 0;
      g4.forEach((h, i) => {
        if ((m1.get(h) ?? 0) + g4.slice(0, i + 1).filter((y) => y === h).length > 4) ex++;
      });
      x.forEach((h, i) => {
        if (x.indexOf(h) < i || mx.has(h)) rep++;
        if (k.indexOf(k[i]) < i || m3.has(k[i])) con++;
      });
      const a = toks(c.n);
      const m = a.length;
      let sim = 0;
      if (m > 1) {
        const eq = new Map<number, number>();
        a.forEach((v, i) => eq.set(v, (eq.get(v) ?? 0) | (1 << i)));
        for (const b of this.ph) {
          const L = Math.max(m, b.length);
          if (1 - Math.abs(m - b.length) / L > sim) sim = Math.max(sim, 1 - lev(eq, m, b) / L);
        }
      }
      return { ex, rep, cf: con / (x.length || 1), sim, th: m > 7 ? 0.7 : 0.8 };
    });
    const last = round >= ROUNDS - 1;
    const ix = e.map((_, i) => i);
    let lv = 0;
    let ok: number[] = [];
    for (; lv < (last ? 7 : 1) && !ok.length; lv++) {
      ok = ix.filter((i) => {
        const v = e[i];
        return !v.rep && (lv || !v.ex) && (lv > 1 || v.cf <= 0.85) && v.sim <= v.th + 0.05 * Math.max(0, lv - 2) + 1e-9;
      });
    }
    lv--;
    if (!ok.length) {
      if (!last) return null;
      r.F++;
      lv = 7;
      ok = [ix.sort((a, b) => e[a].rep - e[b].rep || e[a].sim - e[b].sim)[0]];
    } else if (lv) r[lv < 2 ? 'L1' : lv < 3 ? 'L3' : 'L2']++;
    const wt = ok.map((i) => Math.exp((cs[i].s - 0.5 * e[i].ex - 4 * e[i].cf - 1.5 * e[i].sim) / 0.3));
    let u = (splitmix32((this.k = (this.k + 0x6d2b79f5) | 0)) / 2 ** 32) * wt.reduce((a, b) => a + b);
    let j = 0;
    while (j < wt.length - 1 && (u -= wt[j]) >= 0) j++;
    return { i: ok[j], step: lv, sim: e[ok[j]].sim };
  }

  commit(n: readonly MNote[], t: number): void {
    keys(this.tl, n).forEach((a, i) => a.forEach((h) => push(this.g[[0, 2, 1][i]], h, t)));
    if (n.length > 2) this.ph = [...this.ph, toks(n)].slice(-this.w.L2);
    this.tl = this.tl.concat(n).slice(-7);
  }

  bar(m: readonly number[], round: number): boolean {
    const ham = this.bs.slice(0, 4).every((b) => m.reduce((d, x, i) => {
      for (let y = (x ^ b[i]) >>> 0; y; y &= y - 1) d++;
      return d;
    }, 0) > 2);
    if (ham && !this.bs.some((b) => b + '' === m + '')) return true;
    if (round < ROUNDS - 1) return false;
    this.relax[ham ? 'L4' : 'F4']++;
    return true;
  }

  commitBar(m: readonly number[]): void {
    this.bs = [m.slice(), ...this.bs].slice(0, this.w.L4);
  }

  fresh(k: Keyed, h: number, t: number): boolean {
    return !live(this.kr[k], t, this.w[k]).has(h);
  }

  mark(k: Keyed, h: number, t: number): void {
    push(this.kr[k], h, t);
  }
}
