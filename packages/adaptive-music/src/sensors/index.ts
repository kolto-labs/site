import type { InputEvent, SignalInput, SignalSnapshot } from '../index';

export interface DomSensorOptions {
  /** Consumer clock in seconds. Defaults to the browser monotonic clock. */
  now?: () => number;
  /** Disable automatic page route and section events. */
  navigation?: boolean;
  /** Receives the same pulled snapshot, useful for a consumer's local diagnostics. */
  onSnapshot?: (snapshot: SignalSnapshot) => void;
}

/** Installs passive, identity-free browser sensors and returns their disposer. */
export function domSensors(input: SignalInput, options: DomSensorOptions = {}): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const now = options.now ?? (() => performance.now() / 1000);
  const abort = new AbortController();
  const { signal } = abort;
  const started = now();
  let px = 0.5;
  let py = 0.5;
  let speed = 0;
  let lastPointer = started;
  let lastMove = started;
  let depth = 0;
  let velocity = 0;
  let lastScroll = started;
  let lastScrollY = window.scrollY;
  let fastClicks = 0;
  let slowClicks = 0;
  let lastClick = started;
  let visible = document.visibilityState !== 'hidden';
  let route = location.pathname;
  const clickTimes: number[] = [];
  const snapshot = (): SignalSnapshot => {
    const t = now();
    const fast = fastClicks;
    const slow = slowClicks;
    fastClicks *= 0.72;
    slowClicks *= 0.985;
    const idle = visible ? Math.min(1, Math.max(0, (t - lastMove - 2) / 90)) : 1;
    const motion = speed * Math.exp(-Math.max(0, t - lastPointer) / 1.2);
    const activity = clamp01(Math.max(motion, Math.abs(velocity) / 4, fast));
    const presence = visible ? 1 - idle : 0;
    const tension = clamp01(Math.abs(velocity) / 4 + fast * 0.25);
    const focus = clamp01(1 - activity * 0.65 - idle * 0.2);
    const curiosity = clamp01((motion + Math.abs(velocity) / 8) * (visible ? 1 : 0));
    const result: SignalSnapshot = {
      pointer: { x: px, y: py, speed: motion, fine: matchMedia('(pointer: fine)').matches },
      clicks: { fast: clamp01(fast), slow: clamp01(slow), regularity: clickRegularity(clickTimes) },
      scroll: { velocity, depth },
      presence: { p: presence, band: !visible || idle > 0.85 ? 'away' : activity > 0.2 ? 'active' : idle > 0.35 ? 'idle' : 'resting' },
      typing: false,
      reading: clamp01((t - lastScroll) / 30),
      daylight: 0.5,
      latent: {
        energy: { value: activity, fast: activity, slow: clamp01(slow), band: band(activity) },
        tension: { value: tension, band: band(tension) },
        focus: { value: focus, band: band(focus) },
        curiosity: { value: curiosity, slow: clamp01(slow), band: band(curiosity) },
      },
      env: environment(),
    };
    options.onSnapshot?.(result);
    return result;
  };
  input.provide(snapshot);
  const emit = (event: InputEvent): void => input.event(event);
  const onMove = (e: PointerEvent): void => {
    const t = now();
    const dt = Math.max(0.016, t - lastPointer);
    const x = clamp01(e.clientX / Math.max(1, innerWidth));
    const y = clamp01(e.clientY / Math.max(1, innerHeight));
    speed = clamp01(Math.hypot(x - px, y - py) / dt / 3);
    px = x; py = y; lastPointer = t; lastMove = t;
  };
  const onScroll = (): void => {
    const t = now();
    const dt = Math.max(0.05, t - lastScroll);
    const y = window.scrollY;
    velocity = clampSigned((y - lastScrollY) / Math.max(1, innerHeight) / dt, 8);
    depth = clamp01(y / Math.max(1, document.documentElement.scrollHeight - innerHeight));
    lastScrollY = y; lastScroll = t;
  };
  const onClick = (): void => {
    const t = now();
    fastClicks = clamp01(fastClicks + (t - lastClick < 0.7 ? 0.38 : 0.12));
    slowClicks = clamp01(slowClicks + 0.06);
    lastClick = t; lastMove = t;
    clickTimes.push(t);
    while (clickTimes.length && clickTimes[0] < t - 12) clickTimes.shift();
    emit({ type: 'click', t });
  };
  const onVisibility = (): void => {
    visible = document.visibilityState !== 'hidden';
    emit({ type: 'visibility', t: now(), visible });
  };
  const onHover = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    const el = e.target instanceof Element ? e.target.closest('a,button,[role="button"],summary,[data-audio-hover]') : null;
    if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
    emit({ type: 'hover', t: now(), kind: hoverKind(el) });
  };
  window.addEventListener('pointermove', onMove, { passive: true, signal });
  window.addEventListener('scroll', onScroll, { passive: true, signal });
  window.addEventListener('click', onClick, { passive: true, signal });
  window.addEventListener('pointerover', onHover, { passive: true, signal });
  document.addEventListener('visibilitychange', onVisibility, { passive: true, signal });
  if (options.navigation !== false) {
    const nav = (): void => {
      const next = location.pathname;
      if (next !== route) { route = next; emit({ type: 'route', t: now(), key: next }); }
    };
    window.addEventListener('popstate', nav, { signal });
    window.addEventListener('hashchange', () => emit({ type: 'section', t: now(), id: location.hash.slice(1) || null }), { signal });
    emit({ type: 'route', t: now(), key: route });
  }
  let sectionObserver: IntersectionObserver | undefined;
  if (options.navigation !== false && typeof IntersectionObserver !== 'undefined') {
    sectionObserver = new IntersectionObserver((entries) => {
      const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (best) emit({ type: 'section', t: now(), id: (best.target as HTMLElement).id || null });
    }, { threshold: [0.25, 0.5, 0.75] });
    document.querySelectorAll<HTMLElement>('section[id],main[id]').forEach((el) => sectionObserver!.observe(el));
  }
  return () => { abort.abort(); sectionObserver?.disconnect(); input.provide(() => ({})); };
}

function environment(): NonNullable<SignalSnapshot['env']> {
  const width = innerWidth;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const lite = coarse || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4) || (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) || !!nav.connection?.saveData;
  return { sizeClass: width < 560 ? 'S' : width < 1000 ? 'M' : width < 1200 ? 'L' : 'XL', coarse, tier: lite ? 'lite' : 'full' };
}
function hoverKind(el: Element): 'link' | 'button' | 'disclosure' | 'card' {
  if (el.matches('[data-audio-hover]')) return 'card';
  if (el.matches('summary,[aria-expanded]')) return 'disclosure';
  if (el.matches('button,[role="button"]')) return 'button';
  return 'link';
}
function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }
function clampSigned(n: number, limit: number): number { return Math.max(-limit, Math.min(limit, n)); }
function band(n: number): 0 | 1 | 2 { return n > 0.66 ? 2 : n > 0.33 ? 1 : 0; }
function clickRegularity(times: readonly number[]): number {
  if (times.length < 3) return 0.5;
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
  return clamp01(1 - Math.sqrt(variance) / Math.max(0.1, mean));
}
