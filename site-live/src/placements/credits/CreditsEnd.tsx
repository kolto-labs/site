import { useEffect, useRef } from 'react';
import './credits.css';

/** Quiet last shot below the credits: the docks and the floating city at the waterline. */
export function CreditsEnd() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ac = new AbortController();
    let dispose: (() => void) | undefined;
    let cancelled = false;
    const run = () => {
      import('./live')
        .then((m) => m.start(canvas, ac.signal))
        .then((d) => {
          if (cancelled) d();
          else dispose = d;
        })
        .catch(() => {});
    };
    const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = ric ? ric(run, { timeout: 1500 }) : window.setTimeout(run, 300);
    return () => {
      cancelled = true;
      ac.abort();
      if (!ric) window.clearTimeout(id);
      dispose?.();
    };
  }, []);
  return <canvas ref={ref} className="credits-end" aria-hidden="true" style={{ aspectRatio: '320 / 75' }} />;
}
