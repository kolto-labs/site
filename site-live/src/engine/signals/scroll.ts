import type { Hub, Sensor } from './bus';
import { Leaky, clamp01, ema, nlog, nsat } from './maths';

export interface ScrollSensor extends Sensor {
  resetRoute(): void;
}

/** Scroll speed, reversals and new depth. scrollY is read on the tick, not per event. */
export function createScroll(hub: Hub): ScrollSensor {
  const s = hub.frame.scroll;
  let lastY = 0;
  let sFast = 0;
  let sMid = 0;
  let sVel = 0;
  let sAccel = 0;
  let lastVel = 0;
  let lastSign = 0;
  const rev = new Leaky(20);
  const deeper = new Leaky(30);
  let dmax = 0;
  let mark = 0;
  let room = 0;
  let roomDirty = true;
  let roomAt = -Infinity;
  let recheck = false;
  let lastEdge = -Infinity;

  return {
    start(signal) {
      const o = { passive: true, signal };
      window.addEventListener('scroll', () => {
        const t = hub.clock.now();
        if (t >= hub.maskUntil) hub.input(t);
      }, o);
      window.addEventListener('wheel', (e) => hub.input(hub.clock.fromPerf(e.timeStamp)), o);
      window.addEventListener('hashchange', () => hub.maskScroll(0.6), o);
      window.addEventListener('resize', () => {
        roomDirty = true;
      }, o);
      lastY = window.scrollY;
    },
    stop() {},
    tick(t, dt) {
      const y = window.scrollY;
      const moved = y !== lastY;
      const masked = t < hub.maskUntil;
      let v = 0;
      if (y !== lastY) {
        roomDirty = true;
        if (dt > 0 && !masked) v = (y - lastY) / (hub.vh * dt);
      }
      lastY = y;
      if (v > 20) v = 20;
      else if (v < -20) v = -20;
      const a = Math.abs(v);
      sFast = ema(sFast, a, dt, 0.3);
      if (import.meta.env.DEV) sMid = ema(sMid, a, dt, 4);
      sVel = ema(sVel, v, dt, 0.3);
      const accel = dt > 0 ? Math.abs(sVel - lastVel) / dt : 0;
      sAccel = ema(sAccel, accel, dt, 0.5);
      lastVel = sVel;
      if (a > 0.1) {
        const sign = v > 0 ? 1 : -1;
        if (lastSign !== 0 && sign !== lastSign) rev.hit(t);
        lastSign = sign;
      }

      if (roomDirty && t - roomAt >= 1) {
        room = document.documentElement.scrollHeight - hub.vh;
        roomAt = t;
        roomDirty = recheck;
        recheck = false;
      }
      const d = clamp01(y / Math.max(1, room));
      if (moved && !masked && (d <= 0.002 || d >= 0.998) && t - lastEdge >= 4) {
        lastEdge = t;
        hub.emit({ type: 'edge', t });
      }
      if (d > dmax) dmax = d;
      if (masked) {
        if (dmax > mark) mark = dmax; // a programmatic jump is not exploration
      } else {
        while (dmax >= mark + 0.1) {
          deeper.hit(t);
          mark += 0.1;
        }
      }

      const rr = rev.rate(t);
      const dr = deeper.rate(t);
      s.speed = nlog(sFast, 0.05, 8);
      s.velocity = sVel;
      s.accel = nlog(sAccel, 0.5, 20);
      s.reversals = nsat(rr, 0.15);
      s.depth = d;
      s.newDepth = nsat(dr, 1 / 20);
      if (import.meta.env.DEV) {
        hub.raw.scrollFast = sFast;
        hub.raw.scrollMid = sMid;
        hub.raw.revRate = rr;
        hub.raw.depthRate = dr;
      }
    },
    resetRoute() {
      dmax = 0;
      mark = 0;
      lastSign = 0;
      roomDirty = true;
      roomAt = -Infinity;
      recheck = true;
    },
  };
}
