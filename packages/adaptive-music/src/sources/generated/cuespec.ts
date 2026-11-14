export type Quantise = 'now' | 'beat' | 'bar' | 'phrase' | { mark: string; each?: boolean; beats?: number };
export type PulseLayer = 'harvest' | 'pack' | 'load' | 'station' | 'hats';
export type Transform =
  | 'quicken' | 'doubleTime' | 'dropout' | 'cutLayer' | 'thin' | 'heldDissonance' | 'sus' | 'resolve' | 'part';

export type Gesture =
  | {
      kind: 'layer'; layer: PulseLayer; voice: string; cycle: number; k: readonly [number, number, number];
      rate?: 0.5 | 1 | 2; lv: number; fade: readonly [number, number]; stop?: string; bars?: number;
    }
  | {
      kind: 'motif'; motif: string; voice: string; octave?: -1 | 0 | 1; mode?: 'minor'; detune?: number;
      lv: number; at: Quantise; hits?: readonly number[]; dx?: number; augment?: 2; lp?: number;
    }
  | {
      kind: 'swell'; voice: 'sub' | 'noiseSwell' | 'glideDown'; lv: number;
      env: readonly [attack: number, hold: number, release: number] | 'span';
      glide?: number; sweep?: readonly [number, number]; dip?: number;
    }
  | {
      kind: 'fx'; voice: string; lv: number; at: Quantise; lp?: number; echo?: number; duck?: boolean;
      dur?: number; pitch?: number; p?: number;
    }
  | { kind: 'transform'; op: Transform; until?: Quantise; at?: Quantise; bars?: number; lv?: number }
  | {
      kind: 'bed'; layer: 'drone' | 'pad' | 'texture'; lp?: readonly [number, number]; glide?: number;
      tremolo?: { hz: number; depth: number }; drips?: readonly [number, number]; lv: number;
    }
  | { kind: 'state'; to: string; at: 'phrase' };

export interface CueSpec {
  readonly gestures: readonly Gesture[];
  readonly pan: 'track' | 'center' | 'sweep' | number;
  readonly offscreen: 'submerge' | 'skip' | 'play';
}
