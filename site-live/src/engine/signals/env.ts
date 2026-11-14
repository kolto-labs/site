import type { Hub, Sensor } from './bus';

type Net = EventTarget & { saveData?: boolean };
type Nav = Navigator & { deviceMemory?: number; connection?: Net };

function mq(q: string): MediaQueryList | null {
  return typeof matchMedia === 'function' ? matchMedia(q) : null;
}

/** Viewport, device tier, time of day, reduced motion and reduced data. Never mixed into the latent state. */
export function createEnv(hub: Hub): Sensor {
  const e = hub.frame.env;
  let coarse = false;
  let cores = 0;
  let mem = 0;
  let saveData = false;
  let rd = false;
  let lastDay = -Infinity;

  function measure(): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    hub.vw = w;
    hub.vh = h;
    hub.diag = Math.hypot(w, h);
    if (import.meta.env.DEV) {
      hub.raw.diag = hub.diag;
      hub.raw.dpr = window.devicePixelRatio || 1;
    }
    e.sizeClass = w < 560 ? 'S' : w < 1000 ? 'M' : w < 1200 ? 'L' : 'XL';
  }

  function tier(): void {
    e.reducedData = saveData || rd;
    e.tier = coarse || (cores > 0 && cores <= 4) || (mem > 0 && mem <= 4) || e.reducedData ? 'lite' : 'full';
  }

  return {
    start(signal) {
      const o = { passive: true, signal };
      measure();
      window.addEventListener('resize', () => {
        measure();
        hub.maskScroll(0.6);
      }, o);

      const mCoarse = mq('(pointer: coarse)');
      const mNoHover = mq('(hover: none)');
      const mRm = mq('(prefers-reduced-motion: reduce)');
      const mRd = mq('(prefers-reduced-data: reduce)');
      const readPointer = () => {
        coarse = Boolean(mCoarse?.matches || mNoHover?.matches);
        tier();
      };
      mCoarse?.addEventListener('change', readPointer, o);
      mNoHover?.addEventListener('change', readPointer, o);
      e.reducedMotion = Boolean(mRm?.matches);
      mRm?.addEventListener('change', () => {
        e.reducedMotion = Boolean(mRm.matches);
        hub.emit({ type: 'reducedMotion', t: hub.clock.now(), on: e.reducedMotion });
      }, o);
      rd = Boolean(mRd?.matches);
      mRd?.addEventListener('change', () => {
        rd = mRd.matches;
        tier();
      }, o);

      const nav = navigator as Nav;
      cores = nav.hardwareConcurrency || 0;
      mem = nav.deviceMemory || 0;
      const conn = nav.connection;
      saveData = Boolean(conn?.saveData);
      conn?.addEventListener?.('change', () => {
        saveData = Boolean(conn.saveData);
        tier();
      }, o);

      readPointer();
      hub.frame.pointer.fine = !coarse;
      lastDay = -Infinity;
    },
    stop() {},
    tick(t) {
      if (t - lastDay < 60 && t >= lastDay) return;
      lastDay = t;
      const d = new Date();
      const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
      e.daylight = 0.5 - 0.5 * Math.cos((2 * Math.PI * (h - 2)) / 24);
    },
  };
}
