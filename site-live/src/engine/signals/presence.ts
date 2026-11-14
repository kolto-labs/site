import type { Hub, Sensor, SignalFrame } from './bus';

type PresenceBand = SignalFrame['presence']['band'];

export interface PresenceSensor extends Sensor {
  /** The tab was hidden: P is 0 until it is visible again. */
  hide(t: number): void;
}

/**
 * Presence P. Stillness while focused counts as watching or reading: P holds at 1
 * for 60 s (180 s with a fine pointer resting on a scene view), then decays; blur cuts it.
 */
export function createPresence(hub: Hub): PresenceSensor {
  const pr = hub.frame.presence;
  const ptr = hub.frame.pointer;
  let focused = true;
  let blurAt = 0;

  function setBand(band: PresenceBand, t: number): void {
    if (band === pr.band) return;
    pr.band = band;
    hub.emit({ type: 'presence', t, band });
  }

  return {
    start(signal) {
      const o = { passive: true, signal };
      focused = document.hasFocus();
      blurAt = hub.clock.now();
      window.addEventListener('focus', () => {
        focused = true;
        hub.input(hub.clock.now());
      }, o);
      window.addEventListener('blur', () => {
        focused = false;
        blurAt = hub.clock.now();
      }, o);
    },
    stop() {},
    tick(t) {
      const idle = Math.max(0, t - hub.lastInput);
      const hold = ptr.fine && ptr.inside !== null ? 180 : 60;
      const pf = idle <= hold ? 1 : Math.exp(-(idle - hold) / 120);
      const tb = focused ? 0 : Math.max(0, t - blurAt);
      const p = pf * Math.exp(-tb / 30);
      pr.p = p;
      pr.idle = idle;
      setBand(idle < 5 ? 'active' : p >= 1 ? 'resting' : p >= 0.2 ? 'idle' : 'away', t);
      if (import.meta.env.DEV) {
        hub.raw.idle = idle;
        hub.raw.blur = tb;
      }
    },
    hide(t) {
      pr.p = 0;
      setBand('away', t);
    },
  };
}
