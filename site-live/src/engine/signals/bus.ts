import type { EngineClock } from '../core/clock';
import { getClock } from '../core/clock';
import { Emitter } from '../core/emitter';
import { dropSlot, slot } from '../core/global';
import type { PageKey, Unsubscribe } from '../core/types';
import { createEnv } from './env';
import { createKeys } from './keys';
import { createPointer } from './pointer';
import { createPresence } from './presence';
import { createRoutes } from './routes';
import { createScroll } from './scroll';
import { createSections } from './sections';

export interface SignalFrame {
  /** Engine time in seconds (hidden time excluded). */
  t: number;
  pointer: {
    x: number; y: number;              // 0..1 of the viewport, fast-smoothed
    slowX: number; slowY: number;       // 0..1 of the viewport, slow-smoothed
    headingX: number; headingY: number; // unit direction; zero when stationary
    headingStrength: number;            // 0..1
    speed: number; accel: number; jerk: number;   // normalised 0..1
    straightness: number;              // 0..1
    hover: number;                     // normalised 0..1 (distinct interactive elements entered)
    fine: boolean;                     // mouse or pen
    still: number;                     // seconds since the pointer last moved >2 px
    inside: string | null;             // id of the registered view under the pointer
  };
  clicks: { fast: number; slow: number; regularity: number; medianIci: number; bins: readonly [number, number, number] }; // normalised
  keys: { rate: number; typing: boolean; keyboardNav: boolean }; // no key identities, ever
  scroll: { speed: number; velocity: number; accel: number; reversals: number; depth: number; newDepth: number };
  dwell: { section: number; route: number; sectionId: string | null; g: number }; // section, route: s with presence
  route: { key: PageKey; rate: number; newRoutes: number; entropy: number; history: readonly PageKey[] };
  reading: number;
  presence: { p: number; idle: number; band: 'active' | 'resting' | 'idle' | 'away'; visible: boolean };
  env: {
    sizeClass: 'S' | 'M' | 'L' | 'XL';
    daylight: number;
    reducedMotion: boolean;
    reducedData: boolean;
    tier: 'full' | 'lite';
  };
}

export type BusEvent =
  | { type: 'route'; t: number; from: PageKey | null; to: PageKey; pop: boolean }
  | { type: 'click'; t: number }
  | { type: 'hover'; t: number; kind: 'link' | 'button' | 'disclosure' | 'card' }
  | { type: 'section'; t: number; id: string | null }
  | { type: 'edge'; t: number }
  | { type: 'presence'; t: number; band: SignalFrame['presence']['band'] }
  | { type: 'visibility'; t: number; visible: boolean }
  | { type: 'reducedMotion'; t: number; on: boolean };

export interface InteractionBus {
  /** Latest 20 Hz frame. The object is reused; read it, don't keep it. */
  frame(): Readonly<SignalFrame>;
  /** Called after each 20 Hz feature tick (paused while hidden). */
  subscribe(fn: (f: Readonly<SignalFrame>) => void): Unsubscribe;
  on<K extends BusEvent['type']>(type: K, fn: (e: Extract<BusEvent, { type: K }>) => void): Unsubscribe;
}

/** Mutation methods available to the application shell and sensor owners only. */
export interface SignalProducers {
  notifyRoute(to: PageKey, pop: boolean): void;
  markProgrammaticScroll(ms?: number /* default 600 */): void;
  notifyHotkey(kind: 'nav' | 'toggle'): void;
}

/** Unnormalised values, in memory only, for calibration. Dev builds only; empty in production. */
export interface RawSignals {
  vFast: number; vSlow: number; accel: number; jerk: number; // diag/s, /s², /s³
  pSlowX: number; pSlowY: number;
  hoverPerMin: number;
  clickRate: number; clickRateSlow: number;
  keyRate: number; keyRateSlow: number;
  scrollFast: number; scrollMid: number; // vh/s
  revRate: number; depthRate: number; readingRate: number;
  routeRate: number; newRouteRate: number;
  idle: number; blur: number;
  diag: number; dpr: number;
}

/** Maps a client position to the id of the registered view under it. */
export type InsideResolver = (clientX: number, clientY: number) => string | null;

/** State shared by the signal modules. Internal to `signals/`. */
export interface Hub {
  readonly frame: SignalFrame;
  readonly raw: RawSignals;
  readonly clock: EngineClock;
  vw: number;
  vh: number;
  diag: number;
  /** Engine time until which scroll is treated as programmatic. */
  maskUntil: number;
  /** Engine time of the last input that counts for presence. */
  lastInput: number;
  inside: InsideResolver | null;
  input(t: number): void;
  maskScroll(seconds: number): void;
  emit(e: BusEvent): void;
}

export interface Sensor {
  start(signal: AbortSignal): void;
  stop(): void;
  tick(t: number, dt: number): void;
}

export interface BusInternal extends InteractionBus, SignalProducers {
  readonly clock: EngineClock;
  /** Installs listeners and starts the tick. Idempotent. `route` sets the first route. */
  start(opts?: { route?: PageKey }): void;
  dispose(): void;
  running(): boolean;
  setInsideResolver(fn: InsideResolver | null): void;
  raw(): Readonly<RawSignals>;
}

const TICK_MS = 50;

function neutralFrame(): SignalFrame {
  return {
    t: 0,
    pointer: { x: 0.5, y: 0.5, slowX: 0.5, slowY: 0.5, headingX: 0, headingY: 0, headingStrength: 0, speed: 0, accel: 0, jerk: 0, straightness: 0.5, hover: 0, fine: true, still: 0, inside: null },
    clicks: { fast: 0, slow: 0, regularity: 0.5, medianIci: 0, bins: [0, 0, 0] },
    keys: { rate: 0, typing: false, keyboardNav: false },
    scroll: { speed: 0, velocity: 0, accel: 0, reversals: 0, depth: 0, newDepth: 0 },
    dwell: { section: 0, route: 0, sectionId: null, g: 0 },
    route: { key: 'Home', rate: 0, newRoutes: 0, entropy: 0, history: [] },
    reading: 0,
    presence: { p: 1, idle: 0, band: 'active', visible: true },
    env: { sizeClass: 'L', daylight: 0.5, reducedMotion: false, reducedData: false, tier: 'full' },
  };
}

function zeroRaw(): RawSignals {
  return {
    vFast: 0, vSlow: 0, accel: 0, jerk: 0, pSlowX: 0.5, pSlowY: 0.5, hoverPerMin: 0,
    clickRate: 0, clickRateSlow: 0, keyRate: 0, keyRateSlow: 0, scrollFast: 0, scrollMid: 0,
    revRate: 0, depthRate: 0, readingRate: 0, routeRate: 0, newRouteRate: 0, idle: 0, blur: 0,
    diag: 1, dpr: 1,
  };
}

type Emitters = { [K in BusEvent['type']]: Emitter<Extract<BusEvent, { type: K }>> };

export function createBus(clock: EngineClock): BusInternal {
  const frame = neutralFrame();
  const frames = new Emitter<Readonly<SignalFrame>>();
  const ems: Emitters = {
    route: new Emitter(),
    click: new Emitter(),
    hover: new Emitter(),
    section: new Emitter(),
    edge: new Emitter(),
    presence: new Emitter(),
    visibility: new Emitter(),
    reducedMotion: new Emitter(),
  };

  const hub: Hub = {
    frame,
    raw: import.meta.env.DEV ? zeroRaw() : ({} as RawSignals),
    clock,
    vw: 1,
    vh: 1,
    diag: 1,
    maskUntil: 0,
    lastInput: 0,
    inside: null,
    input(t) {
      if (t > hub.lastInput) hub.lastInput = t;
    },
    maskScroll(seconds) {
      const until = clock.now() + seconds;
      if (until > hub.maskUntil) hub.maskUntil = until;
    },
    emit(e) {
      (ems[e.type] as Emitter<BusEvent>).emit(e);
    },
  };

  const env = createEnv(hub);
  const pointer = createPointer(hub);
  const keys = createKeys(hub);
  const scroll = createScroll(hub);
  const presence = createPresence(hub);
  const sections = createSections(hub);
  const routes = createRoutes(hub, () => {
    scroll.resetRoute();
    sections.resetRoute();
  });
  // Order matters: presence reads the pointer; dwell reads presence.
  const sensors: Sensor[] = [env, pointer, keys, scroll, presence, sections, routes];

  let ac: AbortController | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastT = 0;
  let offVis: Unsubscribe | null = null;

  function tick(): void {
    const t = clock.now();
    const dt = t > lastT ? t - lastT : 0;
    lastT = t;
    for (let i = 0; i < sensors.length; i++) sensors[i].tick(t, dt);
    frame.t = t;
    frames.emit(frame);
  }

  function run(on: boolean): void {
    if (on && timer === null) {
      lastT = clock.now();
      timer = setInterval(tick, TICK_MS);
    } else if (!on && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    clock,
    frame: () => frame,
    subscribe: (fn) => frames.on(fn),
    on: (type, fn) => (ems[type] as Emitter<BusEvent>).on(fn as (e: BusEvent) => void),

    notifyRoute(to, pop) {
      routes.notify(to, pop, clock.now());
    },
    markProgrammaticScroll(ms = 600) {
      hub.maskScroll(ms / 1000);
    },
    notifyHotkey(kind) {
      keys.hotkey(kind, clock.now());
    },

    start(opts) {
      if (typeof window === 'undefined') return;
      if (ac) {
        if (opts?.route) routes.notify(opts.route, false, clock.now());
        return;
      }
      clock.start();
      ac = new AbortController();
      const t = clock.now();
      hub.lastInput = t;
      hub.maskUntil = 0;
      for (const s of sensors) s.start(ac.signal);
      if (opts?.route) routes.notify(opts.route, false, t);
      offVis = clock.onVisibility((visible, at) => {
        frame.presence.visible = visible;
        if (!visible) presence.hide(at);
        run(visible);
        hub.emit({ type: 'visibility', t: at, visible });
      });
      frame.presence.visible = !clock.hidden();
      run(!clock.hidden());
    },
    dispose() {
      run(false);
      offVis?.();
      offVis = null;
      ac?.abort();
      ac = null;
      for (const s of sensors) s.stop();
      frames.clear();
      for (const k of Object.keys(ems) as BusEvent['type'][]) ems[k].clear();
      dropSlot('bus');
    },
    running: () => ac !== null,
    setInsideResolver(fn) {
      hub.inside = fn;
    },
    raw: () => hub.raw,
  };
}

/** The shared bus, created once per document. Doesn't start it. */
export const getBus = (): BusInternal => slot('bus', () => createBus(getClock()));
