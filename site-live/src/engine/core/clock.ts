import { Emitter } from './emitter';
import { slot } from './global';
import type { Unsubscribe } from './types';

/** Engine time: performance time in seconds with hidden-tab time removed. Frozen while hidden. */
export interface EngineClock {
  now(): number;
  hidden(): boolean;
  /** Seconds spent hidden so far. */
  hiddenTotal(): number;
  /** A performance timestamp (ms, e.g. `event.timeStamp`) in engine seconds. */
  fromPerf(ms: number): number;
  onVisibility(fn: (visible: boolean, t: number) => void): Unsubscribe;
  /** Installs the visibility listeners. Idempotent. */
  start(): void;
  dispose(): void;
}

export function createClock(perfNow: () => number = () => performance.now()): EngineClock {
  let hiddenSum = 0;
  let hiddenAt = 0; // perf seconds when it was hidden
  let isHidden = false;
  let ac: AbortController | null = null;
  const vis = new Emitter<boolean, number>();

  const perf = () => perfNow() / 1000;
  const now = () => (isHidden ? hiddenAt : perf()) - hiddenSum;

  function setHidden(h: boolean): void {
    if (h === isHidden) return;
    if (h) {
      hiddenAt = perf();
      isHidden = true;
    } else {
      hiddenSum += Math.max(0, perf() - hiddenAt);
      isHidden = false;
    }
    vis.emit(!h, now());
  }

  return {
    now,
    hidden: () => isHidden,
    hiddenTotal: () => hiddenSum + (isHidden ? Math.max(0, perf() - hiddenAt) : 0),
    fromPerf: (ms) => ms / 1000 - hiddenSum,
    onVisibility: (fn) => vis.on(fn),
    start() {
      if (ac || typeof document === 'undefined') return;
      ac = new AbortController();
      const o = { signal: ac.signal };
      const sync = () => setHidden(document.visibilityState === 'hidden');
      document.addEventListener('visibilitychange', sync, o);
      window.addEventListener('pagehide', () => setHidden(true), o);
      window.addEventListener('pageshow', sync, o);
      sync();
    },
    dispose() {
      ac?.abort();
      ac = null;
      vis.clear();
    },
  };
}

/** The shared clock, created once per document. */
export const getClock = (): EngineClock => slot('clock', () => createClock());
