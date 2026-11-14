import type { Hub, Sensor } from './bus';
import { isTypingTarget } from '../../lib/dom';
import { Leaky, nsat } from './maths';

const SEL = 'main section, main [data-section]';

export interface SectionsSensor extends Sensor {
  resetRoute(): void;
}

/** Section dwell (weighted by presence) and reading. Ids are `route:index`; no content is read. */
export function createSections(hub: Hub): SectionsSensor {
  const dw = hub.frame.dwell;
  let io: IntersectionObserver | null = null;
  let mo: MutationObserver | null = null;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let observed: Element[] = [];
  let index = new WeakMap<Element, number>();
  const inBand = new Set<Element>();
  let cur: string | null = null;
  let dSec = 0;
  const reading = new Leaky(30);
  let selected = false;

  function setCurrent(id: string | null): void {
    if (id === cur) return;
    cur = id;
    dSec = 0;
    dw.sectionId = id;
    hub.emit({ type: 'section', t: hub.clock.now(), id });
  }

  function pick(): void {
    let best = -1;
    for (const el of inBand) {
      const i = index.get(el);
      if (i !== undefined && i > best) best = i;
    }
    setCurrent(best >= 0 ? `${hub.frame.route.key}:${best}` : null);
  }

  function scan(): void {
    pending = null;
    if (!io) return;
    const els = Array.from(document.querySelectorAll(SEL));
    const same = els.length === observed.length && els.every((el, i) => el === observed[i]);
    if (same) {
      if (cur === null) pick();
      return;
    }
    io.disconnect();
    inBand.clear();
    index = new WeakMap();
    observed = els;
    els.forEach((el, i) => {
      index.set(el, i);
      io!.observe(el);
    });
    // the observer reports every new target once; pick() runs from that callback
    if (els.length === 0) pick();
  }

  function schedule(): void {
    if (pending === null) pending = setTimeout(scan, 100);
  }

  function onSelection(): void {
    if (isTypingTarget(document.activeElement)) return;
    const sel = document.getSelection();
    const non = Boolean(sel && sel.rangeCount > 0 && !sel.isCollapsed);
    if (non && !selected) reading.hit(hub.clock.now());
    selected = non;
  }

  return {
    start(signal) {
      if (typeof IntersectionObserver === 'function') {
        io = new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (e.isIntersecting) inBand.add(e.target);
            else inBand.delete(e.target);
          }
          pick();
        }, { rootMargin: '-45% 0px -45% 0px' });
        if (typeof MutationObserver === 'function') {
          mo = new MutationObserver(schedule);
          mo.observe(document.getElementById('main') ?? document.body, { childList: true, subtree: true });
        }
        scan();
      }
      const o = { passive: true, signal };
      document.addEventListener('selectionchange', onSelection, o);
      document.addEventListener('copy', () => {
        if (!isTypingTarget(document.activeElement)) reading.hit(hub.clock.now());
      }, o);
    },
    stop() {
      io?.disconnect();
      mo?.disconnect();
      io = null;
      mo = null;
      if (pending !== null) clearTimeout(pending);
      pending = null;
      observed = [];
      inBand.clear();
    },
    tick(t, dt) {
      if (cur !== null) dSec += hub.frame.presence.p * dt;
      dw.section = dSec;
      const r = reading.rate(t);
      hub.frame.reading = nsat(r, 1 / 30);
      if (import.meta.env.DEV) hub.raw.readingRate = r;
    },
    resetRoute() {
      setCurrent(null);
      schedule();
    },
  };
}
