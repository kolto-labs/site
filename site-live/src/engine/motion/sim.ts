import type { Rng } from '../core/rng';
import { mulberry32, splitmix32, streamSeed } from '../core/rng';
import type { EventId } from '../core/types';
import type { SceneEvent } from '../director/director';
import { gaitOf, idleEase, npcZ, strideStep } from './gait';
import type { Gait, GaitKind } from './gait';
import { checkActors, enforceActors } from './invariants';
import type { InvCtx } from './invariants';
import type { Actor, Env, Fx, Knobs, Lat, Part } from './kit';
import { X, cl, clearKnobs, knobs, ramp } from './kit';
import { L } from './layout';
import { steerActor } from './steering';
import type { SteerCtx } from './steering';

export type Tick = (p: number, dt: number) => void;

export interface Run {
  e: SceneEvent;
  r: Rng;
  own: Actor[];
  tick: Tick | null;
  end: (() => void) | null;
  live: boolean;
  amb: boolean;
  hold: number;
}

export interface Spec {
  lay: 1 | 2 | 3;
  ax?: number;
  run?: (S: Sim, R: Run) => Tick | void;
}

export type MotionMap = { readonly [K in EventId]: Spec };

export interface Dbg {
  viol: number;
  fixes: number;
  skipped: number;
  reach: [number, number];
  soft: Record<string, number>;
  digest(): number;
}

export interface Sim {
  env: Env;
  t: number;
  steps: number;
  dbg?: Dbg;
  idle: number;
  open: number;
  lat: Lat;
  actors: Actor[];
  parts: Part[];
  fx: Fx[];
  nfx: number;
  k: Knobs;
  runs: Map<number, Run>;
  advance(now: number): number;
  start(e: SceneEvent): void;
  end(e: SceneEvent): void;
  reset(): void;
  add(R: Run, a: Actor): Actor;
  nid(): number;
  put(t: number, x: number, y: number, a?: number, b?: number, c?: number, col?: string): void;
  group(list: readonly Actor[], dt: number, band: readonly [number, number]): void;
  gait(kind: GaitKind, id: number): Gait;
  walk(a: Actor, dx: number, dt: number, kind: GaitKind): void;
  mark(R: Run, name: string, i?: number): number;
  marks(R: Run, name: string): number[];
  seat(id: EventId): Run | null;
  primary(uid: number): Actor | null;
}

const DT = 1 / 60;
const MAXC = 16;
const rk = (seed: number, key: number): Rng => mulberry32(splitmix32((streamSeed(seed, 'motion') ^ Math.imul(key, 0x9e3779b1)) >>> 0));

export function createSim(env: Env, map: MotionMap, ambient: readonly EventId[], log?: (m: string) => void): Sim {
  const base = (k: Knobs): Knobs => {
    clearKnobs(k);
    if (env.state === 'R2') k.wreck = ramp(S.open, 0.3, 0.7);
    if (env.state === 'R3') k.dark = S.open;
    return k;
  };
  const gctx: SteerCtx = { state: env.state, bandY: [0, 0], pointer: null, T: 0, mE: 1 };
  const ictx: InvCtx = { state: env.state, frameW: L.W, frameH: L.H, ventX: L.vx, wl: L.wl, fl: L.fl };
  let n = 0;
  let rc = false;
  const S: Sim = {
    env, t: -1, steps: 0, idle: 1, open: env.state === 'R2' || env.state === 'R3' ? (env.reduced() ? 1 : 0) : 1,
    lat: env.lat(), actors: [], parts: [], fx: [], nfx: 0, k: knobs(), runs: new Map(),
    nid: () => n++,
    add(R, a) {
      a.ru = R.e.uid;
      R.own.push(a);
      S.actors.push(a);
      return a;
    },
    put(t, x, y, a = 0, b = 0, c = 0, col = '') {
      let q = S.fx[S.nfx++];
      if (!q) S.fx.push((q = { t, x, y, a, b, c, col }));
      else {
        q.t = t;
        q.x = x;
        q.y = y;
        q.a = a;
        q.b = b;
        q.c = c;
        q.col = col;
      }
    },
    group(list, dt, band) {
      gctx.bandY[0] = band[0];
      gctx.bandY[1] = band[1];
      gctx.pointer = env.pointer();
      gctx.T = S.lat.T;
      gctx.mE = 0.85 + 0.3 * S.lat.E;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a.dead) continue;
        if (a.kind === 'firaxa' && a.hi >= 1e8) {
          a.lo = band[0];
          a.hi = band[1];
        }
        steerActor(a, S.actors, dt, gctx);
      }
    },
    gait: (kind, id) => gaitOf(S.lat, kind, npcZ(env.seed, id), S.idle),
    walk(a, dx, dt, kind) {
      a.x += dx;
      if (dx !== 0) a.dir = dx < 0 ? -1 : 1;
      strideStep(a, Math.abs(dx), dt, kind, S.lat, env.beat(), Math.abs(dx) / dt);
    },
    mark(R, name, i = 0) {
      let c = 0;
      for (const m of R.e.marks) {
        if (m.name === name && c++ === i) return cl((m.at - R.e.startAt) / R.e.duration, 0, 1);
      }
      return 0.5;
    },
    marks(R, name) {
      const out: number[] = [];
      for (const m of R.e.marks) if (m.name === name) out.push(cl((m.at - R.e.startAt) / R.e.duration, 0, 1));
      return out;
    },
    seat(id) {
      for (const r of S.runs.values()) if (r.e.id === id && !r.amb) return r;
      return null;
    },
    primary(uid) {
      const R = S.runs.get(uid);
      if (!R) return null;
      for (const a of R.own) if (!a.dead && a.alpha > 0.05) return a;
      return null;
    },
    start(e) {
      if (S.runs.has(e.uid) || env.reduced()) return;
      S.runs.set(e.uid, { e, r: rk(env.seed, e.uid), own: [], tick: null, end: null, live: false, amb: false, hold: 0 });
    },
    end(e) {
      const R = S.runs.get(e.uid);
      if (R && e.cut) drop(R);
    },
    reset() {
      base(S.k);
      for (const R of [...S.runs.values()]) if (!R.amb) drop(R);
    },
    advance(now) {
      if (S.t < 0) {
        S.t = now;
        boot();
        return 0;
      }
      let c = 0;
      while (S.t + DT <= now) {
        if (c >= MAXC) {
          if (S.dbg) S.dbg.skipped++;
          S.t = now;
          break;
        }
        c++;
        S.t += DT;
        step();
      }
      return c;
    },
  };

  if (import.meta.env.DEV) {
    const dbg: Dbg = {
      viol: 0, fixes: 0, skipped: 0, reach: [0, 0], soft: {},
      digest() {
        let h = 2166136261;
        const f = (v: number): void => {
          h = Math.imul(h ^ (Math.round(v * 1000) | 0), 16777619);
        };
        for (const a of S.actors) {
          f(a.id);
          f(a.x);
          f(a.y);
          f(a.fr);
          f(a.alpha);
        }
        for (const q of S.parts) {
          f(q.x);
          f(q.y);
        }
        f(S.steps);
        return h >>> 0;
      },
    };
    S.dbg = dbg;
    ictx.log = (code, ru, hard) => {
      if (hard) {
        dbg.viol++;
        log?.(code + ':' + ru);
      } else dbg.soft[code] = (dbg.soft[code] ?? 0) + 1;
    };
  }

  base(S.k);

  function drop(R: Run): void {
    if (R.e.id === 'R2-a' || R.e.id === 'R3-a') S.open = 1;
    R.end?.();
    for (const a of R.own) a.dead = 1;
    S.runs.delete(R.e.uid);
  }

  function boot(): void {
    ambient.forEach((id, i) => {
      const e: SceneEvent = {
        uid: -(i + 1), id, tier: 'ambient', phase: 'start', state: env.state, startAt: S.t, duration: Infinity,
        marks: [], cues: [], variant: { u: 0, side: 1 },
      };
      S.runs.set(e.uid, { e, r: rk(env.seed, e.uid), own: [], tick: null, end: null, live: false, amb: true, hold: 0 });
    });
  }

  function step(): void {
    S.steps++;
    S.nfx = 0;
    if (env.reduced()) return;
    S.lat = env.lat();
    base(S.k);
    S.idle = idleEase(S.idle, S.lat.P, DT);
    for (const R of S.runs.values()) {
      const e = R.e;
      if (S.t < e.startAt) continue;
      if (!R.amb && S.t >= e.startAt + e.duration + R.hold) {
        drop(R);
        continue;
      }
      if (!R.live) {
        R.live = true;
        R.tick = map[e.id].run?.(S, R) ?? null;
      }
      R.tick?.(e.duration === Infinity ? 0 : Math.max(0, (S.t - e.startAt) / e.duration), DT);
    }
    const nf = enforceActors(S.actors, ictx);
    if (env.state === 'R3' && S.open >= 1 && !rc) {
      rc = true;
      for (let i = 0; i < S.parts.length; i++) S.parts[i].col = 1;
    }
    if (import.meta.env.DEV && S.dbg) {
      S.dbg.fixes += nf;
      S.dbg.viol += checkActors(S.actors, ictx, (m) => log?.(m));
      for (let i = 0; i < S.parts.length; i++) {
        const c = S.parts[i].col;
        if (c ? env.state !== 'R3' : env.state === 'R3' && S.open >= 1) {
          S.dbg.viol++;
          log?.('I11');
        }
      }
      if (env.state === 'R3') {
        for (let i = 0; i < S.nfx; i++) {
          if (S.fx[i].t === X.crate && S.fx[i].b) {
            S.dbg.viol++;
            log?.('I11c');
          }
        }
        if (S.open >= 1 && S.k.dark < 0.5) {
          S.dbg.viol++;
          log?.('I11v');
        }
      }
    }
    let j = 0;
    for (let i = 0; i < S.actors.length; i++) {
      const a = S.actors[i];
      if (!a.dead) S.actors[j++] = a;
    }
    S.actors.length = j;
  }

  return S;
}
