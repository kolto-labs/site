import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import { beat, getEngine, onEngine, pulse } from './index';
import type { BeatInfo, DimValue, Engine, LatentSnapshot, MountOpts, Placement, SceneEvent, ViewSpec, WorldSnapshot } from './index';

const dim = (v: number, band: 0 | 1): Readonly<DimValue> => Object.freeze({ value: v, fast: v, slow: v, band });

export const HYDRATION_LATENT: Readonly<LatentSnapshot> = Object.freeze({
  t: 0,
  energy: dim(0.15, 0),
  tension: dim(0.2, 0),
  focus: dim(0.5, 1),
  curiosity: dim(0.2, 0),
  presence: 1,
});

const noop = (): void => {};
const none = (): null => null;

export function useEngine(): Engine | null {
  return useSyncExternalStore(onEngine, getEngine, none);
}

export function useLatent<T>(select: (s: Readonly<LatentSnapshot>) => T, hz: 1 | 5 = 5): T {
  const e = useEngine();
  const sel = useRef(select);
  sel.current = select;
  const sub = useCallback((cb: () => void) => (e ? e.latent.subscribe(cb, { hz }) : noop), [e, hz]);
  return useSyncExternalStore(
    sub,
    () => sel.current(e ? e.latent.get() : HYDRATION_LATENT),
    () => sel.current(HYDRATION_LATENT),
  );
}

export function useWorld(): Readonly<WorldSnapshot> | null {
  const e = useEngine();
  const box = useRef<{ cur: SceneEvent | null; rm: boolean; w: Readonly<WorldSnapshot> } | null>(null);
  const sub = useCallback((cb: () => void) => {
    if (!e) return noop;
    const a = e.director.on(cb);
    const b = e.latent.subscribe(cb, { hz: 1 });
    return () => {
      a();
      b();
    };
  }, [e]);
  const get = (): Readonly<WorldSnapshot> | null => {
    if (!e) return null;
    const w = e.director.world();
    const c = box.current;
    if (c && c.cur === w.current && c.rm === w.reducedMotion) return c.w;
    box.current = { cur: w.current, rm: w.reducedMotion, w: Object.freeze({ ...w }) };
    return box.current.w;
  };
  return useSyncExternalStore(sub, get, none);
}

export function useDirectorEvent(fn: (e: SceneEvent) => void): void {
  const e = useEngine();
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => (e ? e.director.on((x) => ref.current(x)) : undefined), [e]);
}

export function useSceneEvent(filter?: (e: SceneEvent) => boolean): SceneEvent | null {
  const [ev, setEv] = useState<SceneEvent | null>(null);
  const f = useRef(filter);
  f.current = filter;
  useDirectorEvent((x) => {
    if (!f.current || f.current(x)) setEv(x);
  });
  return ev;
}

export function useView(spec: Omit<ViewSpec, 'visible' | 'rect'>, ref: RefObject<Element | null>): void {
  const e = useEngine();
  const s = useRef(spec);
  s.current = spec;
  const key = spec.id + '|' + spec.renders.join(',');
  useEffect(() => {
    const el = ref.current;
    if (!e || !el || typeof IntersectionObserver === 'undefined') return;
    let seen = false;
    const io = new IntersectionObserver((xs) => {
      seen = xs[xs.length - 1].isIntersecting;
    });
    io.observe(el);
    const off = e.director.views.register({
      id: s.current.id,
      renders: s.current.renders,
      visible: () => seen && document.visibilityState === 'visible',
      rect: () => el.getBoundingClientRect(),
      screenX: (x) => {
        const own = s.current.screenX?.(x);
        if (own !== undefined) return own;
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2;
      },
    });
    return () => {
      off();
      io.disconnect();
    };
  }, [e, key, ref]);
}

export function useMotionMount(ref: RefObject<HTMLCanvasElement | null>, o: Omit<MountOpts, 'signal'>): void {
  const e = useEngine();
  const opts = useRef(o);
  opts.current = o;
  useEffect(() => {
    const c = ref.current;
    if (!e || !c) return;
    const ac = new AbortController();
    let p: Placement | null = null;
    e.motion()
      .then((m) => m.mount(c, { ...opts.current, signal: ac.signal }))
      .then((pl) => {
        if (ac.signal.aborted) pl.dispose();
        else p = pl;
      })
      .catch(noop);
    return () => {
      ac.abort();
      p?.dispose();
    };
  }, [e, ref, o.id, o.crop, o.host]);
}

export function usePulse(): () => number {
  return pulse;
}

export function useBeat(): () => BeatInfo | null {
  return beat;
}
