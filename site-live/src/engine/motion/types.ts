import type { EngineClock } from '../core/clock';
import type { Director } from '../director/director';
import type { InteractionBus } from '../signals/bus';
import type { LatentState } from '../state/latent';
import type { Gait, GaitKind } from './gait';
import type { enforceInvariants } from './invariants';
import type { steer } from './steering';

export interface BeatSrc {
  bar: number;
  beat: number;
  phase: number;
  bpm: number;
  meter: number;
}

export interface MotionDeps {
  bus: InteractionBus;
  latent: LatentState;
  director: Director;
  clock: EngineClock;
  beat?: () => BeatSrc | null;
}

export interface MountOpts {
  id: string;
  crop?: 'all' | 'city' | 'rift';
  host?: Element;
  signal?: AbortSignal;
}

export interface Placement {
  dispose(): void;
  redraw(): void;
}

export interface MotionApi {
  gait(kind: GaitKind, npcId: number): Gait;
  steer: typeof steer;
  enforceInvariants: typeof enforceInvariants;
  mount(canvas: HTMLCanvasElement, o: MountOpts): Promise<Placement>;
  dispose(): void;
}
