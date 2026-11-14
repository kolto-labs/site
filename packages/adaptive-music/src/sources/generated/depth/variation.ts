import type { LayerId } from './layers';
import { IDS, u } from './layers';

export interface Micro {
  dt: number;
  dB: number;
  ct: number;
  pan: number;
  flt: number;
  att: number;
}

export interface Drift {
  tilt: number;
  width: number;
  send: number;
  duty: number;
}

export interface PhraseVar {
  duty: number;
  send: number;
}

export const DUTY: readonly number[] = [0.125, 0.1875, 0.25, 0.3125, 0.375];
export const SLOW_T: readonly number[] = [151 * Math.sqrt(17), 193 * Math.sqrt(19), 241 * Math.sqrt(23), 307 * Math.sqrt(29)];

export function micro(seed: number, id: LayerId, push: number, n: number, s: number, lite: boolean, phrase: number): Micro {
  const L = IDS.indexOf(id);
  const v = (j: number): number => 2 * (lite ? u(seed, 20, L, phrase, j) : u(seed, 20, L, n, Math.round(s * 6), j)) - 1;
  return {
    dt: id === 'kick' ? 0 : 0.004 * v(0) + push,
    dB: v(6) < 0 ? 1.5 * v(1) : 0.75 * (v(1) + v(7)),
    ct: id === 'arp' || id === 'melody' ? 3 * v(2) : 0,
    pan: id === 'arp' || id === 'ticks' || id === 'glint' ? 0.05 * v(3) : 0,
    flt: 1 + 0.15 * v(4),
    att: 1 + 0.2 * v(5),
  };
}

export function drift(seed: number, t: number): Drift {
  const x = SLOW_T.map((T, i) => Math.sin(2 * Math.PI * (t / T + u(seed, 21, i))));
  return { tilt: x[0], width: 0.1 * x[1], send: 2 * x[2], duty: x[3] };
}

export function phraseVar(seed: number, phrase: number, t: number): PhraseVar {
  const d = Math.floor(5 * u(seed, 22, phrase)) + Math.round(drift(seed, t).duty);
  return { duty: d < 0 ? 0 : d > 4 ? 4 : d, send: 2 * u(seed, 23, phrase) - 1 };
}
