import { whenEngine as engine } from '../../engine';

/** Kolto bubbles drift along a frame edge. One canvas at a time; the caller owns that rule. */
const KOLTO = '#19e3c1';
const PX = 3; // css px per art pixel

interface Bub {
  t: number; // 0..1 along the long axis
  s: number; // speed per second
  o: number; // offset across the short axis (art px)
  ph: number;
}

export async function startTrace(canvas: HTMLCanvasElement, reduced: boolean, signal: AbortSignal): Promise<void> {
  let calm = true;
  let engineBus: import('../../engine/signals/bus').InteractionBus | null = null;
  let watchWorld: ((fn: () => void) => () => void) | undefined;
  let readCalm = () => calm;
  try {
    const { director, bus } = await engine();
    calm = director.world().state !== 'R3'; // no kolto glow in the poisoned state
    engineBus = bus;
    reduced = bus.frame().env.reducedMotion || reduced;
    watchWorld = (fn) => director.on(fn);
    readCalm = () => director.world().state !== 'R3';
  } catch {
    // This trace is engine-driven. If the shared engine is unavailable, leave
    // the canvas empty instead of presenting a fixed-seed imitation.
    return;
  }
  if (signal.aborted) return;
  const g = canvas.getContext('2d');
  if (!g) return;
  const rect = canvas.getBoundingClientRect();
  const vertical = rect.height > rect.width;
  const cw = Math.max(1, Math.round(rect.width / PX));
  const ch = Math.max(1, Math.round(rect.height / PX));
  canvas.width = cw;
  canvas.height = ch;
  const long = vertical ? ch : cw;
  const short = vertical ? cw : ch;
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const bubs: Bub[] = Array.from({ length: 5 }, (_, i) => ({
    t: i / 5 + rnd() * 0.1,
    s: 0.12 + rnd() * 0.1,
    o: Math.floor(rnd() * short),
    ph: rnd() * 6.28,
  }));
  const draw = (time: number) => {
    g.clearRect(0, 0, cw, ch);
    for (const b of bubs) {
      const pos = Math.floor(((b.t + time * b.s) % 1) * long);
      const wob = Math.round(Math.sin(time * 2 + b.ph) * 0.6) + b.o;
      const x = vertical ? Math.max(0, Math.min(short - 1, wob)) : pos;
      const y = vertical ? long - 1 - pos : Math.max(0, Math.min(short - 1, wob));
      const fade = Math.sin(((pos + 0.5) / long) * Math.PI);
      g.globalAlpha = 0.18 * fade; // glow
      g.fillStyle = KOLTO;
      g.fillRect(x - 1, y - 1, 3, 3);
      g.globalAlpha = 0.85 * fade;
      g.fillRect(x, y, 1, 1);
    }
    g.globalAlpha = 1;
  };
  let presence = engineBus?.frame().presence.p ?? 1;
  let reducedMotion = reduced;
  let raf = 0;
  let last = performance.now();
  let time = 0;
  const frame = (now: number) => {
    raf = 0;
    if (signal.aborted || reducedMotion || !calm) return;
    if (document.visibilityState === 'hidden') return;
    time += Math.min(0.1, (now - last) / 1000) * Math.max(0.15, presence);
    last = now;
    draw(time);
    raf = requestAnimationFrame(frame);
  };
  const vis = () => {
    if (document.visibilityState === 'visible' && !raf && !signal.aborted && !reducedMotion && calm) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  const off = engineBus?.subscribe((f) => {
    presence = f.presence.p;
    reducedMotion = f.env.reducedMotion;
    if (reducedMotion) {
      cancelAnimationFrame(raf);
      raf = 0;
      if (calm) draw(0.3);
      else g.clearRect(0, 0, cw, ch);
    } else {
      vis();
    }
  });
  const offWorld = watchWorld?.(() => {
    calm = readCalm();
    if (!calm) {
      cancelAnimationFrame(raf);
      raf = 0;
      g.clearRect(0, 0, cw, ch);
    } else if (reducedMotion) draw(0.3);
    else vis();
  });
  document.addEventListener('visibilitychange', vis);
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(raf);
    off?.();
    offWorld?.();
    document.removeEventListener('visibilitychange', vis);
    g.clearRect(0, 0, cw, ch);
  });
  if (reducedMotion && calm) draw(0.3);
  else if (calm) raf = requestAnimationFrame(frame);
}
