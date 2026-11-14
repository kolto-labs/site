import type { WorldStateId } from '../core/types';
import type { Actor, Agent } from './kit';
import { BAND, FL, WL } from './kit';
import { adopt } from './steering';

export interface InvCtx {
  state: WorldStateId;
  frameW: number;
  frameH: number;
  ventX: number;
  wl?: number;
  fl?: number;
  log?: (code: string, ru: number, hard: boolean) => void;
}

const near = (a: Actor, b: Actor): number => Math.hypot(a.x - b.x, a.y - b.y);
const walls = (k: string): boolean => k === 'selkath' || k === 'harvester';
const rad = (s: Actor, wl: number): number => (s.dead ? 0 : walls(s.kind) ? (s.y > wl + 4 ? 12 : 0) : s.kind === 'droid' ? 14 : 0);

function push(a: Actor, s: Actor, r: number, lo: number, hi: number): void {
  const d = near(a, s) || 0.01;
  let y = s.y + ((a.y - s.y) / d) * r;
  let x = s.x + ((a.x - s.x) / d) * r;
  if (y < lo || y > hi) {
    y = y < lo ? lo : hi;
    const w = Math.sqrt(Math.max(0, r * r - (y - s.y) ** 2));
    x = s.x + (a.x >= s.x ? w : -w);
  }
  a.x = x;
  a.y = y;
}

export function enforceActors(list: readonly Actor[], c: InvCtx): number {
  const wl = c.wl ?? WL;
  const fl = c.fl ?? FL;
  const col = fl - wl;
  const T = c.state[0] === 'T';
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead) continue;
    if (a.kind === 'firaxa') {
      if (c.state === 'R3' && !a.fade) {
        a.dead = 1;
        n++;
        if (import.meta.env.DEV) c.log?.('I4', a.ru, true);
        continue;
      }
      let t: Actor | null = null;
      const free = a.hi >= 1e8;
      const lo = free ? wl : a.lo;
      const hi = free ? fl : a.hi;
      if (a.y < lo || a.y > hi) {
        const o = a.y < lo ? lo - a.y : a.y - hi;
        a.y = a.y < lo ? lo : hi;
        n++;
        if (import.meta.env.DEV) c.log?.('I10', a.ru, o > 3 || free);
      }
      let hit = 0;
      for (let it = 0; it < 4; it++) {
        hit = 0;
        for (const s of list) {
          if (!s.dead && s.id === a.tid) t = s;
          const r = rad(s, wl);
          const d = near(a, s) || 0.01;
          if (d > r - 0.01) continue;
          hit = 1;
          if (it > 2) break;
          const ux = (a.x - s.x) / d;
          const uy = (a.y - s.y) / d;
          push(a, s, r, lo, hi);
          const vin = a.vx * -ux + a.vy * -uy;
          if (vin > 0) {
            a.vx += ux * vin;
            a.vy += uy * vin;
          }
          if (!it) {
            n++;
            if (import.meta.env.DEV) c.log?.(r < 13 ? 'I1' : 'I9', a.ru, d < r - 4);
          }
        }
        if (!hit) break;
      }
      if (hit) {
        const x0 = a.x;
        let b = 1e9;
        for (const sd of [-1, 1]) {
          let x = x0;
          for (let k = 0; k < 9; k++) {
            for (const s of list) {
              const r = rad(s, wl);
              const w = Math.sqrt(Math.max(0, r * r - (a.y - s.y) ** 2)) + 0.01;
              if (r && Math.abs(x - s.x) < w) x = s.x + sd * w;
            }
          }
          if (Math.abs(x - x0) < Math.abs(b - x0)) b = x;
        }
        a.x = b;
        a.vx = 0;
        n++;
        if (import.meta.env.DEV) c.log?.('I1x', a.ru, false);
      }
      if (t && walls(t.kind)) {
        a.tid = -1;
        a.mode &= ~(1 | 2 | 128);
        n++;
        if (import.meta.env.DEV) c.log?.('I1t', a.ru, true);
      }
    } else if (a.kind === 'harvester') {
      if (T || c.state === 'R1' || c.state === 'R3') {
        a.dead = 1;
        n++;
        if (import.meta.env.DEV) c.log?.('I5', a.ru, true);
        continue;
      }
      const lo = wl + BAND[0] * col;
      const hi = wl + BAND[1] * col;
      if (a.y < lo || a.y > hi) {
        a.y = a.y < lo ? lo : hi;
        n++;
        if (import.meta.env.DEV) c.log?.('I2y', a.ru, true);
      }
      const d = Math.hypot(a.x - c.ventX, a.y - fl);
      if (d < 30) {
        a.x = c.ventX + ((a.x - c.ventX) / (d || 1)) * 30;
        n++;
        if (import.meta.env.DEV) c.log?.('I2v', a.ru, true);
      }
      if (a.alpha > 0.55) a.alpha = 0.55;
      if (a.carry) {
        a.carry = 0;
        n++;
        if (import.meta.env.DEV) c.log?.('I2c', a.ru, true);
      }
    } else if (a.kind === 'selkath' && a.sp === 'selw' && (T || c.state === 'R1' || c.state === 'R3')) {
      a.dead = 1;
      n++;
      if (import.meta.env.DEV) c.log?.('I5f', a.ru, true);
      continue;
    } else if (a.kind === 'sub') {
      if (a.carry) {
        a.carry = 0;
        n++;
        if (import.meta.env.DEV) c.log?.('I3', a.ru, true);
      }
    } else if (a.kind === 'giant') {
      if (c.state === 'R3') {
        a.dead = 1;
        n++;
        if (import.meta.env.DEV) c.log?.('I4g', a.ru, true);
        continue;
      }
      if (36 * a.sc < 42) {
        a.sc = 42 / 36;
        n++;
        if (import.meta.env.DEV) c.log?.('I6s', a.ru, true);
      }
      const w = 36 * a.sc;
      const h = 10 * a.sc;
      const out = (Math.max(0, -(a.x - w / 2)) + Math.max(0, a.x + w / 2 - c.frameW)) / w;
      const outY = Math.max(0, a.y + h / 2 - c.frameH) / h;
      if (Math.max(a.mask, out, outY) < 0.4) {
        a.mask = 0.45;
        n++;
        if (import.meta.env.DEV) c.log?.('I6m', a.ru, true);
      }
    }
    if (a.carry && a.y > wl) {
      a.carry = 0;
      n++;
      if (import.meta.env.DEV) c.log?.('I7', a.ru, true);
    }
  }
  return n;
}

export function checkActors(list: readonly Actor[], c: InvCtx, log: (m: string) => void): number {
  const wl = c.wl ?? WL;
  const fl = c.fl ?? FL;
  const col = fl - wl;
  const T = c.state[0] === 'T';
  let v = 0;
  const bad = (code: string, a: Actor): void => {
    v++;
    log(code + ':' + a.ru);
  };
  for (const a of list) {
    if (a.dead) continue;
    if (a.kind === 'firaxa') {
      if (c.state === 'R3' && !a.fade) bad('I4', a);
      for (const s of list) {
        if (s.dead) continue;
        if (walls(s.kind) && s.y > wl + 4 && near(a, s) < 11.99) bad('I1', a);
        if (s.kind === 'droid' && near(a, s) < 13.99) bad('I9', a);
        if (a.tid === s.id && walls(s.kind)) bad('I1t', a);
      }
      if (a.hi >= 1e8 || a.y < a.lo - 0.01 || a.y > a.hi + 0.01 || a.y < wl) bad('I10', a);
    } else if (a.kind === 'harvester') {
      if (T || c.state === 'R1' || c.state === 'R3') bad('I5', a);
      if (a.y < wl + BAND[0] * col - 0.01 || a.y > wl + BAND[1] * col + 0.01) bad('I2y', a);
      if (Math.hypot(a.x - c.ventX, a.y - fl) < 29.99) bad('I2v', a);
      if (a.alpha > 0.5501 || a.carry) bad('I2c', a);
    } else if (a.kind === 'selkath' && a.sp === 'selw' && (T || c.state === 'R1' || c.state === 'R3')) bad('I5f', a);
    else if (a.kind === 'sub' && a.carry) bad('I3', a);
    else if (a.kind === 'giant') {
      if (c.state === 'R3') bad('I4', a);
      if (36 * a.sc < 42) bad('I6s', a);
      const w = 36 * a.sc;
      const h = 10 * a.sc;
      const out = (Math.max(0, -(a.x - w / 2)) + Math.max(0, a.x + w / 2 - c.frameW)) / w;
      const outY = Math.max(0, a.y + h / 2 - c.frameH) / h;
      if (Math.max(a.mask, out, outY) < 0.3999) bad('I6m', a);
      if (w / 2 + 3.99 > Math.abs(a.x - c.ventX) && a.y + h / 2 > wl && a.y - h / 2 < fl + 3) bad('I12', a);
    }
    if (a.carry && a.y > wl) bad('I7', a);
  }
  return v;
}

export function enforceInvariants(agents: Agent[], c: InvCtx): number {
  for (let i = 0; i < agents.length; i++) adopt(agents[i]);
  return enforceActors(agents as Actor[], c);
}
