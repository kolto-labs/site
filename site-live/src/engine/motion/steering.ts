import type { WorldStateId } from '../core/types';
import type { Actor, Agent } from './kit';
import { actor } from './kit';

export const M = { seek: 1, arrive: 2, wander: 4, sep: 8, align: 16, coh: 32, band: 64, orbit: 128, flee: 256, avoid: 512, ptr: 1024 } as const;

export interface SteerCtx {
  state: WorldStateId;
  bandY: [number, number];
  pointer: { x: number; y: number; active: boolean } | null;
  T?: number;
  mE?: number;
}

export function adopt(a: Agent): Actor {
  const x = a as Actor;
  if (x.rnd === undefined) {
    const d = actor(a.kind, '', a.x, a.y, a.id, { mode: M.seek | M.arrive | M.sep | M.avoid });
    Object.assign(a, { ...d, ...a });
  }
  return x;
}

export function steerActor(a: Actor, ns: readonly Actor[], dt: number, c: SteerCtx): void {
  const m = a.mode;
  const fm = a.fmax;
  const T = c.T ?? 0;
  let fx = 0;
  let fy = 0;
  let gx = 0;
  let gy = 0;
  if (m & 3) {
    const dx = a.tx - a.x;
    const dy = a.ty - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const s = m & 2 && d < 12 ? (a.vmax * d) / 12 : a.vmax;
    fx += (s * dx) / d - a.vx;
    fy += (s * dy) / d - a.vy;
  }
  if (m & 4 && a.rnd) {
    a.wa += (a.rnd() * 2 - 1) * 1.2 * Math.sqrt(3 * dt);
    const sp = Math.hypot(a.vx, a.vy);
    const h = sp > 0.1 ? Math.atan2(a.vy, a.vx) : a.wa;
    const dx = Math.cos(h) * 12 + Math.cos(a.wa) * 5;
    const dy = Math.sin(h) * 12 + Math.sin(a.wa) * 5;
    const d = Math.hypot(dx, dy) || 1;
    const w = 0.5 * (1 - 0.5 * T);
    fx += (dx / d) * fm * w;
    fy += (dy / d) * fm * w;
  }
  if (m & 568) {
    let sx = 0;
    let sy = 0;
    let ax = 0;
    let ay = 0;
    let cx = 0;
    let cy = 0;
    let na = 0;
    let nc = 0;
    let ox = 0;
    let oy = 0;
    for (let i = 0; i < ns.length; i++) {
      const n = ns[i];
      if (n === a || n.dead) continue;
      const dx = a.x - n.x;
      const dy = a.y - n.y;
      const d = Math.hypot(dx, dy) || 0.01;
      if (n.kind === 'selkath' || n.kind === 'harvester' || n.kind === 'droid') {
        if (m & 512 && d < 22) {
          const k = (1 - d / 22) * 1.6;
          ox += (dx / d) * k;
          oy += (dy / d) * k;
        }
        continue;
      }
      if (n.gid !== a.gid || n.kind !== a.kind) continue;
      if (m & 8 && d < 10) {
        const k = Math.min(3, 10 / d - 1);
        sx += (dx / d) * k;
        sy += (dy / d) * k;
      }
      if (d < 28) {
        ax += n.vx;
        ay += n.vy;
        na++;
      }
      if (d < 40) {
        cx += n.x;
        cy += n.y;
        nc++;
      }
    }
    fx += 1.6 * fm * sx;
    fy += 1.6 * fm * sy;
    gx = 2 * fm * ox;
    gy = 2 * fm * oy;
    if (m & 16 && na) {
      const w = 0.8 + 0.6 * T;
      fx += ((ax / na - a.vx) * w) / 2;
      fy += ((ay / na - a.vy) * w) / 2;
    }
    if (m & 32 && nc) {
      const dx = cx / nc - a.x;
      const dy = cy / nc - a.y;
      const d = Math.hypot(dx, dy) || 1;
      fx += (dx / d) * fm * 0.6;
      fy += (dy / d) * fm * 0.6;
    }
  }
  if (m & 64) {
    const free = a.hi >= 1e8;
    const lo = free ? c.bandY[0] : a.lo;
    const hi = free ? c.bandY[1] : a.hi;
    if (a.y < lo + 6) {
      fy += 1.5 * fm * ((lo + 6 - a.y) / 6) ** 2;
      if (a.y < lo && a.vy < 0) a.vy *= 0.8;
    } else if (a.y > hi - 6) {
      fy -= 1.5 * fm * ((a.y - hi + 6) / 6) ** 2;
      if (a.y > hi && a.vy > 0) a.vy *= 0.8;
    }
  }
  if (m & 128) {
    const dx = a.x - a.cx;
    const dy = a.y - a.cy;
    const d = Math.hypot(dx, dy) || 1;
    const k = a.vmax;
    const rv = (a.r - d) * 1.5;
    fx += (-dy / d) * k + (dx / d) * rv - a.vx;
    fy += (dx / d) * k + (dy / d) * rv - a.vy;
  }
  if (m & 256) {
    const dx = a.x - a.cx;
    const dy = a.y - a.cy;
    const d = Math.hypot(dx, dy) || 1;
    fx += (dx / d) * a.vmax - a.vx;
    fy += (dy / d) * a.vmax - a.vy;
  }
  const p = c.pointer;
  if (m & 1024 && p && p.active) {
    const dx = a.x - p.x;
    const dy = a.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 48 && d > 0.01) {
      const k = 0.15 * fm * (1 - d / 48);
      fx += (dx / d) * k;
      fy += (dy / d) * k;
    }
  }
  const gl = Math.hypot(gx, gy);
  if (gl > fm) {
    gx = (gx / gl) * fm;
    gy = (gy / gl) * fm;
  }
  const f = Math.hypot(fx, fy);
  const room = fm - Math.min(gl, fm);
  if (f > room) {
    fx = (fx / f) * room;
    fy = (fy / f) * room;
  }
  fx += gx;
  fy += gy;
  a.vx += fx * dt;
  a.vy += fy * dt;
  const vm = a.vmax * (c.mE ?? 1);
  const v = Math.hypot(a.vx, a.vy);
  if (v > vm) {
    a.vx = (a.vx / v) * vm;
    a.vy = (a.vy / v) * vm;
  }
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  if (v > 0.5) a.dir = a.vx < 0 ? -1 : 1;
}

export function steer(a: Agent, ns: readonly Agent[], dt: number, c: SteerCtx): void {
  for (let i = 0; i < ns.length; i++) adopt(ns[i]);
  steerActor(adopt(a), ns as readonly Actor[], dt, c);
}
