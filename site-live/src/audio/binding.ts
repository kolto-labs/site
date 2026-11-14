import { createAdaptiveMusic } from '@kolto/adaptive-music';
import type { AdaptiveMusic, AddResult, BeatInfo, MediaFileInfo, SourceId, Unsubscribe } from '@kolto/adaptive-music';
import type { Transport } from '@kolto/adaptive-music/core/transport';
import type { Conductor } from '@kolto/adaptive-music/sources/generated/conductor';
import type { Mixer, Shared } from '@kolto/adaptive-music/sources/generated/mixer';
import type { BarPlan, Ev, Score } from '@kolto/adaptive-music/sources/generated/score';
import type { EngineClock } from '../engine/core/clock';
import { dropSlot, slot } from '../engine/core/global';
import type { EventId } from '../engine/core/types';
import type { Director, SceneEvent } from '../engine/director/director';
import type { InteractionBus } from '../engine/signals/bus';
import type { LatentState } from '../engine/state/latent';
import { mediaFiles, soundChoices, type MusicSource } from '../lib/prefs';
import { setHeroPulse } from '../hero/link';
import { USER_MEDIA_UI } from '../flags';

export type { BeatInfo };

export interface AudioEngine {
  readonly state: 'off' | 'starting' | 'running' | 'suspended' | 'interrupted';
  setEnabled(on: boolean): Promise<void>;
  blip(kind: 'ok' | 'tick'): void;
  pulse(): number;
  beat(): BeatInfo | null;
  dispose(): Promise<void>;
  onBar(fn: (bar: number, engineTime: number) => void): Unsubscribe;
  debug?(): AudioDebug;
  media?: AudioMedia;
}

export interface AudioMedia {
  add(files: Iterable<File | Blob>): Promise<readonly AddResult[]>;
  remove(ids: readonly string[] | 'all'): Promise<void>;
  list(): Promise<readonly MediaFileInfo[]>;
  setSource(id: SourceId): Promise<void>;
  on: AdaptiveMusic['on'];
}

export interface AudioDebug {
  skippedBars: number;
  dropped: number;
  lastMaxSim: number;
  noveltyFallbacks: number;
  lfoPhases: readonly number[];
  chord: string;
  mode: string;
  ctx: AudioContext | null;
  log: { t: number; at: number; v: string; l: string; d: number; w: number }[];
  transport: Transport<BarPlan, Ev> | null;
  score: Score | null;
  bpm: number;
  shared: Shared | null;
  rig: Mixer | null;
  cond: Conductor | null;
  peak: number;
  shed: number;
}

export interface AudioDeps {
  bus: InteractionBus;
  latent: LatentState;
  director: Director & { setSnap(start: ((t: number) => number) | null, mark?: ((t: number) => number) | null): void };
  clock: EngineClock;
}

export function createAudioEngine(d: AudioDeps): AudioEngine {
  const { bus, latent, director: dir, clock } = d;
  const choices = soundChoices.get();
  // Navigation has a clear start, unlike the continuous pointer/scroll signals.
  // Retain a short, bounded envelope so a committed route or section change can
  // lift the generated score's fast energy after the triggering event has passed.
  let navigationPulse = 0;
  let navigationPulseAt = clock.now();
  let sectionSeen = false;
  let lastSection: string | null = null;
  const addNavigationPulse = (amount: number, at: number): void => {
    const elapsed = Math.max(0, at - navigationPulseAt);
    navigationPulse *= Math.exp(-elapsed / 8);
    navigationPulse = Math.min(0.42, navigationPulse + amount * (1 - navigationPulse));
    navigationPulseAt = at;
  };
  const currentNavigationPulse = (at: number): number => {
    const elapsed = Math.max(0, at - navigationPulseAt);
    navigationPulse *= Math.exp(-elapsed / 8);
    navigationPulseAt = at;
    return navigationPulse;
  };
  const music = createAdaptiveMusic({
    sources: {
      external: {
        classic: async () => (await import('./classic-source')).classicSource,
      },
      generated: async () => {
        const generated = await import('./generated-entry');
        music.cues.register(generated.CUES);
        return generated;
      },
      // DEV-ONLY (USER_MEDIA_UI)
      media: USER_MEDIA_UI ? () => import('@kolto/adaptive-music/media') : undefined,
    },
    defaultSource: choices.music,
    fallbackSource: 'classic',
    config: { tempo: choices.tempo, visits: choices.visits, treatment: 'light' },
    seed: dir.world().seed,
    seedExplicit: typeof location !== 'undefined' && new URLSearchParams(location.search).has('seed'),
    clock,
    prefix: 'kolto',
  });
  const offEvents: Unsubscribe[] = [];
  music.input.provide(() => {
    const f = bus.frame();
    const l = latent.get();
    const nav = currentNavigationPulse(clock.now());
    // Add at most 0.28 to the fast channel; the slow profile and the site's
    // broader latent state remain untouched, so a visit cannot ratchet louder.
    const fastEnergy = Math.min(1, 1 - (1 - l.energy.fast) * (1 - nav * 0.66));
    return {
      pointer: { x: f.pointer.x, y: f.pointer.y, slowX: f.pointer.slowX, slowY: f.pointer.slowY, speed: f.pointer.speed, headingX: f.pointer.headingX, headingY: f.pointer.headingY, headingStrength: f.pointer.headingStrength, fine: f.pointer.fine },
      clicks: f.clicks,
      scroll: { velocity: f.scroll.velocity, depth: f.scroll.depth, accel: f.scroll.accel },
      presence: { p: f.presence.p, band: f.presence.band },
      typing: f.keys.typing,
      reading: f.reading,
      daylight: f.env.daylight,
      latent: {
        ...l,
        energy: { ...l.energy, fast: fastEnergy },
      },
      env: { sizeClass: f.env.sizeClass, coarse: !f.pointer.fine, tier: f.env.tier },
    };
  });
  music.input.event({ type: 'route', t: clock.now(), key: bus.frame().route.key });
  offEvents.push(bus.on('route', (e) => {
    // Ignore the synthetic first-route event. Back/forward transitions still
    // count because they represent a committed change in the rendered page.
    if (e.from !== null) addNavigationPulse(0.4, e.t);
    music.input.event({ type: 'route', t: e.t, key: e.to });
  }));
  offEvents.push(bus.on('presence', (e) => music.input.event({ type: 'presence', t: e.t, band: e.band })));
  offEvents.push(bus.on('click', (e) => music.input.event({ type: 'click', t: e.t })));
  offEvents.push(bus.on('hover', (e) => music.input.event({ type: 'hover', t: e.t, kind: e.kind })));
  offEvents.push(bus.on('section', (e) => {
    if (sectionSeen && e.id !== null && e.id !== lastSection) addNavigationPulse(0.14, e.t);
    sectionSeen = true;
    lastSection = e.id;
    music.input.event({ type: 'section', t: e.t, id: e.id });
  }));
  offEvents.push(bus.on('edge', (e) => music.input.event({ type: 'edge', t: e.t })));
  offEvents.push(bus.on('visibility', (e) => music.input.event({ type: 'visibility', t: e.t, visible: e.visible })));
  music.cues.locate({
    visible: (id) => dir.views.anyVisibleFor(id as EventId),
    screenX: (e) => dir.views.screenXFor(e as unknown as SceneEvent),
    width: () => (typeof innerWidth === 'number' ? innerWidth : 1280),
  });
  offEvents.push(dir.on((e) => (e.phase === 'end' ? music.cues.end(e.uid, !!e.cut) : music.cues.start(e))));
  offEvents.push(music.on('state', ({ state }) => {
    if (state === 'running') dir.setSnap(music.timing.nextDownbeat, music.timing.nextBeat);
    else if (state === 'off') dir.setSnap(null);
  }));
  offEvents.push(music.on('source', ({ to }) => {
    if (to === 'classic' || to === 'generated' || (to === 'media' && USER_MEDIA_UI)) soundChoices.setMusic(to as MusicSource);
  }));
  const syncChoices = (): void => {
    const c = soundChoices.get();
    music.setConfig({ tempo: c.tempo, visits: c.visits });
    void music.setSource(c.music).catch(() => {});
  };
  const offChoices = soundChoices.subscribe(syncChoices);
  setHeroPulse(() => music.pulse());

  const api: AudioEngine = {
    get state() {
      return music.state;
    },
    setEnabled(on) {
      if (on && music.state === 'off') {
        const w = dir.world();
        music.cues.ambient(w.ambient, w.state);
      }
      return music.setEnabled(on);
    },
    blip: (kind) => music.blip(kind),
    pulse: () => music.pulse(),
    beat: () => music.beat(),
    onBar: (fn) => music.on('bar', (e) => fn(e.n, e.t)),
    async dispose() {
      offChoices();
      for (const off of offEvents.splice(0)) off();
      if (USER_MEDIA_UI) mediaFiles.setHandler(null);
      setHeroPulse(null);
      await music.dispose();
      dropSlot('audio');
    },
  };
  if (import.meta.env.DEV) api.debug = () => music.debug!() as unknown as AudioDebug;
  // DEV-ONLY (USER_MEDIA_UI)
  if (USER_MEDIA_UI) {
    mediaFiles.setHandler({
      async add(files) {
        const results = await music.addFiles(files);
        const count = results.reduce((n, r) => n + (r.ok ? 1 : 0), 0);
        mediaFiles.setCount(count);
        return count;
      },
      async removeAll() {
        await music.removeFiles('all');
        mediaFiles.setCount(0);
      },
    });
    offEvents.push(music.on('files', ({ files }) => mediaFiles.setCount(files.length)));
    void music.listFiles().then((files) => mediaFiles.setCount(files.length)).catch(() => {});
    api.media = {
      add: (files) => music.addFiles(files),
      remove: (ids) => music.removeFiles(ids),
      list: () => music.listFiles(),
      setSource: (id) => music.setSource(id),
      on: (type, fn) => music.on(type, fn),
    };
  }
  return api;
}

export const getAudioEngine = (d: AudioDeps): AudioEngine => slot('audio', () => createAudioEngine(d));
