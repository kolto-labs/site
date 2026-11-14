// Idle bubbles inside filled tanks. Slow and sparse. Never changes the fill level.
import { whenEngine } from '../../engine';
import { stream } from '../../engine/core/rng';
const NS = 'http://www.w3.org/2000/svg';
const TANKS = 10;
const PITCH = 8;
const H = 16;
const INNER = 14;
const THEMES = ['#c9fff4', '#a9ecff', '#c3e6d2', '#ffe0a8'] as const;

function routeHash(key: string, history: readonly string[]): number {
  // The bus history is visit-local and bounded. Hash only its recent route path;
  // never persist or transmit it.
  let h = 2166136261;
  for (const ch of `${history.slice(-5).join('>')}|${key}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function startBubbles(root: HTMLElement, value: number, signal: AbortSignal): Promise<() => void> {
  const engine = await whenEngine();
  if (signal.aborted || !root.isConnected) return () => {};
  const g = root.querySelector('.kt__bubbles');
  if (!g) return () => {};
  const world = engine.director.world();
  const random = stream(world.seed ^ 0x4b54414e, 'motion');
  const full = Math.min(TANKS, Math.floor(value / (100 / TANKS)));
  const made: SVGRectElement[] = [];
  const count = Math.min(4, Math.max(1, Math.ceil(full / 3)));
  for (let n = 0; n < count; n++) {
    const tank = Math.floor(((n + 0.5) * full) / count);
    if (tank >= full) continue;
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', String(tank * PITCH + 2 + (random() < 0.5 ? 0 : 1)));
    r.setAttribute('y', String(H - 2));
    r.setAttribute('width', '1');
    r.setAttribute('height', '1');
    r.setAttribute('fill', '#c9fff4');
    r.setAttribute('class', 'kt__bubble');
    r.style.setProperty('--rise', `${-(INNER - 3)}px`);
    const duration = 10 + random() * 8;
    r.dataset.baseDuration = String(duration);
    r.style.animationDuration = `${duration}s`;
    r.style.animationDelay = `${-random() * duration}s`;
    g.appendChild(r);
    made.push(r);
  }
  let visible = true;
  let reduced = engine.bus.frame().env.reducedMotion;
  let presence = engine.bus.frame().presence.p;
  let routeDwell = engine.bus.frame().dwell.route;
  let previousRoute = '';
  let previousTheme = -1;
  let eventPace = 1;
  let eventUntil = 0;
  let eventKey = '';
  const pause = () => root.classList.toggle('kt--paused', document.visibilityState === 'hidden' || !visible || reduced || presence < 0.05);
  const updateWorld = () => root.classList.toggle('kt--poisoned', engine.director.world().state === 'R3');
  updateWorld();
  const offWorld = engine.director.on(updateWorld);
  const offDirector = engine.director.on((event) => {
    if (event.phase === 'end') {
      if (event.id === eventKey) {
        eventPace = 1;
        eventUntil = 0;
        eventKey = '';
      }
      return;
    }
    // Existing scene events may tint the cadence; visitors never create the event.
    if (event.id === 'V2') eventPace = 0.84; // open-water harvest run
    else if (event.id === 'A4' || event.id === 'A5' || event.id === 'A6' || event.id === 'D1' || event.id === 'D2') eventPace = 1.14; // packing, loading or docking
    else return;
    eventUntil = event.startAt + event.duration;
    eventKey = event.id;
  });
  const off = engine.bus.subscribe((frame) => {
    reduced = frame.env.reducedMotion;
    presence = frame.presence.p;
    routeDwell = frame.dwell.route;
    const routeSignature = `${frame.route.key}|${frame.route.history.slice(-5).join('>')}`;
    if (routeSignature !== previousRoute) {
      const seed = routeHash(frame.route.key, frame.route.history);
      // Four restrained mineral/water hues; avoid using alignment or moral
      // language for route-derived variation. Adjacent route scenes never reuse
      // the same hue, even when their path hashes happen to collide.
      let theme = seed % THEMES.length;
      if (theme === previousTheme) theme = (theme + 1 + ((seed >>> 5) % (THEMES.length - 1))) % THEMES.length;
      previousTheme = theme;
      previousRoute = routeSignature;
      root.style.setProperty('--kt-bubble-color', THEMES[theme]);
      root.style.setProperty('--kt-current-drift', `${((seed >>> 9) % 5) - 2}px`);
      root.style.setProperty('--kt-route-flow', String(0.94 + ((seed >>> 16) % 13) / 100));
    }
    if (engine.director.now() >= eventUntil) eventPace = 1;
    const readingCurrent = 0.96 + Math.min(0.16, Math.max(0, frame.reading) * 0.16);
    const scrollCurrent = 1 + Math.min(0.08, frame.scroll.depth * 0.08) + Math.min(0.06, Math.abs(frame.scroll.velocity) * 0.015);
    const entropyCurrent = 1 + Math.min(0.08, Math.max(0, frame.route.entropy) * 0.08);
    const attention = (0.9 + Math.min(0.25, routeDwell / 600)) * readingCurrent * scrollCurrent * entropyCurrent;
    for (let i = 0; i < made.length; i++) {
      const base = Number(made[i].dataset.baseDuration) || 14;
      const routeFlow = Number.parseFloat(root.style.getPropertyValue('--kt-route-flow')) || 1;
      made[i].style.animationDuration = `${base / (Math.max(0.45, presence) * attention * eventPace * routeFlow)}s`;
    }
    pause();
  });
  const io = new IntersectionObserver((e) => {
    visible = e[0]?.isIntersecting ?? true;
    pause();
  });
  io.observe(root);
  document.addEventListener('visibilitychange', pause);
  root.classList.add('kt--live');
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    io.disconnect();
    off();
    offWorld();
    offDirector();
    document.removeEventListener('visibilitychange', pause);
    signal.removeEventListener('abort', stop);
    root.classList.remove('kt--live', 'kt--paused', 'kt--poisoned');
    root.style.removeProperty('--kt-bubble-color');
    root.style.removeProperty('--kt-current-drift');
    root.style.removeProperty('--kt-route-flow');
    made.forEach((r) => r.remove());
  };
  signal.addEventListener('abort', stop, { once: true });
  pause();
  return stop;
}
