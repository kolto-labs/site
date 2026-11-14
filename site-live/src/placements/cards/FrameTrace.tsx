import { useEffect, useRef, useState } from 'react';
import { useEngine } from '../../engine/react';
import type { EventId } from '../../engine';
import './cards.css';

type Setter = (on: boolean) => void;
const slots = new Map<Element, Setter>();
let current: Setter | null = null;
let io: IntersectionObserver | null = null;
const ratios = new Map<Element, number>();

/** Only one trace is ever live: whichever card was last hovered or focused, or the most visible one on touch. */
function activate(set: Setter | null) {
  if (current === set) return;
  current?.(false);
  current = set;
  set?.(true);
}

function pickInView() {
  let best: Element | null = null;
  let r = 0.2;
  for (const [el, v] of ratios) if (v > r) ((best = el), (r = v));
  activate(best ? (slots.get(best) ?? null) : null);
}

/** Register a frame; returns its `on` state. Hover and focus come from the frame element's own events. */
export function useFrameTrace(frame: React.RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    slots.set(el, setOn);
    const touch = window.matchMedia('(hover: none)').matches;
    if (touch) {
      io ??= new IntersectionObserver(
        (es) => {
          for (const e of es) ratios.set(e.target, e.isIntersecting ? e.intersectionRatio : 0);
          pickInView();
        },
        { threshold: [0, 0.25, 0.5, 0.75, 1] },
      );
      io.observe(el);
    }
    // the nearest frame wins when frames nest
    const own = (t: EventTarget | null) => (t as Element | null)?.closest?.('.frame') === el;
    const enter = (e: Event) => own(e.target) && activate(setOn);
    const leave = () => current === setOn && activate(null);
    if (!touch) {
      el.addEventListener('pointerover', enter);
      el.addEventListener('pointerleave', leave);
    }
    el.addEventListener('focusin', enter);
    el.addEventListener('focusout', leave);
    return () => {
      el.removeEventListener('pointerover', enter);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('focusin', enter);
      el.removeEventListener('focusout', leave);
      io?.unobserve(el);
      ratios.delete(el);
      slots.delete(el);
      if (current === setOn) current = null;
    };
  }, [frame]);
  return on;
}

export function FrameTrace({ on }: { on: boolean }) {
  const engine = useEngine();
  const host = useRef<HTMLSpanElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setVisible(entries[entries.length - 1]?.isIntersecting ?? false));
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  useEffect(() => {
    const el = host.current;
    if (!on || !visible || !engine || !el) return;
    const now = () => engine.director.now();
    let cueUntil = 0;
    // Route keys and the short engine history are coarse, local-only inputs. They
    // select a visual treatment; no pointer coordinates or history leave memory.
    const routeThemes: Record<string, string> = {
      Home: 'kolto', About: 'manaan', Projects: 'datapad', Roadmap: 'dock',
      Faq: 'archive', Join: 'beacon', Credits: 'holocron', NotFound: 'distress',
    };
    const offBus = engine.bus.subscribe((frame) => {
      const pace = Math.max(0.72, Math.min(1.3, 0.86 + frame.dwell.g * 0.16 + frame.route.rate * 0.13 + frame.pointer.speed * 0.08));
      el.style.setProperty('--trace-duration', `${12 / pace}s`);
      el.style.setProperty('--trace-presence', String(Math.max(0.24, frame.presence.p)));
      const historyCode = frame.route.history.reduce((n, key, i) => (n * 33 + key.length * (i + 3)) % 997, 17);
      const routeCode = (historyCode + frame.route.key.length * 19) % 997;
      el.dataset.routeTheme = routeThemes[frame.route.key] ?? 'kolto';
      el.style.setProperty('--trace-route-shift', `${routeCode % 29}px`);
      el.style.setProperty('--trace-history-speed', `${Math.max(8, 18 - frame.route.entropy * 5)}s`);
      el.style.setProperty('--trace-reading', String(Math.max(0, Math.min(1, frame.reading))));
      el.style.setProperty('--trace-pointer', String(Math.max(0, Math.min(1, frame.pointer.headingStrength))));
      if (cueUntil && now() >= cueUntil) {
        el.dataset.loreCue = '';
        cueUntil = 0;
      }
    });
    const loreCues: Partial<Record<EventId, string>> = {
      V2: 'harvest', A4: 'packing', A5: 'loading', A6: 'loading', D1: 'dock', D2: 'depart', D5: 'arrival',
    };
    const offDirector = engine.director.on((event) => {
      const cue = loreCues[event.id];
      if (!cue) return;
      if (event.phase === 'start') {
        el.dataset.loreCue = cue;
        cueUntil = event.startAt + event.duration;
      } else if (cueUntil <= event.startAt + event.duration) {
        el.dataset.loreCue = '';
        cueUntil = 0;
      }
    });
    const setVisibility = () => { el.dataset.hidden = String(document.visibilityState === 'hidden'); };
    setVisibility();
    document.addEventListener('visibilitychange', setVisibility);
    const offWorld = engine.director.on(() => {
      el.dataset.worldState = engine.director.world().state;
    });
    el.dataset.worldState = engine.director.world().state;
    return () => {
      offBus();
      offDirector();
      offWorld();
      document.removeEventListener('visibilitychange', setVisibility);
      el.removeAttribute('data-lore-cue');
      el.removeAttribute('data-world-state');
      el.style.removeProperty('--trace-duration');
      el.style.removeProperty('--trace-presence');
      el.style.removeProperty('--trace-route-shift');
      el.style.removeProperty('--trace-history-speed');
      el.style.removeProperty('--trace-reading');
      el.style.removeProperty('--trace-pointer');
      el.removeAttribute('data-route-theme');
    };
  }, [engine, on, visible]);
  useEffect(() => {
    const c = ref.current;
    if (!on || !visible || !c) return;
    const ac = new AbortController();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const run = () => {
      if (ac.signal.aborted) return;
      import('./live').then((m) => m.startTrace(c, reduced, ac.signal)).catch(() => {});
    };
    const id = ric ? ric(run, { timeout: 300 }) : window.setTimeout(run, 60);
    return () => {
      ac.abort();
      if (!ric) window.clearTimeout(id);
    };
  }, [on, visible]);
  // Only active and visible cards own the canvas or its CSS accents.
  return on ? (
    <span ref={host} className="frame__trace-host" aria-hidden="true" data-visible={String(visible)}>
      <span className="frame__trace-ledger" />
      <canvas ref={ref} className="frame__trace" width={1} height={1} />
    </span>
  ) : null;
}
