import type { Rng } from '../core/rng';
import type { WorldStateId } from '../core/types';

export type Kind = 'firaxa' | 'selkath' | 'harvester' | 'sub' | 'giant' | 'crew' | 'loader' | 'droid' | 'ship';

export interface Agent {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: Kind;
  id: number;
  tx?: number;
  ty?: number;
  dead?: number;
}

export interface Actor extends Agent {
  sp: string;
  dir: -1 | 1;
  alpha: number;
  sc: number;
  fr: number;
  rot: number;
  z: number;
  acc: string;
  carry: number;
  mode: number;
  vmax: number;
  fmax: number;
  tx: number;
  ty: number;
  cx: number;
  cy: number;
  r: number;
  wa: number;
  ph: number;
  lo: number;
  hi: number;
  gid: number;
  tid: number;
  mask: number;
  fade: number;
  tm: number;
  lit: number;
  dead: number;
  ru: number;
  rnd: Rng | null;
}

export interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  top: number;
  col: number;
  a: number;
}

export interface Fx {
  t: number;
  x: number;
  y: number;
  a: number;
  b: number;
  c: number;
  col: string;
}

export const X = {
  ring: 0, flash: 1, tick: 2, card: 3, token: 4, lamp: 5, dust: 6, rect: 7, crate: 8, judge: 9,
} as const;

export const COL = {
  void: '#05070a',
  kolto: '#19e3c1',
  cyan: '#5ad8ff',
  phos: '#7dff9a',
  amber: '#ffb000',
  mag: '#ff4fd8',
  rim: '#1f3d47',
  white: '#e8fbff',
};

export const WL = 59;
export const FL = 152;
export const BAND = [0.1, 0.3] as const;

export const colH = FL - WL;
export const bandY = (b: readonly number[]): [number, number] => [WL + b[0] * colH, WL + b[1] * colH];

export const cl = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const sm = (t: number): number => {
  const u = cl(t, 0, 1);
  return u * u * (3 - 2 * u);
};
export const ramp = (p: number, a: number, b: number): number => cl((p - a) / (b - a), 0, 1);
export const wrap = (x: number): number => x - Math.round(x);

export function bez(a: number, b: number, c: number, d: number, t: number): number {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

export interface Lat {
  E: number;
  T: number;
  F: number;
  Q: number;
  P: number;
}

export interface Beat {
  bpm: number;
  pos: number;
}

export interface Ptr {
  x: number;
  y: number;
  vx: number;
  active: boolean;
}

export interface Env {
  seed: number;
  state: WorldStateId;
  lat(): Lat;
  beat(): Beat | null;
  pointer(): Ptr | null;
  reduced(): boolean;
}

export interface Knobs {
  fee: number;
  door: number;
  hall: number;
  ga: number;
  gb: number;
  w0: number;
  w1: number;
  w2: number;
  shake: number;
  tint: number;
  pod: number;
  wreck: number;
  mon: number;
  cam: number;
  cons: number;
  spin: number;
  ctl: number;
  port: number;
  dark: number;
  vd: number;
}

export const knobs = (): Knobs => clearKnobs({} as Knobs);

export function clearKnobs(k: Knobs): Knobs {
  k.fee = k.door = k.hall = k.ga = k.gb = k.shake = k.tint = k.pod = k.wreck = k.mon = 0;
  k.cam = k.cons = k.spin = k.ctl = k.port = k.dark = k.vd = 0;
  k.w0 = k.w1 = k.w2 = 1;
  return k;
}

export function actor(kind: Kind, sp: string, x: number, y: number, id: number, o: Partial<Actor> = {}): Actor {
  return {
    x, y, vx: 0, vy: 0, kind, id, sp, dir: 1, alpha: 1, sc: 1, fr: 0, rot: 0, z: 2, acc: '', carry: 0, mode: 0,
    vmax: 10, fmax: 6, tx: x, ty: y, cx: x, cy: y, r: 20, wa: 0, ph: 0, lo: 0, hi: 1e9, gid: 0, tid: -1, mask: 0,
    fade: 0, tm: 0, lit: 1, dead: 0, ru: 0, rnd: null, ...o,
  };
}
