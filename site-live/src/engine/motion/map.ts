import type { Rng } from '../core/rng';
import { mulberry32 } from '../core/rng';
import type { Actor, Kind, Part } from './kit';
import { COL, X, actor, bandY, bez, cl, colH, lerp, ramp, sm } from './kit';
import { L } from './layout';
import type { MotionMap, Run, Sim, Tick } from './sim';
import { M } from './steering';

const { deck: D, wl, fl, vx: VX, H } = L;
const sub = (R: Run): Rng => mulberry32((R.r() * 4294967296) >>> 0);
const walker = (S: Sim, R: Run, kind: Kind, sp: string, x: number, o: Partial<Actor> = {}): Actor =>
  S.add(R, actor(kind, sp, x, o.y ?? D, S.nid(), o));
const SCH = M.sep | M.align | M.coh | M.wander | M.band | M.avoid | M.ptr;
const bayOf = (R: Run, n = 3): number => R.e.variant.bay ?? Math.min(n - 1, Math.floor(R.e.variant.u * n));
const tail = (a: Actor, dt: number): void => {
  a.ph += (1.6 * Math.hypot(a.vx, a.vy) * dt) / 8;
  a.fr = Math.floor(a.ph) & 1;
};
const SB = bandY(L.sch);
const fish = (S: Sim, R: Run, x: number, y: number, o: Partial<Actor> = {}): Actor =>
  S.add(R, actor('firaxa', 'shark', x, y, S.nid(), { mode: SCH, rnd: sub(R), gid: R.e.uid, z: 1, vmax: 8, fmax: 6, lo: SB[0], hi: SB[1], ...o }));
const busy = (S: Sim, x: number, y: number, ks: string): boolean =>
  S.actors.some((b) => ks.includes(b.kind) && Math.hypot(b.x - x, b.y - y) < 24);
const edge = (x: number): number => cl((x + 20) / 30, 0, 1) * cl((340 - x) / 30, 0, 1);

interface Swim {
  a?: Actor;
  xs: number;
  xp: number;
  t1: number;
  t2: number;
  t3: number;
  off: number;
  yc: number;
  ph: number;
}

interface Leg {
  a: number;
  b: number;
  x0: number;
  x1: number;
  c: number;
}

function plan(x0: number, x1: number, t0: number, T: number, v: number, back: boolean): Leg[] {
  const out: Leg[] = [];
  const d = Math.abs(x1 - x0);
  const room = Math.max(T * 0.9 - t0, 1);
  const vv = d / v > room ? Math.min(v * 1.5, d / room) : v;
  const dur = d / vv;
  let t = t0;
  let c = 0;
  while (t + dur <= T * 0.93 || out.length === 0) {
    out.push({ a: t, b: t + dur, x0: c ? x1 : x0, x1: c ? x0 : x1, c: c ? 0 : 1 });
    t += dur + 0.8;
    c ^= 1;
    if (!back && c) break;
  }
  return out;
}

function at(legs: readonly Leg[], s: number, soft = true): { x: number; c: number; o: number } {
  let prev = legs[0];
  for (const g of legs) {
    if (s < g.a) return { x: prev === g ? g.x0 : prev.x1, c: 0, o: soft ? 0 : 1 };
    if (s <= g.b) {
      const u = (s - g.a) / (g.b - g.a);
      const x = lerp(g.x0, g.x1, u);
      return { x, c: g.c, o: soft ? Math.min(cl(Math.abs(x - g.x0) / 7, 0, 1), cl(Math.abs(x - g.x1) / 7, 0, 1)) : 1 };
    }
    prev = g;
  }
  return { x: prev.x1, c: 0, o: soft ? 0 : 1 };
}

function kf(s: number, k: readonly number[]): number {
  if (s <= k[0]) return k[1];
  for (let i = 2; i < k.length; i += 2) {
    if (s <= k[i]) return lerp(k[i - 1], k[i + 1], sm((s - k[i - 2]) / (k[i] - k[i - 2])));
  }
  return k[k.length - 1];
}

const go = (S: Sim, a: Actor, x: number, dt: number, kind: 'selkath' | 'suit' | 'loader'): void => S.walk(a, x - a.x, dt, kind);
const lamp = (S: Sim, R: Run, len = 0.32): number => {
  for (const m of R.e.marks) if (S.t >= m.at && S.t < m.at + len) return 1;
  return 0;
};
const crate = (S: Sim, x: number, y: number, a: number, lit = 1): void => S.put(X.crate, x, y, a, S.env.state === 'R3' ? 0 : lit);

function team(S: Sim, R: Run, n: number, x0: number, x1: number, acc: string, back: boolean, gap: number): Tick {
  const T = R.e.duration;
  const dir = Math.sign(x1 - x0) || 1;
  const items = Array.from({ length: n }, (_, i) => {
    const a = walker(S, R, 'loader', 'suit', x0, { acc, alpha: 0 });
    return { a, legs: plan(x0, x1 - dir * i * 3, 0.4 + i * gap, T, S.gait('loader', a.id).speed, back) };
  });
  return (p, dt) => {
    const s = p * T;
    for (const it of items) {
      const r = at(it.legs, s);
      S.walk(it.a, r.x - it.a.x, dt, 'loader');
      it.a.alpha = r.o;
      it.a.carry = r.c && r.o > 0.1 ? 1 : 0;
    }
  };
}

function vent(S: Sim, R: Run, dark: boolean): Tick {
  let acc = 0;
  let gap = 0;
  const ghost: Actor[] = [];
  if (dark && S.open < 1) {
    const [b0, b1] = bandY(L.sch);
    for (let i = 0; i < 6; i++) {
      ghost.push(fish(S, R, 90 + R.r() * 140, b0 + R.r() * (b1 - b0), { alpha: 0, fade: 1, sc: 0.55, vx: 4, gid: -50 }));
    }
  }
  return (_p, dt) => {
    const dk = dark ? S.open : 0;
    if (ghost.length) {
      S.group(ghost, dt, bandY(L.sch));
      for (const a of ghost) {
        if (a.x > 350) a.x = -30;
        else if (a.x < -30) a.x = 350;
        tail(a, dt);
        a.tm += dt;
        a.alpha = 0.33 * (1 - dk) * ramp(a.tm, 0, 1.5);
        if (dk >= 1) a.dead = 1;
      }
      if (dk >= 1) ghost.length = 0;
    }
    if (dark && dk > 0.5) {
      gap -= dt;
      if (gap <= 0) {
        gap = 0.5 + R.r() * 2.6;
        for (let k = 1 + Math.floor(R.r() * 3); k > 0; k--) spawn(1);
      }
    } else {
      acc += dt * lerp(5.5, 1.5, dk);
      while (acc >= 1) {
        acc -= 1;
        spawn(R.r() < dk ? 1 : 0);
      }
    }
    const pt = S.env.pointer();
    const q = S.parts;
    for (let i = q.length - 1; i >= 0; i--) {
      const b = q[i];
      b.y += b.vy * dt;
      b.x += (Math.sin(b.y * 0.21 + b.a * 6) * 2.2 + b.vx) * dt;
      if (pt && pt.active && Math.hypot(b.x - pt.x, b.y - pt.y) < 30) b.vx += ((0.2 * pt.vx - b.vx) * dt) / 0.8;
      else b.vx *= 1 - dt / 0.8;
      if (b.y <= b.top) {
        if (import.meta.env.DEV && S.dbg && b.top === wl + 2) S.dbg.reach[b.col]++;
        q[i] = q[q.length - 1];
        q.pop();
      }
    }
  };
  function spawn(col: number): void {
    if (S.parts.length > 140) return;
    const u = R.r();
    const reach = col ? u < 0.005 : u < 0.04;
    const p: Part = {
      x: VX + (R.r() - 0.5) * 3,
      y: fl - 1,
      vx: 0,
      vy: -(7 + R.r() * 4) * (col ? 0.6 : 1),
      r: R.r() < 0.22 ? 2 : 1,
      top: reach ? wl + 2 : fl - (col ? 6 + R.r() * 28 : Math.min(colH - 6, -22 * Math.log(1 - R.r()))),
      col,
      a: R.r(),
    };
    S.parts.push(p);
  }
}

function school(S: Sim, R: Run, n: number, al: number, sc: number): Tick {
  const [b0, b1] = bandY(L.sch);
  const sd = R.e.variant.side;
  const cx = 60 + R.r() * 200;
  const own = Array.from({ length: n }, () =>
    fish(S, R, cx + (R.r() - 0.5) * 70, b0 + R.r() * (b1 - b0), { alpha: 0, sc, vx: sd * 4, vy: 0 }),
  );
  const tgt = own.map(() => al * (0.8 + 0.2 * R.r()));
  return (_p, dt) => {
    S.group(own, dt, [b0, b1]);
    for (let i = 0; i < own.length; i++) {
      const a = own[i];
      const w = a.x > 350 ? -30 : a.x < -30 ? 350 : 0;
      if (w && !busy(S, w, a.y, 'selkath droid harvester')) a.x = w;
      tail(a, dt);
      a.tm += dt;
      a.alpha = tgt[i] * ramp(a.tm, 0, 1.5) * edge(a.x);
    }
  };
}

function giant(S: Sim, R: Run, o: Partial<Actor>): Actor {
  return S.add(R, actor('giant', 'giant', 0, 0, S.nid(), { sc: 3.4, z: 0, mask: 0.5, ...o }));
}

function ship(S: Sim, R: Run, x: number, y: number, k: number, o: Partial<Actor> = {}): Actor {
  return S.add(R, actor('ship', 'ship' + k, x, y, S.nid(), { z: 3, ...o }));
}

const SH = [11, 8, 6];
const hvX = (i: number): number => (i ? L.h2 : L.h1);

function land(S: Sim, R: Run, bx: number, k: number, o: Partial<Actor> = {}): { a: Actor; pos: (p: number, p0: number, p1: number) => void } {
  const sd = R.e.variant.side;
  const a = ship(S, R, bx, -30, k, { alpha: 0, ...o });
  const y1 = D - SH[k];
  return {
    a,
    pos(p, p0, p1) {
      const s = sm(ramp(p, p0, p1));
      a.x = bx + sd * 70 * (1 - s) ** 2;
      a.y = lerp(-30, y1, 1 - (1 - s) ** 2);
      a.dir = sd > 0 ? -1 : 1;
    },
  };
}

export const MOTION: MotionMap = {
  V1: { lay: 2, run: (S, R) => vent(S, R, false) },
  V1x: { lay: 2, run: (S, R) => vent(S, R, true) },
  F1: { lay: 2, run: (S, R) => school(S, R, 5 + Math.floor(4 * R.r()), 0.33, 0.55) },
  A1: { lay: 1 },
  A2: { lay: 1 },
  A3: {
    lay: 1,
    run(S, R) {
      const a = walker(S, R, 'selkath', 'sel', 40 + R.r() * 240, { rnd: sub(R) });
      const gr = sub(R);
      let wx = a.x;
      let pause = 1;
      let turn = 0;
      let face: 1 | -1 = 1;
      let last = -99;
      return (_p, dt) => {
        const g = S.gait('selkath', a.id);
        if (turn > 0) {
          turn -= dt;
          a.dir = face;
          return;
        }
        const pt = S.env.pointer();
        if (pt && pt.active && S.t - last >= 20 && gr() < 0.03 * S.lat.Q * dt) {
          last = S.t;
          turn = 0.8;
          face = pt.x < a.x ? -1 : 1;
          return;
        }
        if (pause > 0) {
          pause -= dt;
          return;
        }
        const dx = wx - a.x;
        if (Math.abs(dx) < 1) {
          do wx = 12 + R.r() * 296;
          while (Math.abs(wx - a.x) < 40);
          pause = (1 + R.r() * 2) * g.linger + (R.r() < g.hesitate ? 0.4 + 0.8 * R.r() : 0);
          return;
        }
        S.walk(a, Math.sign(dx) * Math.min(Math.abs(dx), g.speed * dt), dt, 'selkath');
      };
    },
  },
  V2: {
    lay: 2,
    run(S, R) {
      const T = R.e.duration;
      const sd = R.e.variant.side;
      const n = R.r() < 0.5 ? 2 : 3;
      const [y0, y1] = bandY(L.band);
      const pause = 2 + 2 * R.r();
      const v = cl(140 / (0.78 * T - pause), 5, 8);
      const xin = VX - 70 * sd;
      const xout = VX + 70 * sd;
      const sw = Array.from({ length: n }, () => ({ xp: VX + sd * (-10 + 20 * R.r()), t2: pause + R.r(), yc: lerp(y0, y1, 0.3 + 0.4 * R.r()), ph: R.r() * 6 }) as Swim);
      return (p) => {
        const s = p * T;
        for (const q of sw) {
          if (!q.a) {
            for (let k = 0; k < 5 && !q.a; k++) {
              const xs = xin + sd * k * 6;
              const ys = q.yc + 3 * Math.sin(xs * 0.07 + q.ph);
              const dl = Math.abs(q.xp - xs);
              const dr = Math.abs(xout - q.xp);
              const w = Math.max(v, (dl + dr) / (T - s - q.t2));
              if (T - s - q.t2 < 0 || w > 8 || busy(S, xs, ys, 'firaxa harvester')) continue;
              q.a = S.add(R, actor('harvester', 'selw', xs, ys, S.nid(), { alpha: 0, dir: sd as 1 | -1, z: 1 }));
              q.xs = xs;
              q.off = s;
              q.t1 = dl / w;
              q.t2 += q.t1;
              q.t3 = q.t2 + dr / w;
            }
            if (!q.a) continue;
          }
          const u = s - q.off;
          const x = u < q.t1 ? lerp(q.xs, q.xp, cl(u / q.t1, 0, 1)) : u < q.t2 ? q.xp + sd * (u - q.t1) * 0.3 : lerp(q.xp + sd * (q.t2 - q.t1) * 0.3, xout, cl((u - q.t2) / (q.t3 - q.t2), 0, 1));
          q.a.x = x;
          q.a.y = q.yc + 3 * Math.sin(x * 0.07 + q.ph);
          q.a.fr = Math.floor(s * 1.6) & 1;
          q.a.alpha = 0.5 * Math.min(ramp(u, 0, 2), 1 - ramp(u, q.t3 - 2, q.t3));
        }
      };
    },
  },
  A4: {
    lay: 1,
    ax: L.stack + 10,
    run(S) {
      const dyn = [[132, 2], [139, 2], [146, 2], [125, 0], [125, 1], [118, 0], [118, 1], [125, 2]];
      return (p) => {
        const n = Math.floor(p * 9);
        const al = 1 - ramp(p, 0.92, 1);
        for (let i = 0; i < Math.min(n, dyn.length); i++) {
          const born = (i + 1) / 9;
          const drop = 1 - ramp(p, born, born + 0.025);
          crate(S, dyn[i][0], D - 7 * (dyn[i][1] + 1) - drop * 8, al * (1 - drop * 0.6), (Math.floor(S.t * 2 + i) & 1) as number);
        }
        S.k.port = Math.floor(p * 9) & 1 ? 1 : 0;
      };
    },
  },
  A5: { lay: 1, run: (S, R) => team(S, R, R.r() < 0.5 ? 2 : 3, L.dc, L.bay[bayOf(R)], COL.amber, true, 2.4) },
  A6: { lay: 1, run: (S, R) => team(S, R, R.r() < 0.5 ? 2 : 3, L.dc, L.bay[3], COL.mag, true, 2.4) },
  D1: {
    lay: 1,
    run(S, R) {
      R.hold = 3;
      const T = R.e.duration;
      const k = Math.floor(R.r() * 3);
      const sh = land(S, R, L.bay[bayOf(R)], k);
      const end = 1 + R.hold / T;
      return (p) => {
        sh.pos(p, 0, 0.5);
        sh.a.alpha = ramp(p, 0, 0.04) * (1 - ramp(p, end - 0.2, end));
        if (p < 0.5) S.put(X.lamp, sh.a.x, sh.a.y + SH[k] + 1, 1, 0, 0, COL.cyan);
        S.k.fee = lamp(S, R);
      };
    },
  },
  D2: {
    lay: 1,
    run(S, R) {
      const sd = R.e.variant.side;
      const sith = R.r() < 0.4;
      const bx = L.bay[sith ? 3 : Math.min(2, Math.floor(R.e.variant.u * 3))];
      const k = Math.floor(R.r() * 3);
      const a = ship(S, R, bx, D - SH[k], k, { alpha: 0, sp: (sith ? 'shipm' : 'ship') + k });
      const pl = S.mark(R, 'liftoff');
      return (p) => {
        const s = ramp(p, pl, 0.92);
        a.alpha = ramp(p, 0, 0.06);
        a.x = bx + sd * 34 * s * s;
        a.y = lerp(D - SH[k], -50, s * s);
        a.dir = sd > 0 ? 1 : -1;
        crate(S, a.x - 3, a.y - 5, a.alpha);
        crate(S, a.x + 3, a.y - 5, a.alpha);
        if (s > 0 && s < 1) S.put(X.lamp, a.x, a.y + SH[k] + 1, 1, 0, 0, sith ? COL.mag : COL.cyan);
      };
    },
  },
  F2: {
    lay: 2,
    run(S, R) {
      const sd = R.e.variant.side;
      const [b0, b1] = bandY(L.cl);
      const ys = [0, 1, 2, 3].map(() => b0 + R.r() * (b1 - b0));
      const x0 = sd > 0 ? -34 : 354;
      const x1 = sd > 0 ? 354 : -34;
      const len = Math.abs(x1 - x0);
      const at2 = (s: number): [number, number] => [lerp(x0, x1, s), bez(ys[0], ys[1], ys[2], ys[3], s) + 2 * Math.sin(s * 9)];
      const p0 = cl(S.t - R.e.startAt, 0, R.e.duration) / R.e.duration;
      const [sx, sy] = at2(p0);
      const mE = 0.85 + 0.3 * S.lat.E;
      const v = Math.max(15.5 * mE, (len / R.e.duration) * 1.12);
      const a = fish(S, R, sx, sy, { mode: M.seek | M.avoid | M.ptr, vmax: v / mE, fmax: 14, alpha: 0.5, dir: sd as 1 | -1, vx: sd * v, lo: wl + 3, hi: b1 + 10 });
      const band: [number, number] = [wl + 3, b1 + 10];
      return (p, dt) => {
        const [tx, ty] = at2(cl(p + 8 / len, 0, 1.2));
        a.tx = tx;
        a.ty = ty;
        S.group([a], dt, band);
        tail(a, dt);
        a.alpha = 0.5 * edge(a.x);
      };
    },
  },
  A7: {
    lay: 1,
    run(S, R) {
      R.hold = 6;
      const T = R.e.duration;
      const sith = R.r() < 0.5;
      const acc = sith ? COL.mag : COL.amber;
      const bx = L.bay[sith ? 3 : bayOf(R)];
      const buyer = walker(S, R, 'crew', 'suit', L.dc - 70, { acc });
      const co = walker(S, R, 'selkath', 'sel', L.dc - 2, { dir: -1 });
      const ld = walker(S, R, 'loader', 'suit', L.dc, { acc, alpha: 0 });
      const pk = S.mark(R, 'tick');
      const legs = plan(L.dc, bx, pk * T + 0.8, T + R.hold, S.gait('loader', ld.id).speed, false);
      return (p, dt) => {
        const s = p * T;
        const tk = pk * T;
        go(S, buyer, kf(s, [0, L.dc - 70, 0.3 * T, L.dc - 22, tk + 0.8, L.dc - 22, tk + 2.6, L.dc - 40]), dt, 'suit');
        if (s > tk) buyer.dir = -1;
        else buyer.dir = 1;
        if (s > 0.25 * T && s < tk + 0.2) S.put(X.card, buyer.x + 5, D - 24, s > tk ? 1 : 0.7);
        if (s >= tk) S.put(X.tick, co.x - 2, D - 30, ramp(s, tk, tk + 0.15) * (1 - ramp(s, tk + 1.6, tk + 2.4)));
        const r = at(legs, s);
        go(S, ld, r.x, dt, 'loader');
        ld.alpha = r.o;
        ld.carry = r.c && r.o > 0.1 ? 1 : 0;
      };
    },
  },
  S1: {
    lay: 3,
    run(S, R) {
      const a = S.add(R, actor('sub', 'sub', L.sbx, wl + 3, S.nid(), { alpha: 0, z: 2 }));
      return (p, dt) => {
        const s = lerp(p, sm(p), 0.7);
        const x = bez(L.sbx, 100, 215, L.hatch - 6, s);
        const y = bez(wl + 3, 130, 70, fl - 18, s);
        a.vx = (x - a.x) / dt;
        a.vy = (y - a.y) / dt;
        a.x = x;
        a.y = y;
        a.dir = a.vx < 0 ? -1 : 1;
        a.alpha = ramp(p, 0, 0.05) * (1 - ramp(p, 0.94, 1));
        S.k.mon = Math.abs(x - 156) < 26 ? Math.floor(S.t * 4) & 1 : 0;
      };
    },
  },
  S2: {
    lay: 2,
    run(S, R) {
      const T = R.e.duration;
      const crew = [0, 1, 2].map((i) => {
        const a = walker(S, R, 'crew', 'suit', 262 - i * 6, { y: fl, alpha: 0 });
        return { a, legs: plan(262 - i * 6, 232 - i * 6, i * 0.9, T * 1.6, S.gait('suit', a.id).speed * 0.8, true) };
      });
      const [b0, b1] = [fl - 52, fl - 3];
      const fs = Array.from({ length: 5 }, (_, i) =>
        fish(S, R, 250 + (R.r() - 0.5) * 60, b0 + R.r() * (b1 - b0), {
          mode: M.orbit | M.sep | M.avoid | M.ptr, vmax: 10, r: 20 + (i % 2) * 4, lo: b0, hi: b1, alpha: 0, sc: 0.75, gid: R.e.uid,
        }),
      );
      const pf = S.mark(R, 'flash');
      let fleeing = 0;
      return (p, dt) => {
        const s = p * T;
        let cx = 0;
        for (const c of crew) {
          const r = at(c.legs, s, false);
          go(S, c.a, r.x, dt, 'suit');
          c.a.alpha = ramp(s, 0, 1) * (1 - ramp(p, 0.95, 1));
          cx += c.a.x;
        }
        cx /= crew.length;
        const lead = crew[0].a;
        if (p >= pf && p < pf + 0.3 / T) S.put(X.flash, lead.x + lead.dir * 9, fl - 12, 5, 1, 0, COL.white);
        if (fleeing === 0 && p >= pf) fleeing = 2;
        if (fleeing > 0) fleeing -= dt;
        for (const a of fs) {
          a.cx = cx;
          a.cy = fl - 28;
          const fl2 = p >= pf && fleeing > 0;
          a.mode = fl2 ? M.flee | M.avoid : M.orbit | M.sep | M.avoid | M.ptr;
          a.fmax = fl2 ? 18 : 6;
          a.vmax = fl2 ? 16 : 10;
        }
        S.group(fs, dt, [b0, b1]);
        for (const a of fs) {
          tail(a, dt);
          a.tm += dt;
          a.alpha = 0.55 * ramp(a.tm, 0, 1.2) * (1 - ramp(p, 0.94, 1));
        }
      };
    },
  },
  S3: {
    lay: 2,
    ax: L.panel,
    run(S) {
      return (p) => {
        S.k.ga = ramp(p, 0.1, 0.5) * 0.85 - ramp(p, 0.6, 0.9) * 0.3;
        S.k.gb = ramp(p, 0.2, 0.65) * 0.7 - ramp(p, 0.65, 0.9) * 0.25;
        S.k.pod = 0.5 + 0.5 * Math.sin(p * 18);
      };
    },
  },
  D3: {
    lay: 1,
    run(S, R) {
      const sd = R.e.variant.side;
      const a = S.add(R, actor('ship', 'speeder', 0, wl - 7, S.nid(), { z: 3, alpha: 0 }));
      return (p) => {
        const s = p * p * 0.35 + p * 0.65;
        a.x = sd > 0 ? lerp(-40, 360, s) : lerp(360, -40, s);
        a.y = wl - 7 + Math.sin(p * 40) * 0.8;
        a.dir = sd > 0 ? 1 : -1;
        a.alpha = edge(a.x);
        for (let i = 1; i < 5; i++) S.put(X.dust, a.x - a.dir * i * 5, wl - 3 + (i & 1), 0.5 / i, 1, 0, COL.cyan);
      };
    },
  },
  F3: {
    lay: 2,
    run(S, R) {
      const T = R.e.duration;
      const sd = R.e.variant.side;
      const yd = wl + colH * (0.25 + 0.12 * R.r());
      const xe = sd > 0 ? -60 : 380;
      const xs = sd > 0 ? 64 : 256;
      const d = S.add(R, actor('droid', 'droid', xe, yd, S.nid(), { z: 2, alpha: 0 }));
      const [b0, b1] = bandY(L.sch);
      const cm = S.marks(R, 'chase1').concat(S.marks(R, 'chase2'));
      const fs = Array.from({ length: 4 }, (_, i) =>
        fish(S, R, sd > 0 ? 250 + i * 14 : 70 - i * 14, b0 + R.r() * (b1 - b0), {
          mode: M.seek | M.sep | M.avoid, vmax: 14, fmax: 10, alpha: 0, sc: 0.7, gid: R.e.uid,
        }),
      );
      return (p, dt) => {
        const s = p * T;
        const x = kf(s, [0, xe, 0.28 * T, xs, 0.46 * T, xs + sd * 6, 0.52 * T, xs, 0.84 * T, xe]);
        d.vx = (x - d.x) / dt;
        d.x = x;
        d.y = yd + Math.sin(s * 3) * 1.5;
        d.dir = sd > 0 ? 1 : -1;
        d.alpha = edge(d.x) * 0.9;
        d.fr = Math.floor(s * 6) & 1;
        const chase = p > 0.3 && p < 0.86;
        for (const a of fs) {
          a.tm += dt;
          a.mode = chase && Math.hypot(a.x - d.x, a.y - d.y) > 14 ? M.seek | M.sep | M.avoid : M.wander | M.sep | M.avoid | M.band;
          a.lo = b0;
          a.hi = b1;
          a.tid = chase ? d.id : -1;
          a.tx = d.x;
          a.ty = d.y;
          a.alpha = 0.5 * ramp(a.tm, 0, 1.2) * (1 - ramp(p, 0.92, 1)) * edge(a.x);
        }
        S.group(fs, dt, [b0, b1]);
        for (const a of fs) tail(a, dt);
        for (let i = 0; i < cm.length; i++) {
          if (Math.abs(p - cm[i]) < 0.4 / T) {
            S.put(X.lamp, d.x, d.y - 4, 1, 0, 0, COL.amber);
            break;
          }
        }
      };
    },
  },
  C1: {
    lay: 1,
    run(S, R) {
      const T = R.e.duration;
      const g = L.gap;
      const rep = walker(S, R, 'crew', 'suit', 274, { acc: COL.amber, alpha: 0 });
      const sit = walker(S, R, 'crew', 'suit', 304, { acc: COL.mag, alpha: 0, dir: -1 });
      const sec = [0, 1].map((i) => walker(S, R, 'selkath', 'sel', L.off + 4 - i * 8, { alpha: 0 }));
      const ps = S.mark(R, 'security') * T;
      return (p, dt) => {
        const s = p * T;
        const out = ramp(s, 0.84 * T, 0.96 * T);
        go(S, rep, kf(s, [0, 274, 0.16 * T, g - 7, ps + 0.3, g - 7, ps + 1.4, g - 13, 0.84 * T, g - 13, 0.96 * T, 274]), dt, 'suit');
        go(S, sit, kf(s, [0, 304, 0.16 * T, g + 7, ps + 0.3, g + 7, ps + 1.4, g + 13, 0.84 * T, g + 13, 0.96 * T, 304]), dt, 'suit');
        rep.dir = s < 0.84 * T ? 1 : -1;
        sit.dir = s < 0.84 * T ? -1 : 1;
        rep.alpha = ramp(s, 0, 0.8) * (1 - ramp(out, 0.8, 1));
        sit.alpha = ramp(s, 0, 0.8) * (1 - ramp(out, 0.8, 1));
        for (let i = 0; i < 2; i++) {
          const c = sec[i];
          go(S, c, kf(s, [0, L.off + 4 - i * 8, ps - 2.6, L.off + 4 - i * 8, ps, g - 24 - i * 10, 0.86 * T, g - 24 - i * 10, 0.97 * T, L.off]), dt, 'selkath');
          c.dir = s < 0.86 * T ? 1 : -1;
          c.alpha = ramp(s, ps - 2.6, ps - 2.2) * (1 - ramp(s, 0.95 * T, T));
        }
        S.k.cam = 1;
      };
    },
  },
  D4: {
    lay: 1,
    ax: 160,
    run(S, R) {
      const bx = Array.from({ length: 10 }, (_, i) => 22 + i * 30);
      const a = S.add(R, actor('ship', 'racer', -10, wl - 4, S.nid(), { z: 3, alpha: 0 }));
      return (p, dt) => {
        const lap = p < 0.5 ? p / 0.5 : (p - 0.5) / 0.5;
        const dirn = p < 0.5 ? 1 : -1;
        const x = dirn > 0 ? lerp(-10, 330, lap) : lerp(330, -10, lap);
        a.vx = (x - a.x) / dt;
        a.x = x;
        a.y = wl - 4 + Math.sin(x * 0.2) * 1.2;
        a.dir = dirn as 1 | -1;
        a.alpha = ramp(p, 0, 0.03) * (1 - ramp(p, 0.94, 1));
        for (let i = 0; i < bx.length; i++) {
          const x0 = bx[i];
          let al = p >= 0.5 || x > x0 ? 0.9 : 0.15;
          if (p >= 0.5 && Math.abs(x - x0) < 14) al = 1;
          if (p > 0.94) al = Math.floor(S.t * 8) & 1 ? 1 : 0.25;
          S.put(X.lamp, x0, wl + 1, al, 0, 0, i & 1 ? COL.amber : COL.cyan);
        }
      };
    },
  },
  V3: {
    lay: 2,
    run(S, R) {
      const sd = R.e.variant.side;
      const a = giant(S, R, { x: sd > 0 ? 82 : 238, y: H - 4, alpha: 0, dir: sd > 0 ? 1 : -1, sc: 3.4 });
      return (p) => {
        a.alpha = (0.5 + 0.08 * Math.sin(p * 16)) * Math.min(ramp(p, 0, 0.2), 1 - ramp(p, 0.8, 1));
      };
    },
  },
  F4: {
    lay: 2,
    run(S, R) {
      const [b0, b1] = [fl - 60, fl - 3];
      const hs = [0, 1].map(hvX);
      const fs = Array.from({ length: 6 }, (_, i) =>
        fish(S, R, hs[i & 1] + (R.r() - 0.5) * 50, b0 + R.r() * (b1 - b0), {
          mode: M.orbit | M.sep | M.avoid | M.ptr, vmax: 10, r: 22 + (R.r() - 0.5) * 12, lo: b0, hi: b1, alpha: 0, sc: 0.75, gid: R.e.uid + (i & 1) * 0.5,
          cx: hs[i & 1], cy: fl - 31,
        }),
      );
      return (p, dt) => {
        S.group(fs, dt, [b0, b1]);
        for (const a of fs) {
          tail(a, dt);
          a.tm += dt;
          a.alpha = 0.55 * ramp(a.tm, 0, 1.5) * (1 - ramp(p, 0.9, 1));
        }
        S.k.pod = 0.5 + 0.5 * Math.sin(p * 20);
      };
    },
  },
  S4: {
    lay: 2,
    ax: L.h1 + 20,
    run(S, R) {
      const wx = L.h1 + 20;
      const w = walker(S, R, 'crew', 'suit', wx, { y: fl, alpha: 0, dir: 1 });
      const [b0, b1] = [fl - 60, fl - 10];
      const fs = Array.from({ length: 5 }, () =>
        fish(S, R, wx + 36 + R.r() * 40, b0 + R.r() * (b1 - b0), {
          mode: M.seek | M.sep | M.avoid, vmax: 9, alpha: 0, sc: 0.75, gid: R.e.uid, lo: b0, hi: b1,
        }),
      );
      const pp = S.mark(R, 'pulse');
      let age = -1;
      return (p, dt) => {
        w.alpha = ramp(p, 0, 0.05) * (1 - ramp(p, 0.96, 1));
        if (age < 0 && p >= pp) age = 0;
        if (age >= 0) age += dt;
        for (const a of fs) {
          a.tm += dt;
          a.tx = wx + 14;
          a.ty = fl - 24;
          const d = Math.hypot(a.x - wx, a.y - (fl - 12));
          const r = 60 * Math.min(age, 1);
          const hit = age >= 0 && d < r + 6 && age < 1.8;
          a.mode = hit ? M.flee | M.avoid : age > 1.8 ? M.wander | M.sep | M.avoid | M.band : M.seek | M.arrive | M.sep | M.avoid;
          a.cx = wx;
          a.cy = fl - 12;
          a.fmax = hit ? 18 : 6;
          a.vmax = hit ? 20 * (1 - d / 90 + 0.3) : 9;
          a.alpha = 0.55 * ramp(a.tm, 0, 1.2) * (1 - ramp(p, 0.9, 1));
        }
        S.group(fs, dt, [b0, b1]);
        for (const a of fs) tail(a, dt);
        if (age >= 0) {
          S.put(X.ring, wx, fl - 12, 60 * Math.min(age, 1), 0.7 * (1 - ramp(age, 0.5, 1.1)), 0, COL.cyan);
          if (age > 0.35) S.put(X.ring, wx, fl - 12, 60 * Math.min(age - 0.35, 1), 0.35 * (1 - ramp(age - 0.35, 0.5, 1.1)), 0, COL.cyan);
        }
      };
    },
  },
  A8: {
    lay: 1,
    run(S, R) {
      const T = R.e.duration;
      const sd = R.e.variant.side;
      const cx = 264;
      const c = ship(S, R, cx + sd * 50, D - 16, 2, { alpha: 0, dir: sd > 0 ? -1 : 1 });
      const sec = [0, 1].map((i) => walker(S, R, 'selkath', 'sel', L.off + 6 - i * 9, { alpha: 0 }));
      return (p, dt) => {
        const s = p * T;
        const arrive = ramp(p, 0, 0.2);
        c.x = lerp(cx + sd * 50, cx, sm(arrive)) + sd * 60 * ramp(p, 0.86, 1);
        c.y = D - 6 - 12 * (1 - sm(ramp(p, 0, 0.2))) - 2 * Math.sin(s * 2) * (1 - arrive * 0.6);
        c.alpha = ramp(p, 0, 0.05) * (1 - ramp(p, 0.95, 1));
        for (let i = 0; i < 2; i++) {
          const q = sec[i];
          go(S, q, kf(s, [0, L.off + 6 - i * 9, 0.18 * T, L.off + 6 - i * 9, 0.4 * T, cx - 16 - i * 9, 0.62 * T, cx - 16 - i * 9, 0.9 * T, L.off]), dt, 'selkath');
          q.dir = s < 0.62 * T ? 1 : -1;
          q.alpha = ramp(p, 0.16, 0.2) * (1 - ramp(p, 0.94, 1));
        }
        if (p > 0.45 && p < 0.9) crate(S, sec[0].x + sec[0].dir * 7, D - 12, sec[0].alpha);
      };
    },
  },
  D5: {
    lay: 1,
    run(S, R) {
      const T = R.e.duration;
      const sd = R.e.variant.side;
      const bx = L.bay[3];
      const sh = land(S, R, bx, 1);
      const pl = S.mark(R, 'landed');
      const fig = walker(S, R, 'crew', 'cloak', bx, { alpha: 0 });
      const spd = S.add(R, actor('ship', 'speeder', bx - 24, D - 5, S.nid(), { z: 3, alpha: 0 }));
      sh.a.sp = 'ship1d';
      return (p, dt) => {
        const s = p * T;
        sh.pos(p, 0, pl);
        sh.a.alpha = ramp(p, 0, 0.04) * (1 - ramp(p, 0.78, 0.88));
        if (p < pl) S.put(X.lamp, sh.a.x, sh.a.y + SH[1] + 1, 1, 0, 0, COL.mag);
        const t0 = pl * T + 1;
        go(S, fig, kf(s, [0, bx, t0, bx, t0 + 0.2 * T, bx - 22]), dt, 'suit');
        fig.dir = -1;
        fig.alpha = ramp(s, t0, t0 + 0.6) * (1 - ramp(s, t0 + 0.2 * T, t0 + 0.2 * T + 0.8));
        spd.alpha = ramp(p, 0.1, 0.2);
        const lift = ramp(p, 0.62, 0.97);
        spd.x = bx - 24 + sd * lerp(0, 380, lift * lift);
        spd.y = lerp(D - 5, wl - 7, sm(ramp(lift, 0, 0.15)));
        spd.dir = sd > 0 ? 1 : -1;
        spd.alpha *= edge(spd.x);
      };
    },
  },
  C2: {
    lay: 1,
    ax: L.ch,
    run(S, R) {
      const vd = R.e.state === 'T3' ? 2 : R.e.state[0] === 'T' ? 1 : 0;
      const pv = S.mark(R, 'verdict');
      return (p) => {
        S.k.hall = ramp(p, 0, 0.12) * (1 - ramp(p, 0.9, 1));
        S.k.vd = p >= pv ? vd : 0;
        for (let i = 0; i < 5; i++) {
          const born = 0.1 + i * 0.045;
          S.put(X.judge, L.ch - 16 + i * 8, D - 15, ramp(p, born, born + 0.04) * (1 - ramp(p, 0.9, 0.97)));
        }
      };
    },
  },
  F5: {
    lay: 2,
    run(S, R) {
      if (S.env.state === 'R1') return;
      const T = R.e.duration;
      const sd = R.e.variant.side;
      const [b0, b1] = bandY(L.sch);
      const ym = (b0 + b1) / 2;
      const a = actor('selkath', 'selw', 0, ym, S.nid(), { alpha: 0, dir: sd as 1 | -1, z: 1 });
      const xs = VX - sd * 70;
      const xe = VX + sd * 70;
      const fs = Array.from({ length: 8 }, () =>
        fish(S, R, VX + (R.r() - 0.5) * 80, b0 + R.r() * (b1 - b0), { alpha: 0, sc: 0.7, vx: -sd * 3 }),
      );
      return (p, dt) => {
        const u = ramp(p, 0.04, 0.96);
        a.x = lerp(xs, xe, u);
        a.y = ym + 2 * Math.sin(u * 14);
        a.fr = Math.floor(p * T * 1.6) & 1;
        if (!a.ru && !busy(S, a.x, a.y, 'firaxa harvester')) S.add(R, a);
        a.alpha = 0.8 * Math.min(ramp(p, 0, 0.12), 1 - ramp(p, 0.88, 1));
        S.group(fs, dt, [b0, b1]);
        for (const f of fs) {
          tail(f, dt);
          f.tm += dt;
          f.alpha = 0.5 * ramp(f.tm, 0, 1.5) * (1 - ramp(p, 0.92, 1)) * edge(f.x);
        }
      };
    },
  },
  S5: {
    lay: 2,
    ax: L.h2 + 26,
    run(S) {
      const bx = L.h2 + 26;
      return (p) => {
        const r = ramp(p, 0.15, 0.75);
        S.k.pod = 0.5 + 0.5 * Math.sin(p * 30);
        for (let i = 0; i < 5; i++) {
          const w = 7 + (i % 2) * 2;
          const h = Math.round(r * (6 + (i % 3) * 2));
          S.put(X.rect, bx + i * 5 - 10, fl - h, w - 2, h, 1, '#46606b');
          S.put(X.rect, bx + i * 5 - 10, fl - h, w - 2, 1, 1, '#6f8c97');
        }
        for (let i = 0; i < 6; i++) {
          const u = (p * 3 + i / 6) % 1;
          S.put(X.dust, bx - 6 + i * 4 + Math.sin(u * 6 + i) * 2, fl - 4 - u * 14, 0.4 * (1 - u) * Math.min(1, p * 6) * (1 - ramp(p, 0.85, 1)), 1, 0, '#7d97a1');
        }
      };
    },
  },
  'R1-a': {
    lay: 2,
    run(S, R) {
      const T = R.e.duration;
      const sd = R.e.variant.side;
      const hx = hvX(sd > 0 ? 1 : 0);
      const hy = fl - 10;
      const aw = hx > VX ? 1 : -1;
      const a = giant(S, R, { alpha: 0, dir: -aw as 1 | -1 });
      const [r0, r1] = [S.mark(R, 'ram', 0), S.mark(R, 'ram', 1)];
      const ix = hx + aw * 30;
      return (p) => {
        a.alpha = 0.85 * Math.min(ramp(p, 0, 0.1), 1 - ramp(p, 0.9, 1));
        const kx = [0, hx + aw * 150, r0, ix, r0 + 0.17, hx + aw * 90, r1, ix, 1, hx + aw * 130];
        const ky = [0, H + 24, r0, hy, r0 + 0.17, hy + 12, r1, hy, 1, H + 34];
        a.x = kf(p, kx);
        a.y = kf(p, ky);
        const h = (m: number): number => Math.max(0, 1 - Math.abs(p - m) * T * 1.8) * (p >= m ? 1 : 0.4);
        S.k.shake = Math.max(h(r0), h(r1));
        S.k.w0 = 1 - 0.7 * S.k.shake;
        S.k.w1 = 1 - 0.7 * S.k.shake;
        S.k.w2 = 1 - 0.7 * S.k.shake;
      };
    },
  },
  'R1-b': {
    lay: 2,
    ax: 160,
    run(S, R) {
      const ps = S.mark(R, 'scream');
      return (p) => {
        const e = Math.max(0, 1 - Math.abs(p - ps - 0.1) * 5);
        S.k.tint = e;
        S.k.w0 = S.k.w1 = S.k.w2 = 1 + 2.5 * e;
      };
    },
  },
  'R1-c': {
    lay: 2,
    run(S, R) {
      const [b0, b1] = [fl - 62, fl - 3];
      const fs = Array.from({ length: 14 }, (_, i) =>
        fish(S, R, hvX(i & 1) + (R.r() - 0.5) * 60, b0 + R.r() * (b1 - b0), {
          mode: M.orbit | M.sep | M.avoid | M.ptr, vmax: 16, fmax: 9, r: 22 + (R.r() - 0.5) * 12, lo: b0, hi: b1, alpha: 0, sc: 0.8, gid: R.e.uid + (i & 1) * 0.5,
          cx: hvX(i & 1), cy: fl - 32,
        }),
      );
      return (p, dt) => {
        S.group(fs, dt, [b0, b1]);
        for (const a of fs) {
          tail(a, dt);
          a.tm += dt;
          a.alpha = 0.6 * ramp(a.tm, 0, 1.5) * (1 - ramp(p, 0.92, 1));
        }
      };
    },
  },
  'R1-d': {
    lay: 2,
    ax: L.st[0],
    run(S, R) {
      const T = R.e.duration;
      const dk = S.marks(R, 'dark');
      const d = S.add(R, actor('droid', 'droid', L.st[0] - 22, fl - 8, S.nid(), { alpha: 0, z: 2 }));
      let ang = 0;
      let spin = 3;
      const sr = sub(R);
      return (p, dt) => {
        const fd = 1 - ramp(p, 0.94, 1);
        S.k.w0 = 1 - sm(ramp(p, dk[0], dk[0] + 0.03)) * fd;
        S.k.w1 = 1 - sm(ramp(p, dk[1], dk[1] + 0.03)) * fd;
        S.k.w2 = 1 - sm(ramp(p, dk[2], dk[2] + 0.03)) * fd;
        d.alpha = ramp(p, 0, 0.06) * (1 - ramp(p, 0.94, 1));
        if (sr() < dt * 2) spin = -spin * (0.6 + sr());
        ang += spin * dt;
        S.k.spin = ang;
        d.x = L.st[0] - 22 + Math.sin(p * T * 0.9) * 3;
      };
    },
  },
  'R1-e': {
    lay: 2,
    ax: L.st[2],
    run(S, R) {
      const sr = sub(R);
      let on = 0;
      let next = 0.3;
      return (p, dt) => {
        next -= dt;
        if (next <= 0) {
          on = 1 - on;
          next = on ? 0.15 + sr() * 0.35 : 0.2 + sr() * 0.8;
        }
        S.k.ctl = on * Math.min(ramp(p, 0, 0.08), 1 - ramp(p, 0.92, 1));
      };
    },
  },
  'R1-f': {
    lay: 2,
    ax: L.st[1],
    run(S) {
      return (p) => {
        const al = Math.min(ramp(p, 0, 0.12), 1 - ramp(p, 0.88, 1));
        for (let i = 0; i < 2; i++) {
          const q = (p * 1.4 + i * 0.5) % 1;
          S.put(X.rect, L.st[1] - 5 + q * 8, fl - 13 + (i ? 1 : 0), 3, 5 - i, al, COL.void);
        }
      };
    },
  },
  'R1-g': {
    lay: 2,
    run(S, R) {
      const sd = R.e.variant.side;
      const a = S.add(R, actor('sub', 'sub', L.hatch, fl - 16, S.nid(), { alpha: 0, z: 2, dir: -1 }));
      const pl = S.mark(R, 'lightsOut');
      return (p, dt) => {
        const x = kf(p, [0, L.hatch, 0.5, L.hatch - 70 - sd * 6, 1, L.hatch - 108]);
        const y = kf(p, [0, fl - 16, 0.5, fl - 52, 1, fl - 40]);
        a.vx = (x - a.x) / dt;
        a.x = x;
        a.y = y;
        a.dir = -1;
        a.lit = p < pl ? 1 : 0;
        a.alpha = ramp(p, 0, 0.06) * (p < pl ? 1 : 0.7 - 0.7 * ramp(p, pl + 0.2, 1));
        if (p >= pl && p < pl + 0.18) S.put(X.flash, 322, fl - 34, 3 + 6 * ramp(p, pl, pl + 0.05), 0.5 * (1 - ramp(p, pl + 0.05, pl + 0.18)), 0, COL.white);
      };
    },
  },
  'R2-a': {
    lay: 2,
    ax: L.h2,
    run(S, R) {
      const pf = S.mark(R, 'flash');
      return (p) => {
        S.open = p;
        S.k.pod = p < pf ? 0.5 + 0.5 * Math.sin(p * p * 220) : 0;
        if (p >= pf && p < pf + 0.18) {
          const u = ramp(p, pf, pf + 0.18);
          S.put(X.flash, L.h2, fl - 12, 6 + 24 * u, 0.55 * (1 - u), 0, '#ffd9a0');
          S.put(X.ring, L.h2, fl - 10, 8 + 46 * u, 0.3 * (1 - u), 0, COL.amber);
        }
      };
    },
  },
  'R2-b': {
    lay: 2,
    run(S, R) {
      const sd = R.e.variant.side;
      const a = giant(S, R, { alpha: 0, dir: sd as 1 | -1, sc: 3, mask: 0.55, x: sd > 0 ? 60 : 262 });
      return (p) => {
        a.alpha = 0.55 * Math.min(ramp(p, 0, 0.15), 1 - ramp(p, 0.8, 1));
        a.y = lerp(fl - 12, H + 30, sm(p));
        a.x = (sd > 0 ? 60 : 262) + sd * 14 * p;
        a.fr = Math.floor(p * 8) & 1;
      };
    },
  },
  'R2-c': {
    lay: 3,
    run(S, R) {
      const pr = S.mark(R, 'ring');
      const sel = walker(S, R, 'selkath', 'sel', L.con - 7, { dir: 1, alpha: 0 });
      return (p) => {
        sel.alpha = ramp(p, 0, 0.1) * (1 - ramp(p, 0.92, 1));
        S.k.cons = 1;
        if (p >= pr && p < pr + 0.45) {
          const u = (p - pr) / 0.45;
          S.put(X.ring, VX, fl - 3, 70 * u, 0.45 * (1 - u), 0, COL.cyan);
          S.put(X.ring, L.con, D - 11, 1 + 3.5 * u, 0.9, 0, COL.phos);
        }
      };
    },
  },
  'R2-d': {
    lay: 1,
    ax: L.dc,
    run(S, R) {
      const pd = S.mark(R, 'doors');
      const ls = [0, 1].map((i) => walker(S, R, 'loader', 'suit', L.dc - 14 - i * 11, { acc: i ? COL.mag : COL.amber, alpha: 0 }));
      return (p) => {
        S.k.door = ramp(p, pd, pd + 0.06) * (1 - ramp(p, 0.84, 0.92));
        for (let i = 0; i < 2; i++) {
          ls[i].alpha = ramp(p, 0.05 + i * 0.04, 0.1 + i * 0.04) * (1 - ramp(p, 0.93, 1));
          ls[i].dir = Math.floor(p * 6 + i) & 1 ? 1 : -1;
        }
      };
    },
  },
  'R3-a': {
    lay: 2,
    ax: L.h2,
    run(S) {
      return (p) => {
        S.open = p;
        for (let i = 0; i < 9; i++) {
          const u = ramp(p, i * 0.05, i * 0.05 + 0.5);
          if (u <= 0 || u >= 1) continue;
          S.put(X.dust, lerp(L.h2 - 6, VX + 2, u), fl - 14 + 8 * u + Math.sin(u * 5 + i) * 2, 0.8 * Math.sin(u * Math.PI), 2 + (i % 3), 0, COL.void);
        }
      };
    },
  },
  'R3-b': {
    lay: 1,
    run(S, R) {
      const sd = R.e.variant.side;
      const bx = L.bay[bayOf(R)];
      const k = Math.floor(R.r() * 3);
      const sh = land(S, R, bx, k);
      return (p) => {
        const l = ramp(p, 0.55, 0.95);
        sh.pos(Math.min(p, 0.45), 0, 0.45);
        if (p > 0.55) {
          sh.a.x = bx + sd * 34 * l * l;
          sh.a.y = lerp(D - SH[k], -50, l * l);
        }
        sh.a.alpha = ramp(p, 0, 0.04);
        if (p < 0.45 || (l > 0 && l < 1)) S.put(X.lamp, sh.a.x, sh.a.y + SH[k] + 1, 1, 0, 0, COL.cyan);
      };
    },
  },
  'R3-c': { lay: 1, run: (S, R) => team(S, R, 2, L.pk, L.bay[bayOf(R)], COL.amber, false, 3) },
  'R3-d': {
    lay: 1,
    ax: 205,
    run(S, R) {
      return () => {
        S.k.fee = lamp(S, R);
      };
    },
  },
  'R3-e': {
    lay: 1,
    run(S, R) {
      const T = R.e.duration;
      const sd = R.e.variant.side;
      const sels = [0, 1].map((i) => walker(S, R, 'selkath', 'sel', 90 + i * 70 + R.r() * 20, { alpha: 0, dir: sd as 1 | -1 }));
      const sol = [0, 1].map((i) => walker(S, R, 'crew', 'suit', sd > 0 ? -6 - i * 14 : 326 + i * 14, { acc: i ? COL.mag : COL.amber, alpha: 0 }));
      const turn = [0, 0];
      return (p, dt) => {
        const s = p * T;
        for (let i = 0; i < 2; i++) {
          const c = sol[i];
          go(S, c, sd > 0 ? lerp(-6 - i * 14, 326, ramp(s, 0.4, T - 0.4)) : lerp(326 + i * 14, -6, ramp(s, 0.4, T - 0.4)), dt, 'suit');
          c.dir = sd as 1 | -1;
          c.alpha = ramp(s, 0, 0.5) * (1 - ramp(s, T - 0.5, T));
        }
        for (let i = 0; i < 2; i++) {
          const q = sels[i];
          q.alpha = ramp(p, 0, 0.08) * (1 - ramp(p, 0.94, 1));
          const dn = Math.abs(sol[0].x - q.x);
          const dm = Math.abs(sol[1].x - q.x);
          if (dn < 30 || dm < 30) turn[i] = 2;
          else turn[i] = Math.max(0, turn[i] - dt);
          if (turn[i] > 0) q.dir = (dm < dn ? sol[1].x : sol[0].x) < q.x ? 1 : -1;
        }
      };
    },
  },
  'T1-a': {
    lay: 1,
    run(S, R) {
      const pt = S.mark(R, 'token');
      const co = walker(S, R, 'selkath', 'sel', L.dc - 12, { dir: 1, alpha: 0 });
      const bx = L.bay[3];
      return (p) => {
        co.alpha = ramp(p, 0, 0.06) * (1 - ramp(p, 0.94, 1));
        const u = ramp(p, 0.1, pt);
        if (p > 0.1 && p <= pt + 0.04) {
          const x = lerp(bx - 6, L.dc - 7, u);
          S.put(X.token, x, D - 10 - 4 * Math.sin(u * Math.PI), 1 - ramp(p, pt, pt + 0.04), Math.floor(S.t * 6) & 1);
        }
      };
    },
  },
};
