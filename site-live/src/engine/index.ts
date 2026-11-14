import type { AudioEngine, BeatInfo } from '../audio/binding';
import type { EngineClock } from './core/clock';
import { dropSlot, slot } from './core/global';
import type { EventId, PageKey, Unsubscribe, WorldStateId } from './core/types';
import type { Director, DirectorInternal, SceneEvent, SceneMark, ViewSpec, WorldSnapshot } from './director/director';
import type { MotionApi, MountOpts, Placement } from './motion/index';
import type { InteractionBus, SignalFrame } from './signals/bus';
import type { Band, Dim, DimValue, LatentSnapshot, LatentState } from './state/latent';

export type { AudioEngine, BeatInfo, Band, Dim, DimValue, Director, EngineClock, EventId, InteractionBus };
export type { LatentSnapshot, LatentState, MotionApi, MountOpts, PageKey, Placement, SceneEvent, SceneMark };
export type { SignalFrame, Unsubscribe, ViewSpec, WorldSnapshot, WorldStateId };

export interface Engine {
  readonly version: 1;
  readonly clock: EngineClock;
  /** Read-only signal stream for consumers. Producers stay in engine/host.ts. */
  readonly bus: InteractionBus;
  readonly latent: LatentState;
  readonly director: Director;
  motion(): Promise<MotionApi>;
  audio(): Promise<AudioEngine>;
  audioIfLoaded(): AudioEngine | null;
  dispose(): Promise<void>;
}

interface Boot {
  e: Engine | null;
  p: Promise<Engine> | null;
  idle: boolean;
  ready: Promise<Engine>;
  done: (e: Engine) => void;
  fail: (error: unknown) => void;
  route: () => PageKey;
  m: Promise<MotionApi> | null;
  a: Promise<AudioEngine> | null;
  ai: AudioEngine | null;
  disposing: Promise<void> | null;
  disposed: boolean;
}

const client = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined';
const listeners = (): Set<() => void> => slot('facade-subs', () => new Set<() => void>());

function readyState(): Pick<Boot, 'ready' | 'done' | 'fail'> {
  let done!: Boot['done'];
  let fail!: Boot['fail'];
  const ready = new Promise<Engine>((resolve, reject) => {
    done = resolve;
    fail = reject;
  });
  // A background boot can fail before any placement is awaiting readiness.
  // Keep that rejection observable to callers without producing an unhandled one.
  void ready.catch(() => {});
  return { ready, done, fail };
}

const state = (): Boot =>
  slot('facade', () => ({
    e: null, p: null, idle: false, ...readyState(),
    route: () => 'Home' as PageKey, m: null, a: null, ai: null, disposing: null, disposed: false,
  }));

function load(): Promise<Engine> {
  const b = state();
  if (b.disposing) return b.disposing.then(() => load());
  if (b.e) return Promise.resolve(b.e);
  b.p ??= (async () => {
    const [{ getBus }, { getLatent }] = await Promise.all([import('./signals/bus'), import('./state/latent')]);
    const bus = getBus();
    bus.start({ route: b.route() });
    const { getDirector, visitSeed } = await import('./director/director');
    const seed = visitSeed();
    const director: DirectorInternal = getDirector(seed);
    const latent = getLatent(seed);
    director.start();
    bus.notifyRoute(b.route(), false);
    const deps = { bus, latent, director, clock: bus.clock };
    let engineDisposed = false;
    const e: Engine = {
      version: 1,
      clock: bus.clock,
      bus,
      latent,
      director,
      motion: () => {
        if (engineDisposed || b.disposed || b.disposing) return Promise.reject(new Error('Engine is disposing'));
        return (b.m ??= import('./motion/index')
          .then((m) => m.getMotion({ ...deps, beat: () => b.ai?.beat() ?? null }))
          .catch((err) => {
            b.m = null;
            throw err;
          }));
      },
      audio: () => {
        if (engineDisposed || b.disposed || b.disposing) return Promise.reject(new Error('Engine is disposing'));
        return (b.a ??= import('../audio/binding')
          .then((m) => (b.ai = m.getAudioEngine(deps)))
          .catch((err) => {
            b.a = null;
            throw err;
          }));
      },
      audioIfLoaded: () => b.ai,
      dispose: () => {
        if (b.disposing) return b.disposing;
        engineDisposed = true;
        b.disposed = true;
        b.disposing = (async () => {
          const [audio, motion] = await Promise.all([
            b.a?.catch(() => null) ?? Promise.resolve(null),
            b.m?.catch(() => null) ?? Promise.resolve(null),
          ]);
          await audio?.dispose();
          motion?.dispose();
          director.dispose();
          bus.dispose();
          bus.clock.dispose();
          b.e = null;
          b.p = null;
          b.a = null;
          b.ai = null;
          b.m = null;
          b.idle = false;
          for (const fn of listeners()) fn();
          dropSlot('visitSeed');
          dropSlot('facade');
        })();
        return b.disposing;
      },
    };
    b.e = e;
    b.done(e);
    for (const fn of listeners()) fn();
    return e;
  })().catch((err) => {
    b.p = null;
    b.fail(err);
    const next = readyState();
    b.ready = next.ready;
    b.done = next.done;
    b.fail = next.fail;
    throw err;
  });
  return b.p;
}

export function getEngine(): Engine | null {
  if (!client()) return null;
  const b = state();
  return b.disposing ? null : b.e;
}

export function bootEngine(route?: () => PageKey): void {
  if (!client()) return;
  const b = state();
  if (route) b.route = route;
  if (b.disposing) {
    void b.disposing.then(() => bootEngine(route));
    return;
  }
  if (b.e || b.p || b.idle) return;
  b.idle = true;
  const run = (): void => {
    b.idle = false;
    load().catch(() => {});
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 });
  else setTimeout(run, 300);
}

export function startEngine(): Promise<Engine> {
  return client() ? load() : new Promise<Engine>(() => {});
}

export function whenEngine(): Promise<Engine> {
  if (!client()) return new Promise<Engine>(() => {});
  const b = state();
  if (b.disposing) return b.disposing.then(() => whenEngine());
  const ready = b.ready;
  bootEngine();
  return ready;
}

export function onEngine(fn: () => void): Unsubscribe {
  if (!client()) return () => {};
  const subs = listeners();
  subs.add(fn);
  return () => subs.delete(fn);
}

export function pulse(): number {
  return getEngine()?.audioIfLoaded()?.pulse() ?? 0;
}

export function beat(): BeatInfo | null {
  return getEngine()?.audioIfLoaded()?.beat() ?? null;
}
