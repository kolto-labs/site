import type { Scale, ScoreProfile } from '../profile';
import type { Chord } from '../theory';
import type { Form, Section } from './form';
import { pickw, u32 } from './form';

export type Cadence = 0 | 1 | 2 | 3;

export interface Period {
  readonly n0: number;
  len: number;
  readonly si: number;
  readonly sec: Section;
  readonly state: string;
  readonly cad: Cadence;
  readonly centre: number;
  readonly pivot: boolean;
  readonly at: readonly number[];
  readonly chords: readonly Chord[];
  readonly voicings: readonly (readonly number[])[];
}

export interface HarmBar {
  readonly chord: Chord;
  readonly voicing: readonly number[];
  readonly change: boolean;
  readonly final: boolean;
  readonly p: Period;
  readonly k: number;
  readonly slot: number;
}

export interface HarmCtx {
  readonly state: string;
  readonly grav?: readonly number[];
  readonly noCad?: boolean;
}

export interface HarmonyPlanner {
  at(n: number, t: number, c: HarmCtx): HarmBar;
  readonly relax: number;
}

const B: readonly (readonly number[])[] = [
  [0.05, 0.1, 0.15, 0.25, 0.15, 0, 0.3],
  [0.2, 0, 0.15, 0.2, 0.25, 0, 0.2],
  [0.15, 0.1, 0, 0.3, 0.1, 0, 0.35],
  [0.35, 0.1, 0.1, 0, 0.15, 0, 0.3],
  [0.3, 0.1, 0.2, 0.15, 0, 0, 0.25],
  [0.5, 0, 0, 0, 0, 0, 0.5],
  [0.4, 0.05, 0.15, 0.25, 0.15, 0, 0],
];
const md = (x: number): number => ((x % 12) + 12) % 12;
const sem = (m: Scale, i: number): number => m[((i % 7) + 7) % 7] + 12 * Math.floor(i / 7);
const tri = (m: Scale, d: number): number[] => [sem(m, d), sem(m, d + 2), sem(m, d + 4)];
const dim = (t: readonly number[]): boolean => t[1] - t[0] === 3 && t[2] - t[0] === 6;
const vl = (a: readonly number[], b: readonly number[]): number =>
  a.reduce((s, x) => s + Math.min(...b.map((y) => Math.min(md(x - y), 12 - md(x - y)))), 0);

export function lead(prev: readonly number[], pcs: readonly number[]): number[] {
  const p = prev.length >= 3 ? prev : [57, 60, 64];
  let best: number[] = [];
  let bc = 1e9;
  for (let r = 0; r < 3; r++) {
    const y = 50 + md(55 + pcs[r] - 50);
    const a = md(pcs[(r + 1) % 3] - pcs[r]);
    const b = md(pcs[(r + 2) % 3] - pcs[r]);
    for (const o of [[y, y + Math.min(a, b), y + Math.max(a, b)], [y, y + Math.max(a, b), y + Math.min(a, b) + 12]]) {
      const k = o.reduce((s, x, i) => s + Math.abs(x - p[i]), 0);
      if (k < bc) {
        bc = k;
        best = o;
      }
    }
  }
  return best;
}

export function createHarmony(seed: number, P: ScoreProfile, form: Form): HarmonyPlanner {
  const ps: Period[] = [];
  const ids: number[] = [];
  const dg: number[] = [];
  let relax = 0;
  let v: readonly number[] = [];

  const plan = (n0: number, t: number, c: HarmCtx): void => {
    const s = form.at(n0, t, c.state).s;
    const r = s.recipe;
    const sd = P.states[c.state] ?? P.states[P.initial];
    const m = P.scales[sd.mode];
    const ctr = s.centre;
    const grav = c.grav ?? [];
    const R = s.n0 + s.bars - n0;
    const d = (k: number, j = 0): number => u32(seed, 5, n0, k, j);
    const L = [6, 8, 10, 12].filter((p) => p <= R && (R - p === 0 || R - p >= 6));
    const len = L.length ? L[pickw(L.map((p) => [[0.5, 1, 1.5, 2], [1, 1.5, 1, 0.6], [2, 1.5, 0.7, 0.3]][r.hr][(p - 6) / 2]), d(0))] : R;
    const at: number[] = [];
    for (let k = 0; k < len; k += len - k >= 2 && d(1, k) < [0.75, 0.45, 0.15][r.hr] ? 2 : 1) at.push(k);
    const S = at.length;
    const row = (p: number): number[] => {
      const w = (P.chords ?? B)[p].slice();
      const q = sd.row;
      if (q && p === q[0]) w[q[1]] = q[2];
      return w;
    };
    const id = (x: number): number => md(ctr) * 8 + x;
    const bad = (x: readonly number[]): boolean => {
      const A = ids.slice(-36).concat(x.map(id));
      for (let i = Math.max(3, A.length - x.length); i < A.length; i++) {
        for (let j = Math.max(3, i - 32); j < i; j++) if (A[j] === A[i] && A[j - 1] === A[i - 1] && A[j - 2] === A[i - 2] && A[j - 3] === A[i - 3]) return true;
      }
      return false;
    };
    const ok = (x: number): boolean => !dim(tri(m, x));
    const w = (x: number): number => {
      const p = dg[dg.length - 1] ?? 0;
      if (!ok(x) || x === p) return 0;
      let k = 0;
      for (const h of dg.slice(-4)) if (h === x) k++;
      return row(p)[x] * (grav.includes(x + 1) ? 2.5 : 1) * 0.6 ** k * (x === dg[dg.length - 2] ? 0.5 : 1) * Math.exp(-0.25 * vl(tri(m, p), tri(m, x)));
    };
    const degs: number[] = [];
    const push = (x: number): void => {
      degs.push(x);
      dg.push(x);
      ids.push(id(x));
      if (dg.length > 8) dg.shift();
      if (ids.length > 40) ids.shift();
    };
    const pivot = n0 === s.n0 && s.from !== ctr;
    let cad = (c.noCad ? 3 : pickw([0.35, 0.2, 0.2, 0.25], d(2))) as Cadence;
    for (let j = 0; j < S - (S > 1 ? 2 : 0); j++) {
      if (!j && pivot) {
        const O = m.map((x) => md(x + s.from));
        const sc = (x: number): number => {
          const k = tri(m, x).filter((y) => O.includes(md(y + ctr))).length;
          return ok(x) && x && k > 1 ? k + d(3, x) * 0.5 : 0;
        };
        const b = [1, 2, 3, 4, 5, 6].reduce((a, b) => (sc(b) > sc(a) ? b : a));
        if (sc(b) > 0) {
          push(b);
          continue;
        }
      }
      let ws = [0, 1, 2, 3, 4, 5, 6].map((x) => (bad([x]) || (cad === 1 && x === 3 && j === S - 3) ? 0 : w(x)));
      if (!ws.some((x) => x > 0)) {
        relax++;
        ws = [0, 1, 2, 3, 4, 5, 6].map(w);
      }
      push(pickw(ws, d(4, j)));
    }
    if (S > 1) {
      const pen = [3, 4, 6].filter((x) => !(sd.penult ?? [0, 1, 2, 5]).includes(x));
      const T = [[pen, [0]], [[3], [0]], [pen, [2, 5]], [[0, 1, 2, 3, 4, 5, 6], [4, 6]]];
      let pairs: number[][] = [];
      for (let q = 0; q < 8 && !pairs.length; q++) {
        const ty = (cad + q) % 4;
        const p = dg[dg.length - 1];
        for (const a of T[ty][0]) for (const b of T[ty][1]) if (ok(a) && ok(b) && a !== b && a !== p && (q > 3 || !bad([a, b]))) pairs.push([a, b, Math.max(w(a), 0.05)]);
        if (pairs.length) cad = ty as Cadence;
        if (q === 3 && !pairs.length) relax++;
      }
      const pr = pairs[pickw(pairs.map((x) => x[2]), d(5))];
      push(pr[0]);
      push(pr[1]);
    }
    const chords: Chord[] = [];
    const vs: (readonly number[])[] = [];
    degs.forEach((x, j) => {
      const fin = j === S - 1 && !x;
      const u = d(6, j);
      const kind = (fin || u >= [0.1, 0.35, 0.12][r.colour] ? 0 : d(7, j) < 0.5 ? 1 : 2) as 0 | 1 | 2;
      const u3 = d(8, j);
      const add9 = !kind && u3 < (x ? [0, 0, 0.2][r.colour] : [0.3, 0.15, 0.5][r.colour]);
      const sev = !!sd.seventh && !kind && d(9, j) < [0.4, 0.2, 0.6][r.colour];
      const t3 = tri(m, x);
      const pcs = kind === 1 ? [t3[0], sem(m, x + 1), t3[2]] : kind === 2 ? [t3[0], sem(m, x + 3), t3[2]] : t3;
      if (add9) pcs.push(sem(m, x + 8));
      if (sev) pcs.push(sem(m, x + 6));
      chords.push({ deg: x, pcs: pcs.map((y) => y + ctr), kind, add9, sev });
      vs.push((v = lead(v, chords[j].pcs)));
    });
    ps.push({ n0, len, si: s.i, sec: s, state: c.state, cad, centre: ctr, pivot, at, chords, voicings: vs });
    if (ps.length > 8) ps.shift();
  };

  return {
    get relax() {
      return relax;
    },
    at(n, t, c) {
      const s = form.at(n, t, c.state).s;
      for (let q = ps[ps.length - 1]; q; q = ps[ps.length - 1]) {
        const e = form.sections[q.si];
        const L = Math.max(0, Math.min(e === q.sec ? e.n0 + e.bars : q.n0, q.state === c.state ? 1e9 : n) - q.n0);
        if (q.len <= L) break;
        let j = q.at.length;
        for (; j && q.at[j - 1] >= L; j--) {
          ids.pop();
          dg.pop();
        }
        if (j) {
          q.len = L;
          v = q.voicings[j - 1];
          break;
        }
        ps.pop();
        const r = ps[ps.length - 1];
        v = r ? r.voicings[r.at.filter((a) => a < r.len).length - 1] : [];
      }
      for (;;) {
        const p = ps.find((x) => n >= x.n0 && n < x.n0 + x.len && x.sec === s);
        if (p) {
          const k = n - p.n0;
          let j = p.at.length - 1;
          while (p.at[j] > k) j--;
          return { chord: p.chords[j], voicing: p.voicings[j], change: p.at[j] === k, final: j === p.at.length - 1, p, k, slot: j };
        }
        const q = ps[ps.length - 1];
        let n0 = q ? q.n0 + q.len : n;
        if (n0 > n) n0 = n;
        plan(n0, t - (n - n0) * form.barSec, c);
      }
    },
  };
}
