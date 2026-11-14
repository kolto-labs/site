import { useEffect, useRef } from 'react';
import './nfo.css';

/** Decorative edge for the plain-text viewer. Loads only once it is on screen, one canvas per viewer. */
export function NfoRail() {
  const host = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ac = new AbortController();
    let io: IntersectionObserver | null = null;
    let timer = 0;
    const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (n: number) => void }).requestIdleCallback;

    const load = () => {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      el.appendChild(canvas);
      import('./live')
        .then((m) => m.startRail(canvas, ac.signal))
        .catch(() => canvas.remove());
    };
    io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io?.disconnect();
      io = null;
      timer = ric ? ric(load, { timeout: 800 }) : window.setTimeout(load, 150);
    });
    io.observe(el);
    return () => {
      ac.abort();
      io?.disconnect();
      if (!ric) window.clearTimeout(timer);
      else (window as { cancelIdleCallback?: (n: number) => void }).cancelIdleCallback?.(timer);
      el.replaceChildren();
    };
  }, []);

  return <span ref={host} className="nfo-rail" aria-hidden="true" style={{ display: 'block', height: 12 }} />;
}
