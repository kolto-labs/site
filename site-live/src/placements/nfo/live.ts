import { whenEngine as engine } from '../../engine';

const SCALE = 3;
const H = 4;
const TEAL = [25, 227, 193];
const SHEEN = [90, 216, 255];

interface Mote {
  x: number;
  y: number;
  v: number;
  ph: number;
  big: boolean;
}

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A thin rail of drifting kolto motes under the viewer. Returns a stop function. */
export async function startRail(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<() => void> {
  const { director, bus } = await engine();
  if (signal.aborted || !canvas.isConnected) return () => {};
  const g = canvas.getContext('2d');
  if (!g) return () => {};
  const w0 = director.world();
  let dark = w0.state === 'R3' || w0.flags.koltoFlow === 'dark';
  const rand = rng(w0.seed ^ 0x4e46);
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let W = 0;
  let motes: Mote[] = [];
  let raf = 0;
  let onScreen = false;
  let last = 0;
  let t = 0;
  let presence = bus.frame().presence.p;
  let reduced = bus.frame().env.reducedMotion || mq.matches;
  let motionScale = 1;
  let accent = 0;
  let accentAt = 0;
  let accentSpan = 0;

  const size = () => {
    const nw = Math.max(8, Math.ceil(canvas.clientWidth / SCALE));
    if (nw === W) return;
    W = nw;
    canvas.width = W;
    canvas.height = H;
    const n = Math.max(3, Math.round(W / 34));
    motes = Array.from({ length: n }, () => ({ x: rand() * W, y: rand() * 3, v: 1.5 + rand() * 3, ph: rand() * 6.28, big: rand() < 0.3 }));
  };

  const draw = () => {
    g.clearRect(0, 0, W, H);
    // rail line
    g.fillStyle = dark ? '#0a1a21' : '#0c2a36';
    g.fillRect(0, H - 1, W, 1);
    // glass sheen sweeping across, very faint
    const sx = ((t * 6) % (W + 40)) - 20;
    for (let i = -6; i <= 6; i++) {
      const x = Math.round(sx + i);
      if (x < 0 || x >= W) continue;
      g.fillStyle = `rgba(${SHEEN[0]},${SHEEN[1]},${SHEEN[2]},${0.1 * (1 - Math.abs(i) / 7)})`;
      g.fillRect(x, 0, 1, H - 1);
    }
    for (const m of motes) {
      const bob = Math.sin(t * 0.9 + m.ph) > 0.2 ? 1 : 0;
      const y = Math.min(H - 2, Math.floor(m.y) + bob);
      const x = Math.floor(m.x);
      if (dark) {
        g.fillStyle = '#05070a';
        g.fillRect(x, y, 1, 1);
        g.fillStyle = 'rgba(70,95,105,0.7)';
        g.fillRect(x + 1, y, 1, 1);
        continue;
      }
      g.fillStyle = `rgba(${TEAL[0]},${TEAL[1]},${TEAL[2]},0.16)`;
      g.fillRect(x - 1, y, 3, 1);
      g.fillStyle = `rgba(${TEAL[0]},${TEAL[1]},${TEAL[2]},0.85)`;
      g.fillRect(x, y, 1, 1);
      if (m.big) g.fillRect(x, y + 1 > H - 2 ? y : y + 1, 1, 1);
    }
    // Small ledger-like ticks echo packing/loading/docking cues already chosen by the director.
    // They are accents only; no ship, crate, or visitor-triggered trade is depicted.
    if (accent && accentSpan > 0) {
      const p = Math.max(0, Math.min(1, (director.now() - accentAt) / accentSpan));
      const strength = Math.sin(Math.PI * p) * 0.32 * (accent === 3 ? 1.15 : 0.85);
      g.fillStyle = dark ? `rgba(120,145,150,${strength * 0.55})` : `rgba(90,216,255,${strength * 0.55})`;
      const count = accent === 3 ? 3 : 2;
      const start = Math.floor((W - count * 3) / 2);
      for (let i = 0; i < count; i++) g.fillRect(start + i * 3, 0, 1, H - 1);
    }
  };

  const tick = (ts: number) => {
    raf = 0;
    if (!onScreen || document.visibilityState === 'hidden' || reduced || signal.aborted) return;
    const dt = Math.min(0.1, last ? (ts - last) / 1000 : 0.016) * Math.max(0.15, presence) * motionScale;
    last = ts;
    t += dt;
    for (const m of motes) {
      m.x += m.v * dt;
      if (m.x > W + 2) {
        m.x = -2;
        m.y = rand() * 3;
      }
    }
    draw();
    raf = requestAnimationFrame(tick);
  };
  const run = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    size();
    if (reduced) {
      t = 0;
      draw();
      return;
    }
    if (onScreen && document.visibilityState !== 'hidden') raf = requestAnimationFrame(tick);
  };
  const off = bus.subscribe((frame) => {
    presence = frame.presence.p;
    reduced = frame.env.reducedMotion;
    motionScale = 0.86 + frame.dwell.g * 0.14 + frame.route.rate * 0.12 + frame.pointer.speed * 0.08;
    run();
  });
  const offEvent = director.on((event) => {
    if (event.phase !== 'start') return;
    if (event.id === 'A4' || event.id === 'A5' || event.id === 'A6' || event.id === 'R2-d') accent = 2;
    else if (event.id === 'D1' || event.id === 'D2' || event.id === 'D5' || event.id === 'R3-d') accent = 3;
    else return;
    accentAt = event.startAt;
    accentSpan = event.duration;
    draw();
  });
  const offWorld = director.on(() => {
    const world = director.world();
    dark = world.state === 'R3' || world.flags.koltoFlow === 'dark';
    draw();
  });

  const io = new IntersectionObserver((es) => {
    onScreen = es[es.length - 1].isIntersecting;
    run();
  });
  io.observe(canvas);
  const ro = new ResizeObserver(() => {
    W = 0;
    run();
  });
  ro.observe(canvas);
  document.addEventListener('visibilitychange', run);
  mq.addEventListener('change', run);
  size();
  draw();

  const stop = () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    ro.disconnect();
    document.removeEventListener('visibilitychange', run);
    mq.removeEventListener('change', run);
    signal.removeEventListener('abort', stop);
    off();
    offWorld();
    offEvent();
  };
  signal.addEventListener('abort', stop, { once: true });
  return stop;
}
