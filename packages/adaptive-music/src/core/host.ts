import type {
  AdaptiveMusic, AdaptiveMusicClock, AdaptiveMusicEvents, AdaptiveMusicOptions, CueRegistry, DimLike, ExternalSource, GeneratedSource,
  Locator, MediaModule, MediaSource, PlaySource, SceneEventLike, SourceHost, SourceId, Unsubscribe,
} from '../index';
import type { CueSpec } from '../sources/generated/cuespec';
import type { Ctl } from '../sources/generated/score';
import { DEFAULT_CONFIG, mergeConfig } from './config';
import { AdaptiveMusicError } from './errors';
import { Emitter } from './events';
import { createInput } from './input';
import { classicTreatment } from '../sources/external';
import { makeMaster } from './master';
import type { Master } from './master';
import { Transport } from './transport';
import type { BarOf } from './transport';
import { createUi } from '../ui/sounds';
import type { Ui, UiKind } from '../ui/sounds';

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
  let visit = 0;
  let visitStarted = false;
  const prefix = o.prefix ?? 'adaptive-music';
  const visitKey = `${prefix}:visits`;
  const storage = o.storage === undefined
    ? (typeof localStorage === 'undefined' ? null : {
        get: (key: string) => { try { return localStorage.getItem(key); } catch { return null; } },
        set: (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* best effort */ } },
        remove: (key: string) => { try { localStorage.removeItem(key); } catch { /* best effort */ } },
      })
    : o.storage;
  let cfg = mergeConfig(DEFAULT_CONFIG, o.config);
  let ctx: AudioContext | null = null;
  let master: Master | null = null;
  let src: GeneratedSource | null = null;
  let srcP: Promise<GeneratedSource> | null = null;
  const external = new Map<string, Promise<ExternalSource>>();
  const externalPlay = new Map<string, Promise<PlaySource>>();
  let medP: Promise<MediaSource> | null = null;
  let act: PlaySource | null = null;
  let sel: SourceId = o.defaultSource ?? 'generated';
  let sw = 0;
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
  let ui: Ui | null = null;
  let tr: Transport<BarOf<unknown>, unknown> | null = null;
  class Tr<B extends BarOf<E>, E> extends Transport<B, E> {
    constructor(...a: ConstructorParameters<typeof Transport<B, E>>) {
      super(...a);
      tr = this as unknown as Transport<BarOf<unknown>, unknown>;
    }
  }
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
    return { eV: e.v, eFast: e.fast, eSlow: e.slow, eBand: e.band, tV: t.v, tBand: t.band, fV: f.v, qV: q.v, qSlow: q.slow, lite: lite(), dl: s.daylight ?? 0.5, tempo: cfg.tempo };
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
    act!.duck(level(), on ? 1.3 : 0.7);
  };

  const visibility = (visible: boolean): void => {
    if (!enabled || !ctx || !begun) return;
    if (hiddenTimer) clearTimeout(hiddenTimer);
    hiddenTimer = null;
    if (visible) void ctx.resume().then(() => act?.duck(level(), 0.3));
    else {
      act!.duck(0, 0.12);
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
        ctx: ctx!, master: master!, seed, visit, Transport: Tr, profile, ctl, cx, fromCx,
        specs: () => specs, loc: () => loc, bar: (n, t) => ev.bar.emit({ n, t }),
      };
      return (src = await m.create(h));
    })().catch((err) => {
      srcP = null;
      throw err;
    }));

  const loadExternal = (id: string): Promise<ExternalSource> => {
    const factory = o.sources.external?.[id];
    if (!factory) return Promise.reject(new AdaptiveMusicError('unknown-source', id));
    let p = external.get(id);
    if (!p) {
      p = factory().catch((err) => {
        external.delete(id);
        throw new AdaptiveMusicError('chunk-failed', undefined, err);
      });
      external.set(id, p);
    }
    return p;
  };

  const wrapExternal = (source: ExternalSource): PlaySource => {
    let gain: GainNode | null = null;
    const output = (): GainNode => {
      if (!gain) {
        gain = ctx!.createGain();
        gain.connect(master!.hp);
      }
      return gain;
    };
    const at = (): number => ctx!.currentTime + 0.05;
    return {
      begin(a, when) {
        const out = output();
        const now = ctx!.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(a.level / DEFAULT_CONFIG.level, now);
        if (cfg.treatment === 'light') source.treat?.(classicTreatment(input.snap()));
        source.start({ ctx: ctx!, out, at: when ?? at(), treatment: cfg.treatment, lite: a.lite });
      },
      end(when, fade) {
        if (ctx) source.stop(when ?? at(), fade ?? 0.6);
      },
      wake() {
        if (cfg.treatment === 'light') source.treat?.(classicTreatment(input.snap()));
      },
      route() {},
      duck(v, tau) {
        if (ctx && gain) gain.gain.setTargetAtTime(Math.max(0, v / DEFAULT_CONFIG.level), ctx.currentTime, tau);
      },
      blip(kind) {
        source.blip?.(kind);
      },
      pulse() {
        return ctx ? source.pulse(ctx.currentTime) : 0;
      },
      beat() {
        return ctx ? source.beat?.(ctx.currentTime) ?? null : null;
      },
      nextDownbeat(te) {
        if (!ctx || !source.beat) return te;
        const b = source.beat(cx(te));
        return b ? fromCx(b.nextDownbeat) : te;
      },
      nextBeat(te) {
        if (!ctx || !source.beat) return te;
        const ct = cx(te);
        const b = source.beat(ct);
        return b ? fromCx(ct + (1 - b.phase) * (60 / b.bpm)) : te;
      },
      debug: () => ({}),
    };
  };

  const loadMedia = (): Promise<MediaSource> =>
    (medP ??= (async () => {
      const f = o.sources.media;
      if (!f) throw new AdaptiveMusicError('no-media');
      let m: MediaModule;
      try {
        m = await f();
      } catch (err) {
        throw new AdaptiveMusicError('chunk-failed', undefined, err);
      }
      return m.create({
        ctx: () => ctx, master: () => master, Transport, ctl, lite, store: o.mediaStore, prefix: o.prefix ?? 'adaptive-music',
        limits: () => cfg.limits,
        files: (files) => ev.files.emit({ files }),
        warn: (code, detail) => ev.warning.emit({ code, detail }),
      });
    })().catch((err) => {
      medP = null;
      throw err;
    }));

  const pick = async (id: SourceId, play: boolean): Promise<PlaySource | null> => {
    if (id === 'media') {
      const m = await loadMedia();
      if (!(await m.ready(play))) throw new AdaptiveMusicError('no-media');
      return m;
    }
    if (o.sources.external?.[id]) {
      let p = externalPlay.get(id);
      if (!p) {
        p = loadExternal(id).then(wrapExternal).catch((err) => {
          externalPlay.delete(id);
          throw err;
        });
        externalPlay.set(id, p);
      }
      return p;
    }
    if (id !== 'generated' || !o.sources.generated) throw new AdaptiveMusicError('unknown-source', id);
    return play ? load() : null;
  };

  const swap = (to: SourceId, S: PlaySource | null): void => {
    const from = sel;
    sel = to;
    if (live && S && act !== S) {
      const now = ctx!.currentTime;
      const beat = act!.beat();
      const at = beat ? act!.nextDownbeat(now) : now + 0.05;
      const fade = beat ? (2 * beat.meter * 60) / beat.bpm : 0.6;
      act!.end(at, fade);
      S.begin({ level: level(), lite: lite(), route, state: world.state, ambient: world.ids }, at);
      act = S;
    }
    if (from !== to) ev.source.emit({ from, to });
  };

  const fallback = async (): Promise<PlaySource | null> => {
    ev.warning.emit({ code: 'no-media' });
    const id = o.fallbackSource ?? 'generated';
    const S = await pick(id, live);
    swap(id, S);
    return S;
  };

  const start = async (g: number): Promise<void> => {
    set('starting');
    if (!visitStarted) {
      visitStarted = true;
      if (cfg.visits === 'local' && !o.seedExplicit && storage) {
        const stored = Number(storage.get(visitKey));
        visit = Number.isSafeInteger(stored) && stored >= 0 ? stored + 1 : 1;
        storage.set(visitKey, String(visit));
      }
    }
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
      ui = createUi({
        ctx: c, out: master.ui, seed, ref: level, lite,
        bar: (t) => tr?.barAt(t) ?? null,
        x: () => input.snap().pointer?.x ?? null,
      });
    }
    const c = ctx;
    let to: ReturnType<typeof setTimeout> | undefined;
    const rp = Promise.race([
      c.resume().then(() => true, () => false),
      new Promise<boolean>((r) => {
        to = setTimeout(r, 4000, false);
      }),
    ]);
    let S: PlaySource | null = null;
    let fail: unknown;
    try {
      for (let id = sel; ; id = sel) {
        S = await pick(id, true).catch((err) => (id === 'media' && err.code === 'no-media' ? fallback() : Promise.reject(err)));
        if (id === sel) break;
      }
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
    act = S;
    begun = true;
    offs = [clock.onVisibility((v) => visibility(v))];
    timer = setInterval(() => act!.wake(), 50);
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
    act?.end();
    set('off');
    suspendTimer = setTimeout(() => {
      suspendTimer = null;
      if (!enabled) void c.suspend();
    }, 800);
  };

  const sfx = (k: UiKind, sub?: string): void => {
    if (live && cfg.uiSounds && ctx!.state === 'running') ui!.play(k, sub);
  };

  input.on((e) => {
    if (e.type === 'route') {
      route = e.key;
      if (live) act!.route(e.key);
      sfx('route');
    } else if (e.type === 'presence' && live) setAway(e.band === 'away');
    else if (e.type === 'click' || e.type === 'edge') {
      if (e.type === 'click' && live) act!.ui?.();
      sfx(e.type);
    }
    else if (e.type === 'hover' && (input.snap().pointer?.speed ?? 0) < 1.5) sfx('hover', e.kind);
    else if (e.type === 'section' && e.id !== null) sfx('section');
  });

  const cues: CueRegistry = {
    register(map) {
      specs = map;
    },
    start(e: SceneEventLike) {
      if (live && act === src) src!.cueStart(e);
    },
    end(uid, cut) {
      if (live && act === src) src!.cueEnd(uid, !!cut);
    },
    ambient(ids, st) {
      world = { ids, state: st };
      if (live && act === src) {
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
      return act ? sel : null;
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
      const g = ++sw;
      let actualId = id;
      let S: PlaySource | null;
      try {
        S = await pick(id, live);
      } catch (err) {
        if (id === 'media' && (err as AdaptiveMusicError).code === 'no-media') {
          actualId = o.fallbackSource ?? 'generated';
          ev.warning.emit({ code: 'no-media', detail: actualId });
          S = await pick(actualId, live);
        } else {
          ev.warning.emit({ code: (err as AdaptiveMusicError).code, detail: id });
          throw err;
        }
      }
      if (g === sw && !disposed) swap(actualId, S);
    },
    async addFiles(files) {
      guard();
      const list = [...files];
      if (!o.sources.media) return list.map(() => ({ ok: false as const, code: 'no-media' as const }));
      return loadMedia().then(
        (m) => m.add(list),
        (err: AdaptiveMusicError) => list.map(() => ({ ok: false as const, code: err.code })),
      );
    },
    async removeFiles(ids) {
      guard();
      if (!o.sources.media) return;
      const m = await loadMedia();
      await m.remove(ids);
      if (sel === 'media' && !(await m.ready(false))) {
        ++sw;
        await fallback();
      }
    },
    async listFiles() {
      guard();
      return o.sources.media ? (await loadMedia()).list() : [];
    },
    setConfig(patch) {
      cfg = mergeConfig(cfg, patch);
      if (patch.level !== undefined && live) act!.duck(level(), 0.2);
      if (patch.treatment !== undefined && o.sources.external?.[sel]) {
        void loadExternal(sel).then((s) => s.treat?.({ mode: cfg.treatment }));
      }
    },
    getConfig: () => cfg,
    forgetVisits() {
      storage?.remove(visitKey);
      visit = 0;
    },
    input: input.api,
    cues,
    timing: {
      nextDownbeat: (t) => (act && ctx ? act.nextDownbeat(t) : t),
      nextBeat: (t) => (act && ctx ? act.nextBeat(t) : t),
    },
    blip(kind) {
      if (kind === 'error') sfx('error');
      else if (live && act) act.blip(kind);
      else sfx(kind === 'ok' ? 'confirm' : 'click');
    },
    pulse() {
      return act && ctx && state === 'running' ? act.pulse() : 0;
    },
    beat() {
      return act && ctx && state === 'running' ? act.beat() : null;
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
  if (import.meta.env.DEV) api.debug = () => ({ ctx, source: sel, ...act?.debug?.() });
  return api;
}
