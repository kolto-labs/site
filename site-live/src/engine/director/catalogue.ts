import type { CueId, EventId, Tier, WorldStateId } from '../core/types';

export const STATES: readonly WorldStateId[] = ['R0', 'R1', 'R2', 'R3', 'T1', 'T2', 'T3'];
export const STATE_WEIGHTS: readonly number[] = [85, 5, 5.5, 1.5, 2, 0.5, 0.5];

const R0 = 1, R1 = 2, R2 = 4, R3 = 8, T1 = 16, T = 112, ALL = 127;

export type Mark = readonly [name: string, at: number];

export interface EventDef {
  readonly id: EventId;
  readonly tier: Tier;
  readonly lo: number;
  readonly hi: number;
  readonly w: number;
  readonly wT: number;
  readonly mask: number;
  readonly cues: readonly CueId[];
  readonly marks: readonly Mark[];
  readonly bays?: readonly [first: number, count: number];
}

const mk = (
  id: EventId, tier: Tier, lo: number, hi: number, w: number, mask: number,
  cues: readonly CueId[] = [], marks: readonly Mark[] = [], wT = w, bays?: readonly [number, number],
): EventDef => ({ id, tier, lo, hi, w, wT, mask, cues, marks, bays });

const A: Tier = 'ambient', C: Tier = 'common', U: Tier = 'uncommon', R: Tier = 'rare', V: Tier = 'veryRare', O: Tier = 'oneShot';

export const BLINKS: readonly Mark[] = [['blink1', 0.2], ['blink2', 0.35], ['blink3', 0.5], ['blink4', 0.65], ['blink5', 0.8]];

export const CATALOGUE: readonly EventDef[] = [
  mk('V1', A, 0, 0, 0, R0 | R1 | R2 | T, ['bed.vent']),
  mk('V1x', A, 0, 0, 0, R3, ['bed.vent', 'state.R3']),
  mk('F1', A, 0, 0, 0, R0 | R1 | R2 | T, ['texture.school']),
  mk('A1', A, 0, 0, 0, ALL, ['bed.city']),
  mk('A2', A, 0, 0, 0, ALL, ['fx.tick']),
  mk('A3', A, 0, 0, 0, ALL),
  mk('V2', C, 25, 40, 18, R0 | R2, ['pulse.harvest']),
  mk('A4', C, 20, 20, 20, ALL, ['pulse.pack']),
  mk('A5', C, 15, 25, 16, ALL, ['pulse.load', 'motif.rep'], [['mid', 0.5]], undefined, [0, 3]),
  mk('A6', C, 15, 25, 16, ALL, ['pulse.load', 'motif.sith'], [['mid', 0.5]], undefined, [3, 1]),
  mk('D1', C, 15, 15, 14, ALL, ['motif.dock'], [['fee', 0.4]], undefined, [0, 3]),
  mk('D2', C, 12, 12, 14, ALL, ['fx.rise'], [['liftoff', 0.15]]),
  mk('F2', C, 10, 15, 12, R0 | R1 | R2 | T, ['swell.firaxa'], [['peak', 0.5]]),
  mk('A7', U, 10, 10, 6, ALL, ['motif.permit'], [['tick', 0.5]]),
  mk('S1', U, 25, 25, 6, R0 | R1, ['swell.descent']),
  mk('S2', U, 20, 20, 5, R0, ['pulse.station'], [['flash', 0.5]]),
  mk('S3', U, 8, 8, 5, R0, ['motif.panel']),
  mk('D3', U, 10, 10, 5, ALL, ['fx.swoosh', 'motif.sith']),
  mk('F3', U, 15, 15, 4, R0 | R1, ['perc.skitter'], [['chase1', 0.25], ['chase2', 0.65]]),
  mk('C1', U, 15, 15, 4, ALL, ['harm.heldDissonance'], [['security', 0.6]]),
  mk('D4', U, 20, 20, 3, ALL, ['perc.hatFlurry']),
  mk('V3', R, 8, 8, 1.5, R0, ['swell.giant']),
  mk('F4', R, 15, 15, 2, R0, ['xform.quicken']),
  mk('S4', R, 6, 6, 2, R0 | R1, ['fx.ping'], [['pulse', 0.2]]),
  mk('A8', R, 15, 15, 1.5, ALL, ['motif.security']),
  mk('D5', R, 20, 20, 1.5, ALL, ['motif.sith'], [['landed', 0.35]], undefined, [3, 1]),
  mk('C2', R, 15, 15, 1.5, ALL, ['motif.court'], [['verdict', 0.6]], 5),
  mk('F5', R, 20, 20, 1, R0 | R2, ['motif.swim']),
  mk('S5', V, 12, 12, 0.3, R0, ['motif.ancient']),
  mk('R1-a', C, 15, 15, 14, R1, ['swell.giant'], [['ram', 0.35], ['ram', 0.7]]),
  mk('R1-b', U, 3, 3, 5, R1, ['fx.scream'], [['scream', 0.2]]),
  mk('R1-c', C, 20, 20, 12, R1, ['xform.doubleTime']),
  mk('R1-d', U, 12, 12, 4, R1, ['xform.dropout'], [['dark', 0.2], ['dark', 0.45], ['dark', 0.7]]),
  mk('R1-e', U, 8, 8, 4, R1, ['motif.panel']),
  mk('R1-f', R, 6, 6, 1.5, R1, ['motif.detuned']),
  mk('R1-g', R, 10, 10, 1, R1, ['xform.cutLayer'], [['lightsOut', 0.6]]),
  mk('R2-a', O, 10, 10, 0, R2, ['fx.boom', 'state.R2'], [['flash', 0.3]]),
  mk('R2-b', R, 20, 20, 1, R2, ['swell.giant']),
  mk('R2-c', U, 8, 8, 3, R2, ['motif.security'], [['ring', 0.4]]),
  mk('R2-d', U, 15, 15, 3, R2, ['pulse.pack'], [['doors', 0.3]]),
  mk('R3-a', O, 12, 12, 0, R3, ['bed.vent', 'state.R3']),
  mk('R3-b', C, 12, 12, 14, R3, ['fx.rise'], [['liftoff', 0.15]], undefined, [0, 3]),
  mk('R3-c', C, 15, 15, 10, R3, ['pulse.load']),
  mk('R3-d', U, 6, 6, 4, R3, ['motif.dock'], BLINKS),
  mk('R3-e', U, 8, 8, 4, R3, ['motif.minor']),
  mk('T1-a', 'rider', 0, 0, 0, T1, ['motif.rep', 'motif.sith'], [['token', 0.5]]),
];

export const TIER_RANGE: Readonly<Record<string, readonly [number, number]>> = {
  common: [12, 22], uncommon: [3, 8], rare: [1, 2], veryRare: [0.2, 0.5],
};

export const LORE_MULT: readonly (readonly [EventId, number, number])[] = [
  ['V2', 2, 0.5], ['A4', 3, 0.2], ['A6', 3, 0.5], ['D2', 3, 0.2], ['A5', 3, 0.3], ['A7', 3, 0.3],
];
