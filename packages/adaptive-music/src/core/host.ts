import type {
  AdaptiveMusic, AdaptiveMusicClock, AdaptiveMusicEvents, AdaptiveMusicOptions, CueRegistry, DimLike, GeneratedSource,
  Locator, SceneEventLike, SourceHost, Unsubscribe,
} from '../index';
import type { CueSpec } from '../sources/generated/cuespec';
import type { Ctl } from '../sources/generated/score';
import { DEFAULT_CONFIG, mergeConfig } from './config';
import { AdaptiveMusicError } from './errors';
import { Emitter } from './events';
import { createInput } from './input';
import { makeMaster } from './master';
import type { Master } from './master';
import { Transport } from './transport';

const REST = [0.15, 0.2, 0.5, 0.2];

function dim(x: DimLike | undefined, rest: number) {
  const v = x === undefined ? rest : typeof x === 'number' ? x : typeof x === 'function' ? x() : x.value;
  const o = typeof x === 'object' ? x : null;
  return { v, fast: o?.fast ?? v, slow: o?.slow ?? v, band: o?.band ?? ((v > 0.66 ? 2 : v > 0.33 ? 1 : 0) as 0 | 1 | 2) };
}

function defaultClock(): AdaptiveMusicClock {
  return {
    now: () => performance.now() / 1000,
    hidden: () => document.visibilityState === 'hidden',
    hiddenTotal: () => 0,
    onVisibility(fn) {
      const h = (): void => fn(document.visibilityState !== 'hidden');
      document.addEventListener('visibilitychange', h);
      return () => document.removeEventListener('visibilitychange', h);
    },
  };
}

export function createHost(o: AdaptiveMusicOptions): AdaptiveMusic {
  const clock = o.clock ?? defaultClock();
  const seed = o.seed ?? (Math.random() * 4294967296) >>> 0;
  let cfg = mergeConfig(DEFAULT_CONFIG, o.config);
  let ctx: AudioContext | null = null;
  let master: Master | null = null;
  let src: GeneratedSource | null = null;
  let srcP: Promise<GeneratedSource> | null = null;
  let enabled = false;
  let state: AdaptiveMusic['state'] = 'off';
  let timer: ReturnType<typeof setInterval> | null = null;
  let offs: Unsubscribe[] = [];
  let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  let intr: AbortController | null = null;
  let gen = 0;
  let away = false;
  let begun = false;
  let live = false;
  let disposed = false;
  let route: string | undefined;
  let world: { ids: readonly string[]; state?: string } = { ids: [] };
  let specs: Readonly<Record<string, CueSpec>> = {};
  let loc: Locator = { visible: () => true, screenX: () => null, width: () => (typeof innerWidth === 'number' ? innerWidth : 1280) };
  const input = createInput();
  const ev = {
    state: new Emitter<AdaptiveMusicEvents['state']>(),
    source: new Emitter<AdaptiveMusicEvents['source']>(),
    files: new Emitter<AdaptiveMusicEvents['files']>(),
    analysis: new Emitter<AdaptiveMusicEvents['analysis']>(),
    bar: new Emitter<AdaptiveMusicEvents['bar']>(),
    warning: new Emitter<AdaptiveMusicEvents['warning']>(),
    error: new Emitter<AdaptiveMusicEvents['error']>(),
  };

  const set = (s: AdaptiveMusic['state']): void => {
    if (s === state) return;
    state = s;
    ev.state.emit({ state: s });
  };

  const lite = (): boolean => (o.tier === 'lite' ? true : o.tier === 'full' ? false : input.snap().env?.tier === 'lite');

  const ctl = (): Ctl => {
    const s = input.snap();
    const l = s.latent;
    const e = dim(l?.energy, REST[0]);
    const t = dim(l?.tension, REST[1]);
    const f = dim(l?.focus, REST[2]);
    const q = dim(l?.curiosity, REST[3]);
    return { eV: e.v, eFast: e.fast, eSlow: e.slow, eBand: e.band, tV: t.v, tBand: t.band, fV: f.v, qV: q.v, qSlow: q.slow, lite: lite(), dl: s.daylight ?? 0.5 };
  };

  const stamp = (): { c: number; p: number } => {
    const t = ctx!.getOutputTimestamp();
    if (t.contextTime && t.performanceTime) return { c: t.contextTime, p: t.performanceTime / 1000 };
    return { c: ctx!.currentTime, p: performance.now() / 1000 };
  };
  const cx = (te: number): number => {
    const s = stamp();
    return s.c + (te + clock.hiddenTotal() - s.p);
  };
  const fromCx = (tc: number): number => {
    const s = stamp();
    return s.p + (tc - s.c) - clock.hiddenTotal();
  };

  const level = (): number => (away ? cfg.level * Math.pow(10, -6 / 20) : cfg.level);

  const setAway = (on: boolean): void => {
    if (!begun || !ctx || on === away) return;
    away = on;
    src!.duck(level(), on ? 1.3 : 0.7);
  };

  const visibility = (visible: boolean): void => {
    if (!enabled || !ctx || !begun) return;
    if (hiddenTimer) clearTimeout(hiddenTimer);
    hiddenTimer = null;
    if (visible) void ctx.resume().then(() => src?.duck(level(), 0.3));
    else {
      src!.duck(0, 0.12);
      hiddenTimer = setTimeout(() => clock.hidden() && enabled && void ctx!.suspend(), 600);
    }
  };

  const load = (): Promise<GeneratedSource> =>
    (srcP ??= (async () => {
      const g = o.sources.generated;
      if (!g) throw new AdaptiveMusicError('unknown-source', 'generated');
      let m;
      let profile;
      try {
        [m, profile] = await Promise.all([g(), o.sources.profile?.()]);
      } catch (err) {
        throw new AdaptiveMusicError('chunk-failed', undefined, err);
      }
      const h: SourceHost = {
        ctx: ctx!, master: master!, seed, Transport, profile, ctl, cx, fromCx,
        specs: () => specs, loc: () => loc, bar: (n, t) => ev.bar.emit({ n, t }),
      };
      return (src = await m.create(h));
    })().catch((err) => {
      srcP = null;
      throw err;
    }));

  const start = async (g: number): Promise<void> => {
    set('starting');
    if (!ctx) {
      const AC = typeof window === 'undefined' ? undefined : window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) {
        enabled = false;
        set('off');
        throw new AdaptiveMusicError('unsupported');
      }
      const c = (ctx = new AC({ latencyHint: 'balanced' }));
      c.onstatechange = () => {
        intr?.abort();
        intr = null;
        if (!enabled) return;
        const s = c.state as string;
        set(s === 'running' ? 'running' : s === 'interrupted' ? 'interrupted' : 'suspended');
        if (s === 'interrupted') {
          const a = (intr = new AbortController());
          const h = (): void => {
            a.abort();
            void c.resume();
          };
          for (const k of ['pointerdown', 'keydown']) window.addEventListener(k, h, { once: true, signal: a.signal });
        }
      };
      master = makeMaster(c);
    }
    const c = ctx;
    let to: ReturnType<typeof setTimeout> | undefined;
    const rp = Promise.race([
      c.resume().then(() => true, () => false),
      new Promise<boolean>((r) => {
        to = setTimeout(r, 4000, false);
      }),
    ]);
    let S: GeneratedSource | null = null;
    let fail: unknown;
    try {
      S = await load();
    } catch (err) {
      fail = err;
    }
    const ok = await rp;
    clearTimeout(to);
    if (g !== gen) return;
    if (fail || !S) {
      enabled = false;
      set('off');
      throw fail;
    }
    if (!ok) {
      enabled = false;
      set('off');
      ev.warning.emit({ code: 'context-failed' });
      return;
    }
    away = false;
    S.begin({ level: level(), lite: lite(), route, state: world.state, ambient: world.ids });
    begun = true;
    offs = [clock.onVisibility((v) => visibility(v))];
    timer = setInterval(S.wake, 50);
    live = true;
    set('running');
  };

  const stop = (): void => {
    if (!ctx) return;
    const c = ctx;
    if (timer) clearInterval(timer);
    timer = null;
    if (hiddenTimer) clearTimeout(hiddenTimer);
    hiddenTimer = null;
    if (suspendTimer) clearTimeout(suspendTimer);
    intr?.abort();
    intr = null;
    for (const f of offs) f();
    offs = [];
    live = false;
    src?.end();
    set('off');
    suspendTimer = setTimeout(() => {
      suspendTimer = null;
      if (!enabled) void c.suspend();
    }, 800);
  };

  input.on((e) => {
    if (e.type === 'route') {
      route = e.key;
      if (live) src!.route(e.key);
    } else if (e.type === 'presence' && live) setAway(e.band === 'away');
  });

  const cues: CueRegistry = {
    register(map) {
      specs = map;
    },
    start(e: SceneEventLike) {
      if (live) src!.cueStart(e);
    },
    end(uid, cut) {
      if (live) src!.cueEnd(uid, !!cut);
    },
    ambient(ids, st) {
      world = { ids, state: st };
      if (live) {
        if (st !== undefined) src!.setState(st);
        src!.ambient(ids);
      }
    },
    locate(l) {
      loc = l;
    },
  };

  const guard = (): void => {
    if (disposed) throw new AdaptiveMusicError('disposed');
  };

  const api: AdaptiveMusic = {
    get state() {
      return state;
    },
    get source() {
      return src ? 'generated' : null;
    },
    async setEnabled(on) {
      guard();
      if (on === enabled) return;
      enabled = on;
      const g = ++gen;
      if (on) {
        if (suspendTimer) clearTimeout(suspendTimer);
        suspendTimer = null;
        await start(g);
      } else stop();
    },
    async setSource(id) {
      guard();
      if (id !== 'generated') throw new AdaptiveMusicError('unknown-source', id);
    },
    async addFiles(files) {
      guard();
      return [...files].map(() => ({ ok: false as const, code: 'no-media' as const }));
    },
    async removeFiles() {
      guard();
    },
    async listFiles() {
      guard();
      return [];
    },
    setConfig(patch) {
      cfg = mergeConfig(cfg, patch);
      if (patch.level !== undefined && live) src!.duck(level(), 0.2);
    },
    getConfig: () => cfg,
    forgetVisits() {},
    input: input.api,
    cues,
    timing: {
      nextDownbeat: (t) => (src && ctx ? src.nextDownbeat(t) : t),
      nextBeat: (t) => (src && ctx ? src.nextBeat(t) : t),
    },
    blip(kind) {
      if (!ctx || !src || !enabled || ctx.state !== 'running') return;
      src.blip(kind);
    },
    pulse() {
      return src && ctx && state === 'running' ? src.pulse() : 0;
    },
    beat() {
      return src && ctx && state === 'running' ? src.beat() : null;
    },
    on(type, fn) {
      return (ev[type] as unknown as Emitter<never>).on(fn as never);
    },
    async dispose() {
      if (disposed) return;
      enabled = false;
      gen++;
      stop();
      disposed = true;
      if (suspendTimer) clearTimeout(suspendTimer);
      input.clear();
      for (const k of Object.keys(ev) as (keyof typeof ev)[]) ev[k].clear();
      await ctx?.close().catch(() => undefined);
    },
  };
  if (import.meta.env.DEV) api.debug = () => ({ ctx, ...src?.debug?.() });
  return api;
}
