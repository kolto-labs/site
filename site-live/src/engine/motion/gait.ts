import { splitmix32, streamSeed } from '../core/rng';
import type { Actor, Beat, Lat } from './kit';
import type { BeatSrc } from './types';
import { cl, wrap } from './kit';

export interface Gait {
  speed: number;
  halfStride: number;
  hesitate: number;
  linger: number;
}

export type GaitKind = 'selkath' | 'suit' | 'loader';

const BASE = { selkath: 7, suit: 11.25, loader: 9 } as const;
const L0 = { selkath: 2.7, suit: 3.3, loader: 3.3 } as const;
const RATES = [0.5, 2 / 3, 1, 1.5, 2];

export const beatPos = (b: BeatSrc): number => (b.bar * b.meter) / 4 + b.beat + b.phase;

export function npcZ(seed: number, id: number): number {
  const a = (splitmix32(streamSeed(seed, 'motion') ^ Math.imul(id + 1, 0x85ebca6b)) + 0x6d2b79f5) >>> 0;
  let r = Math.imul(a ^ (a >>> 15), 1 | a);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 2147483648 - 1;
}

export function gaitOf(lat: Lat, kind: GaitKind, z: number, idle = 1): Gait {
  const mv = (0.82 + 0.36 * lat.E) * idle;
  return {
    speed: BASE[kind] * mv * (1 + 0.08 * z),
    halfStride: L0[kind] * (1 - 0.15 * lat.T),
    hesitate: 0.1 + 0.25 * lat.T,
    linger: 1 + 0.5 * lat.F,
  };
}

let ls = 0;
let lf = 0;

function lock(speed: number, half: number, beat: Beat | null): void {
  ls = half;
  lf = 0;
  if (!beat) return;
  const f = speed / half;
  const bps = beat.bpm / 60;
  let best = 0;
  let bd = 1e9;
  for (let i = 0; i < RATES.length; i++) {
    const d = Math.abs(f / (RATES[i] * bps) - 1);
    if (d < bd) {
      bd = d;
      best = RATES[i];
    }
  }
  if (bd > 0.1) return;
  ls = speed / (best * bps);
  lf = best;
}

export function lockStride(g: Gait, beat: Beat | null): { l: number; fm: number } {
  lock(g.speed, g.halfStride, beat);
  return { l: ls, fm: lf };
}

export function strideStep(a: Actor, dist: number, dt: number, kind: GaitKind, lat: Lat, beat: Beat | null, speed: number): void {
  lock(Math.max(speed, 0.01), L0[kind] * (1 - 0.15 * lat.T), beat);
  a.ph += dist / ls;
  if (lf && beat) a.ph += 0.5 * wrap(beat.pos * lf - a.ph) * dt;
  a.fr = Math.floor(a.ph) & 1;
}

export const idleEase = (cur: number, p: number, dt: number): number => cl(cur + (p < 0.2 ? -1 : 1) * (0.15 / 10) * dt, 0.85, 1);
