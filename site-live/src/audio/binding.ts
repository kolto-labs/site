import { createAdaptiveMusic } from '@kolto/adaptive-music';
import type { BeatInfo, Unsubscribe } from '@kolto/adaptive-music';
import type { Transport } from '@kolto/adaptive-music/core/transport';
import type { Conductor } from '@kolto/adaptive-music/sources/generated/conductor';
import type { Mixer, Shared } from '@kolto/adaptive-music/sources/generated/mixer';
import type { BarPlan, Ev, Score } from '@kolto/adaptive-music/sources/generated/score';
import type { EngineClock } from '../engine/core/clock';
import { slot } from '../engine/core/global';
import type { EventId } from '../engine/core/types';
import type { Director, SceneEvent } from '../engine/director/director';
import type { InteractionBus } from '../engine/signals/bus';
import type { LatentState } from '../engine/state/latent';

export type { BeatInfo };

export interface AudioEngine {
  readonly state: 'off' | 'starting' | 'running' | 'suspended' | 'interrupted';
  setEnabled(on: boolean): Promise<void>;
  blip(kind: 'ok' | 'tick'): void;
  pulse(): number;
  beat(): BeatInfo | null;
  onBar(fn: (bar: number, engineTime: number) => void): Unsubscribe;
  debug?(): AudioDebug;
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
  const music = createAdaptiveMusic({
    sources: {
      generated: () => import('@kolto/adaptive-music/generated'),
      profile: async () => {
        const [p, c] = await Promise.all([import('./kolto-profile'), import('./kolto-cues')]);
        music.cues.register(c.CUES);
        return p.KOLTO_PROFILE;
      },
    },
    seed: dir.world().seed,
    clock,
    prefix: 'kolto',
  });
  music.input.provide(() => {
    const f = bus.frame();
    return { latent: latent.get(), daylight: f.env.daylight, env: { tier: f.env.tier } };
  });
  music.input.event({ type: 'route', t: clock.now(), key: bus.frame().route.key });
  bus.on('route', (e) => music.input.event({ type: 'route', t: e.t, key: e.to }));
  bus.on('presence', (e) => music.input.event({ type: 'presence', t: e.t, band: e.band }));
  music.cues.locate({
    visible: (id) => dir.views.anyVisibleFor(id as EventId),
    screenX: (e) => dir.views.screenXFor(e as unknown as SceneEvent),
    width: () => (typeof innerWidth === 'number' ? innerWidth : 1280),
  });
  dir.on((e) => (e.phase === 'end' ? music.cues.end(e.uid, !!e.cut) : music.cues.start(e)));
  music.on('state', ({ state }) => {
    if (state === 'running') dir.setSnap(music.timing.nextDownbeat, music.timing.nextBeat);
    else if (state === 'off') dir.setSnap(null);
  });

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
  };
  if (import.meta.env.DEV) api.debug = () => music.debug!() as unknown as AudioDebug;
  return api;
}

export const getAudioEngine = (d: AudioDeps): AudioEngine => slot('audio', () => createAudioEngine(d));
