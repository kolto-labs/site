import { useEffect, useRef, type ReactElement } from 'react';
import { useWorld } from '../../engine/react';
import './roadmap.css';

interface Props {
  value: number | null;
  label: string;
  tone: 'done' | 'active' | 'next' | 'later';
}

const TANKS = 10;
const PITCH = 8; // tank 6 wide + 2 gap
const W = TANKS * PITCH - 2;
const H = 16;
const INNER = 14; // fluid rows per tank
const FLUID = '#19e3c1';
const FLUID_TOP = '#7ff3dc';
const GLASS = '#5ad8ff';

/** Rows of fluid for tank i, from the true value (each tank holds a tenth). */
function rowsFor(v: number, i: number): number {
  const frac = Math.max(0, Math.min(1, (v - i * (100 / TANKS)) / (100 / TANKS)));
  if (frac <= 0) return 0;
  return Math.max(1, Math.round(frac * INNER));
}

function Tanks({ v, tone }: { v: number | null; tone: Props['tone'] }) {
  const glass: ReactElement[] = [];
  const fluid: ReactElement[] = [];
  for (let i = 0; i < TANKS; i++) {
    const x = i * PITCH;
    glass.push(
      <g key={i}>
        <rect x={x + 1} y={1} width={4} height={INNER} fill={GLASS} fillOpacity={0.07} />
        <rect x={x} y={1} width={1} height={INNER} fill={GLASS} fillOpacity={0.45} />
        <rect x={x + 5} y={1} width={1} height={INNER} fill={GLASS} fillOpacity={0.45} />
        <rect x={x} y={H - 1} width={6} height={1} fill={GLASS} fillOpacity={0.45} />
        <rect x={x} y={0} width={6} height={1} className={`kt__cap kt__cap--${tone}`} />
      </g>,
    );
    const r = v === null ? 0 : rowsFor(v, i);
    if (r > 0) {
      fluid.push(
        <g key={i}>
          <rect x={x + 1} y={H - 1 - r} width={4} height={r} fill={FLUID} />
          <rect x={x + 1} y={H - 1 - r} width={4} height={1} fill={FLUID_TOP} />
        </g>,
      );
    }
  }
  return (
    <svg
      className="kt__svg"
      viewBox={`0 0 ${W} ${H}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      style={{ width: '100%', aspectRatio: `${W} / ${H}` }}
    >
      {glass}
      <g className="kt__fluid">{fluid}</g>
      <g className="kt__bubbles" data-full={v === null ? '' : String(v)} />
    </svg>
  );
}

export function KoltoTanks({ value, label, tone }: Props) {
  const world = useWorld();
  const ref = useRef<HTMLDivElement>(null);
  const filled = value !== null && value > 0;
  const worldState = world?.state ?? 'R0';

  useEffect(() => {
    const el = ref.current;
    if (!el || !filled) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    const ac = new AbortController();
    const start = () => {
      import('./bubbles')
        .then((m) => {
          if (!cancelled) return m.startBubbles(el, value as number, ac.signal).then((dispose) => { stop = dispose; });
          return undefined;
        })
        .catch(() => {});
    };
    const idleWindow = window as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const ric = idleWindow.requestIdleCallback;
    const id = ric ? ric(start, { timeout: 800 }) : window.setTimeout(start, 200);
    return () => {
      cancelled = true;
      ac.abort();
      if (ric) idleWindow.cancelIdleCallback?.(id);
      else window.clearTimeout(id);
      stop?.();
    };
  }, [filled, value]);

  if (value === null) {
    return (
      <div className={`kt kt--${tone} kt--unknown`} ref={ref} data-world-state={worldState}>
        <Tanks v={null} tone={tone} />
        <span className="kt__pct">{tone === 'active' ? 'in progress' : 'not started'}</span>
      </div>
    );
  }
  const v = Math.round(Math.max(0, Math.min(100, value)));
  return (
    <div className={`kt kt--${tone}`} ref={ref} data-world-state={worldState} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
      <Tanks v={v} tone={tone} />
      <span className="kt__pct" aria-hidden="true">
        {v}%
      </span>
    </div>
  );
}
