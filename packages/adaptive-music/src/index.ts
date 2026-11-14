// @kolto/adaptive-music: public API surface. Import-safe in Node; nothing runs at import.
import { createHost } from './core/host';
import type { Ctl } from './sources/generated/score';
import type { CueSpec } from './sources/generated/cuespec';
import type { ScoreProfile } from './sources/generated/profile';
import type { AdaptiveMusicConfig } from './core/config';
import type { Transport } from './core/transport';

export { AdaptiveMusicError } from './core/errors';
export type { ErrorCode } from './core/errors';
export type { AdaptiveMusicConfig } from './core/config';
export type { CueSpec, Gesture, Quantise, PulseLayer, Transform } from './sources/generated/cuespec';
export type { ScoreProfile, Route, StateDef, MotifDef, Scale, LayerKey } from './sources/generated/profile';

import type { ErrorCode, AdaptiveMusicError } from './core/errors';

export type SourceId = 'generated' | 'media' | (string & {});
export type Unsubscribe = () => void;
export type DimLike = number | { value: number; fast?: number; slow?: number; band?: 0 | 1 | 2 } | (() => number);

export interface BeatInfo {
  bar: number; beat: number; phase: number; bpm: number; meter: number; nextDownbeat: number;
}

export interface ExternalSource {
  start(io: { ctx: AudioContext; out: AudioNode; at: number }): void;
  stop(at: number, fade: number): void;
  pulse(outputTime: number): number;
  beat?(outputTime: number): BeatInfo | null;
  pitch?: { centre: number; scale: readonly number[] };
}

export interface SourceHost {
  readonly ctx: AudioContext;
  readonly master: { hp: BiquadFilterNode; ui: GainNode };
  readonly seed: number;
  readonly Transport: typeof Transport;
  readonly profile?: ScoreProfile;
  ctl(): Ctl;
  cx(te: number): number;
  fromCx(tc: number): number;
  specs(): Readonly<Record<string, CueSpec>>;
  loc(): Locator;
  bar(n: number, t: number): void;
}
export interface SourceBegin {
  level: number;
  lite: boolean;
  route?: string;
  state?: string;
  ambient: readonly string[];
}
export interface GeneratedSource {
  begin(a: SourceBegin): void;
  end(): void;
  wake(): void;
  route(to: string): void;
  duck(level: number, tau: number): void;
  cueStart(e: SceneEventLike): void;
  cueEnd(uid: number, cut: boolean): void;
  ambient(ids: readonly string[]): void;
  setState(s: string): void;
  blip(kind: 'ok' | 'tick'): void;
  pulse(): number;
  beat(): BeatInfo | null;
  nextDownbeat(te: number): number;
  nextBeat(te: number): number;
  debug?(): Record<string, unknown>;
}
export interface GeneratedModule {
  readonly kind: 'generated';
  create(h: SourceHost): Promise<GeneratedSource>;
}
export interface MediaModule { readonly kind: 'media' }

export interface AdaptiveMusicClock {
  now(): number;
  hidden(): boolean;
  hiddenTotal(): number;
  onVisibility(fn: (visible: boolean) => void): Unsubscribe;
}
export interface KeyValueAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}
export interface MediaStoreAdapter {
  put(id: string, blob: Blob): Promise<void>;
  get(id: string): Promise<Blob | null>;
  delete(id: string): Promise<void>;
  list(): Promise<readonly string[]>;
}

export interface AdaptiveMusicOptions {
  sources: {
    external?: Readonly<Record<string, () => Promise<ExternalSource>>>;
    generated?: () => Promise<GeneratedModule>;
    profile?: () => Promise<ScoreProfile>;
    media?: () => Promise<MediaModule>;
  };
  seed?: number;
  clock?: AdaptiveMusicClock;
  storage?: KeyValueAdapter | null;
  mediaStore?: MediaStoreAdapter | null;
  prefix?: string;
  config?: Partial<AdaptiveMusicConfig>;
  tier?: 'auto' | 'full' | 'lite';
}

export type AddResult = { ok: true; id: string } | { ok: false; code: ErrorCode };
export interface MediaFileInfo {
  id: string; size: number; type: string; seconds: number; analysed: boolean; confidence: number;
}

export interface SignalSnapshot {
  pointer?: { x: number; y: number; speed: number; headingX?: number; headingY?: number; fine: boolean };
  scroll?: { velocity: number; depth: number; accel?: number };
  presence?: { p: number; band: 'active' | 'resting' | 'idle' | 'away' };
  typing?: boolean; reading?: number; daylight?: number;
  latent?: { energy: DimLike; tension: DimLike; focus: DimLike; curiosity: DimLike };
  env?: { sizeClass?: 'S' | 'M' | 'L' | 'XL'; coarse?: boolean; tier?: 'full' | 'lite' };
}
export type InputEvent =
  | { type: 'click'; t: number }
  | { type: 'hover'; t: number; kind: 'link' | 'button' | 'disclosure' | 'card' }
  | { type: 'route'; t: number; key: string }
  | { type: 'section'; t: number; id: string | null }
  | { type: 'presence'; t: number; band: 'active' | 'resting' | 'idle' | 'away' }
  | { type: 'visibility'; t: number; visible: boolean };
export interface SignalInput {
  provide(fn: () => SignalSnapshot): void;
  event(e: InputEvent): void;
}

export interface SceneEventLike {
  uid: number; id: string; startAt: number; duration: number;
  marks: readonly { name: string; at: number }[]; variant?: Readonly<Record<string, number>>;
}
export interface Locator {
  visible(id: string): boolean;
  screenX(e: SceneEventLike): number | null;
  width(): number;
}
export interface CueRegistry {
  register(map: Readonly<Record<string, CueSpec>>): void;
  start(e: SceneEventLike): void;
  end(uid: number, cut?: boolean): void;
  ambient(ids: readonly string[], state?: string): void;
  locate(l: Locator): void;
}

export interface AdaptiveMusicEvents {
  state: { state: AdaptiveMusic['state'] };
  source: { from: SourceId | null; to: SourceId | null };
  files: { files: readonly MediaFileInfo[] };
  analysis: { id: string; phase: 'queued' | 'running' | 'done' | 'failed'; progress: number; confidence?: number };
  bar: { n: number; t: number };
  warning: { code: string; detail?: unknown };
  error: AdaptiveMusicError;
}

export interface AdaptiveMusic {
  readonly state: 'off' | 'starting' | 'running' | 'suspended' | 'interrupted';
  readonly source: SourceId | null;
  setEnabled(on: boolean): Promise<void>;
  setSource(id: SourceId): Promise<void>;
  addFiles(files: Iterable<File | Blob>): Promise<readonly AddResult[]>;
  removeFiles(ids: readonly string[] | 'all'): Promise<void>;
  listFiles(): Promise<readonly MediaFileInfo[]>;
  setConfig(patch: Partial<AdaptiveMusicConfig>): void;
  getConfig(): Readonly<AdaptiveMusicConfig>;
  forgetVisits(): void;
  readonly input: SignalInput;
  readonly cues: CueRegistry;
  readonly timing: { nextDownbeat(t: number): number; nextBeat(t: number): number };
  blip(kind: 'ok' | 'tick'): void;
  pulse(): number;
  beat(): BeatInfo | null;
  on<K extends keyof AdaptiveMusicEvents>(type: K, fn: (e: AdaptiveMusicEvents[K]) => void): Unsubscribe;
  dispose(): Promise<void>;
  debug?(): Record<string, unknown>;
}

export function createAdaptiveMusic(opts: AdaptiveMusicOptions): AdaptiveMusic {
  return createHost(opts);
}
