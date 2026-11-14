import { useEffect, useRef } from 'react';
import './notfound.css';

export default function NotFoundWindow() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ac = new AbortController();
    let dispose: (() => void) | undefined;
    const start = () => {
      if (ac.signal.aborted) return;
      import('./live')
        .then((m) => m.mountWindow(canvas, ac.signal))
        .then((d) => {
          if (ac.signal.aborted) d();
          else dispose = d;
        })
        .catch(() => {});
    };
    const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = ric ? ric(start, { timeout: 800 }) : window.setTimeout(start, 200);
    return () => {
      ac.abort();
      if (!ric) window.clearTimeout(id);
      dispose?.();
    };
  }, []);
  return (
    <div
      className="nf-window"
      aria-hidden="true"
      style={{ width: 'min(100%, 320px)', aspectRatio: '16 / 7', margin: '0 0 clamp(32px, 6vw, 64px)', border: '3px double var(--rule-hi)', overflow: 'hidden' }}
    >
      <canvas ref={ref} className="nf-window__canvas" style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  );
}
