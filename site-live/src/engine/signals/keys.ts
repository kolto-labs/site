import type { Hub, Sensor } from './bus';
import { isTypingTarget } from '../../lib/dom';
import { Leaky, nsat } from './maths';


const MODIFIERS = new Set([
  'Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'Super', 'Hyper',
  'Fn', 'FnLock', 'CapsLock', 'NumLock', 'ScrollLock', 'Symbol', 'SymbolLock',
]);
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', ' ', 'Spacebar', 'Home', 'End']);

export interface KeysSensor extends Sensor {
  hotkey(kind: 'nav' | 'toggle', t: number): void;
}

/** Key classes only (tab, scroll keys, navigation hotkeys). Never identities, never timing inside fields. */
export function createKeys(hub: Hub): KeysSensor {
  const k = hub.frame.keys;
  const fast = new Leaky(4);
  const slow = new Leaky(45);
  const tabs = new Float64Array(3);
  let tn = 0;
  let tw = 0;
  let typingUntil = -Infinity;

  function hit(t: number): void {
    fast.hit(t);
    if (import.meta.env.DEV) slow.hit(t);
  }

  return {
    start(signal) {
      window.addEventListener('keydown', (e) => {
        if (isTypingTarget(e.target)) {
          // keystroke timing is biometric: only the flag, and presence on the tick's own clock
          typingUntil = hub.clock.now() + 2;
          return;
        }
        const t = hub.clock.fromPerf(e.timeStamp);
        hub.input(t);
        if (e.repeat || MODIFIERS.has(e.key)) return;
        if (e.key === 'Tab') {
          hit(t);
          tabs[tw] = t;
          tw = (tw + 1) % 3;
          if (tn < 3) tn++;
        } else if (SCROLL_KEYS.has(e.key)) {
          hit(t);
        }
      }, { passive: true, signal });
    },
    stop() {},
    tick(t) {
      const r = fast.rate(t);
      k.rate = nsat(r, 1.5);
      k.typing = t < typingUntil;
      if (k.typing) hub.input(t);
      k.keyboardNav = tn === 3 && t - Math.min(tabs[0], tabs[1], tabs[2]) <= 60;
      if (import.meta.env.DEV) {
        hub.raw.keyRate = r;
        hub.raw.keyRateSlow = slow.rate(t);
      }
    },
    hotkey(kind, t) {
      hub.input(t);
      if (kind === 'nav') hit(t);
    },
  };
}
