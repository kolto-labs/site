import type { CueSpec, Gesture, PulseLayer, Quantise, Transform } from '@kolto/adaptive-music';
import type { EventId } from '../engine/core/types';

export type MotifId =
  | 'rep' | 'sith' | 'permit' | 'dock' | 'panel' | 'security' | 'court' | 'ancient' | 'swim' | 'detuned' | 'minor';

export type CueMap = { readonly [K in EventId]: CueSpec };

const m = (gestures: readonly Gesture[], pan: CueSpec['pan'] = 'track', offscreen: CueSpec['offscreen'] = 'submerge'): CueSpec =>
  ({ gestures, pan, offscreen });

type G<K extends Gesture['kind']> = Extract<Gesture, { kind: K }>;
const mark = (name: string, each = false, beats = 0): Quantise => ({ mark: name, each, beats });
const M = (motif: MotifId, voice: string, lv: number, at: Quantise, x: Partial<G<'motif'>> = {}): Gesture => ({ kind: 'motif', motif, voice, lv, at, ...x });
const X = (voice: string, lv: number, at: Quantise, x: Partial<G<'fx'>> = {}): Gesture => ({ kind: 'fx', voice, lv, at, ...x });
const W = (voice: G<'swell'>['voice'], lv: number, env: G<'swell'>['env'], x: Partial<G<'swell'>> = {}): Gesture => ({ kind: 'swell', voice, lv, env, ...x });
const T = (op: Transform, x: Partial<G<'transform'>> = {}): Gesture => ({ kind: 'transform', op, ...x });
const B = (layer: G<'bed'>['layer'], lv: number, x: Partial<G<'bed'>> = {}): Gesture => ({ kind: 'bed', layer, lv, ...x });
const L = (layer: PulseLayer, voice: string, cycle: number, k: G<'layer'>['k'], lv: number, fade: G<'layer'>['fade'], x: Partial<G<'layer'>> = {}): Gesture =>
  ({ kind: 'layer', layer, voice, cycle, k, lv, fade, ...x });
const load = (x: Partial<G<'layer'>> = {}): Gesture => L('load', 'pulse25', 14, [4, 5, 6], -12, [1, 1], x);
const pack = (x: Partial<G<'layer'>> = {}): Gesture => L('pack', 'clack', 10, [3, 3, 4], -14, [0.25, 1], x);
const dock = (at: Quantise, lv: number, hits: readonly number[]): Gesture => M('dock', 'stab', lv, at, { hits });
const sub = (lv: number, env: G<'swell'>['env']): Gesture => W('sub', lv, env);

export const CUES: CueMap = {
  V1: m([B('drone', -6, { lp: [300, 1200] })], 'center', 'play'),
  'V1x': m([B('drone', -8, { lp: [220, 220], tremolo: { hz: 0.3, depth: 0.3 }, drips: [3, 9] })], 'center', 'play'),
  F1: m([B('texture', -24)]),
  A1: m([B('pad', -10)], 'center', 'play'),
  A2: m([X('droplet', -26, 'beat', { p: 0.5 })], 'track', 'skip'),
  A3: m([], 'center', 'play'),
  V2: m([L('harvest', 'pulse12', 12, [3, 4, 5], -12, [1, 2])]),
  A4: m([pack()]),
  A5: m([load(), M('rep', 'pulse25', -9, mark('mid'))]),
  A6: m([load(), M('sith', 'pulse25', -9, mark('mid'))]),
  D1: m([dock(mark('fee'), -8, [0, 6]), dock(mark('blink', true), -10, [0])]),
  D2: m([X('rise', -12, mark('liftoff'), { dur: 1.5 })]),
  F2: m([W('noiseSwell', -10, 'span', { sweep: [300, 900], dip: 0.2 })]),
  A7: m([M('permit', 'pulse50', -10, mark('tick', false, -1))]),
  S1: m([W('glideDown', -14, 'span', { glide: -12 })]),
  S2: m([L('station', 'station', 9, [2, 3, 4], -14, [0.25, 1]), X('tick', -16, mark('flash'))]),
  S3: m([M('panel', 'pulse25', -12, 'bar')]),
  D3: m([X('swoosh', -14, 'now', { dur: 1.2 }), M('sith', 'pulse25', -9, 'beat')]),
  F3: m([X('skitter', -18, mark('chase1'), { dur: 1.5 }), X('skitter', -18, mark('chase2'), { dur: 1.5 })]),
  C1: m([T('heldDissonance', { until: mark('security'), lv: -14 })], 'center'),
  D4: m([L('hats', 'hat', 16, [12, 12, 12], -14, [0, 0], { rate: 2, bars: 2 })], 'sweep'),
  V3: m([sub(-16, [3, 4, 3])], 'center'),
  F4: m([T('quicken')], 'center'),
  S4: m([X('ping', -12, mark('pulse'), { echo: 0.6, pitch: 1175 })]),
  A8: m([M('security', 'stab', -10, 'bar', { lp: 1200 })]),
  D5: m([M('sith', 'pulse25', -9, mark('landed', false, 4), { octave: -1 })]),
  C2: m([M('court', 'bell', -10, 'bar')]),
  F5: m([M('swim', 'lead', -10, 'bar', { augment: 2 }), T('part')]),
  S5: m([T('sus', { bars: 2 }), M('ancient', 'bell', -12, 'bar')], 'center'),
  'R1-a': m([sub(-16, [3, 9, 3]), X('impact', -10, mark('ram', true))]),
  'R1-b': m([X('cluster', -20, mark('scream'), { pitch: 74 })], 'center'),
  'R1-c': m([T('doubleTime')], 'center'),
  'R1-d': m([T('dropout', { at: mark('dark', true), bars: 1 })], 'center'),
  'R1-e': m([M('panel', 'pulse25', -14, 'bar', { mode: 'minor' })]),
  'R1-f': m([M('detuned', 'lead', -14, 'bar', { detune: 25 })]),
  'R1-g': m([T('cutLayer', { at: mark('lightsOut') })], 'center'),
  'R2-a': m([X('boom', -10, mark('flash'), { duck: true }), { kind: 'state', to: 'R2', at: 'phrase' }]),
  'R2-b': m([sub(-16, 'span'), T('resolve', { bars: 2 })], 'center'),
  'R2-c': m([M('security', 'pulse50', -16, 'bar'), X('ping', -16, mark('ring'), { pitch: 1175 })]),
  'R2-d': m([pack({ stop: 'doors' })]),
  'R3-a': m([B('drone', -8, { lp: [1200, 220], glide: 8 }), T('thin', { bars: 2 }), { kind: 'state', to: 'R3', at: 'phrase' }], 'center', 'play'),
  'R3-b': m([X('rise', -14, mark('liftoff'), { dur: 1.5, lp: 700 })]),
  'R3-c': m([load({ rate: 0.5 })]),
  'R3-d': m([dock(mark('blink', true), -10, [0])]),
  'R3-e': m([M('minor', 'lead', -14, 'bar', { octave: -1 })]),
  'T1-a': m([M('rep', 'pulse25', -9, mark('token'), { dx: -0.1 }), M('sith', 'pulse25', -9, mark('token'), { dx: 0.1 })]),
};
