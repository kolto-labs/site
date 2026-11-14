export type Scale = readonly number[];
export type LayerKey = 'drone' | 'pad' | 'arp' | 'bass' | 'hats' | 'kick' | 'ticks' | 'pulse' | 'glint' | 'melody' | 'cuep' | 'cuefx';

export interface Route {
  gain: Readonly<Partial<Record<LayerKey, number>>>;
  grav: readonly number[];
  rate: 1 | 2;
  dens: number;
  reg: number;
  droneDb?: number;
  bell?: boolean;
  sparse?: boolean;
  noCad?: boolean;
  half?: boolean;
  hatsOnly?: boolean;
}

export interface StateDef {
  mode: number;
  bpm: number;
  meters?: readonly number[];
  thin?: boolean;
  drift?: { sd: number; tau: number };
  jitter?: boolean;
  noSaw?: boolean;
  padMul?: number;
  seventh?: boolean;
  penult?: readonly number[];
  row?: readonly [prev: number, col: number, value: number];
  melKind?: number;
  lpCap?: number;
}

export interface MotifDef {
  ps?: readonly number[];
  ss?: readonly number[];
  len?: number;
  lens?: Readonly<Record<number, number>>;
  centre?: number;
  rhythm?: boolean;
  signed?: boolean;
  late?: { states: readonly string[]; mark: string; at: number; ps: readonly number[] };
  chord?: readonly [lo: number, hi: number];
  dna?: number;
  take?: number;
}

export interface ScoreProfile {
  readonly name?: string;
  readonly scales: readonly Scale[];
  readonly states: Readonly<Record<string, StateDef>>;
  readonly initial: string;
  readonly routes: Readonly<Record<string, Route>>;
  readonly home: string;
  readonly rhythms: readonly (readonly number[])[];
  readonly motifs: Readonly<Record<string, MotifDef>>;
  readonly chords?: readonly (readonly number[])[];
  readonly centres?: Readonly<Record<string, readonly number[]>>;
}
