import { Emitter } from '../core/emitter';
import { dropSlot, slot } from '../core/global';
import type { Rng } from '../core/rng';
import { normal, stream } from '../core/rng';
import type { Unsubscribe } from '../core/types';
import type { InteractionBus, SignalFrame } from '../signals/bus';
import { getBus } from '../signals/bus';
import { clamp01, ema, nsat } from '../signals/maths';

export type Dim = 'energy' | 'tension' | 'focus' | 'curiosity';
export type Band = 0 | 1 | 2;

export interface DimValue {
  value: number;   // 0..1 output after drift, rotation and slew
  fast: number;    // fast EMA of the target
  slow: number;    // slow EMA of the target
  band: Band;      // Schmitt band with a 16 s hold
}

export interface LatentSnapshot {
  t: number;
  energy: DimValue; tension: DimValue; focus: DimValue; curiosity: DimValue;
  presence: number; // P, 0..1
}

export interface LatentState {
  get(): Readonly<LatentSnapshot>;
  /** Throttled delivery; default 5 Hz. 20 Hz is for the audio engine and canvas loops. */
  subscribe(fn: (s: Readonly<LatentSnapshot>) => void, opts?: { hz?: 1 | 5 | 20 }): Unsubscribe;
  onBand(fn: (dim: Dim, band: Band, prev: Band) => void): Unsubscribe;
}

export const DIMS: readonly Dim[] = ['energy', 'tension', 'focus', 'curiosity'];
export const REST: readonly number[] = [0.15, 0.2, 0.5, 0.2];
const TAU_FAST = [1.5, 1.0, 4, 6];
const TAU_SLOW = [45, 30, 90, 120];
const OU_THETA = 1 / 150;
const OU_SD = 0.06;
const SLEW = 0.25; // per second
const HOLD = 16; // seconds between band changes
const MAX_ROT = (12 * Math.PI) / 180;

function neutralDim(i: number): DimValue {
  return Object.freeze({ value: REST[i], fast: REST[i], slow: REST[i], band: 0 as Band });
}

/** Server and first-render value: every dim at its rest value, band 0, presence 1. */
export const NEUTRAL_LATENT: Readonly<LatentSnapshot> = Object.freeze({
  t: 0,
  energy: neutralDim(0),
  tension: neutralDim(1),
  focus: neutralDim(2),
  curiosity: neutralDim(3),
  presence: 1,
});

/**
 * One term of a target row: [w, a, b]. b = 0: f[a] for a > 0, 1 − f[−a] for a < 0.
 * b > 0: (1 − f[a])·f[b]. Features are 1-based (f1..f16).
 */
type Term = readonly [w: number, a: number, b: number];
type Rows = readonly (readonly Term[])[];

const FINE: Rows = [
  [[0.3, 1, 0], [0.15, 2, 0], [0.2, 5, 0], [0.2, 8, 0], [0.1, 7, 0], [0.05, 12, 0]],
  [[0.3, 3, 0], [0.15, 2, 0], [0.2, 9, 0], [0.15, 6, 5], [0.2, 4, 1]],
  [[0.35, 11, 0], [0.2, -1, 0], [0.15, 16, 0], [0.15, 4, 0], [0.15, -12, 0]],
  [[0.25, 13, 0], [0.2, 14, 0], [0.25, 15, 0], [0.15, 10, 0], [0.15, 4, 1]],
];
const COARSE: Rows = [
  [[0.45, 8, 0], [0.3, 5, 0], [0.15, 12, 0], [0.1, 7, 0]],
  [[0.5, 9, 0], [0.3, 6, 5], [0.2, 8, 0]],
  [[0.45, 11, 0], [0.25, -8, 0], [0.15, 16, 0], [0.15, -12, 0]],
  [[0.35, 13, 0], [0.25, 14, 0], [0.4, 10, 0]],
];

export interface LatentParams {
  readonly fine: readonly Float64Array[];
  readonly coarse: readonly Float64Array[];
  /** cos θ1, sin θ1, cos θ2, sin θ2 */
  readonly rot: readonly [number, number, number, number];
  readonly tauFast: Float64Array;
  readonly tauSlow: Float64Array;
  readonly d0: Float64Array;
  readonly sd: number;
}

/**
 * The per-visit mapping, drawn from the latent stream in a fixed order: fine weights,
 * coarse weights, θ1, θ2, the eight τs, then d0. The options switch parts off for checks;
 * the draws happen either way.
 */
export function latentParams(
  rng: Rng | null,
  opts: { jitter?: boolean; rotate?: boolean; drift?: boolean } = {},
): LatentParams {
  const u = (): number => (rng ? rng() : 0.5);
  const jitter = rng !== null && opts.jitter !== false;
  const rotate = rng !== null && opts.rotate !== false;
  const drift = rng !== null && opts.drift !== false;

  const weights = (rows: Rows): Float64Array[] =>
    rows.map((row) => {
      const w = new Float64Array(row.length);
      let sum = 0;
      for (let k = 0; k < row.length; k++) {
        const x = u();
        w[k] = jitter ? row[k][0] * (1 + 0.15 * (2 * x - 1)) : row[k][0];
        sum += w[k];
      }
      for (let k = 0; k < row.length; k++) w[k] /= sum;
      return w;
    });
  const fine = weights(FINE);
  const coarse = weights(COARSE);
  const th1 = (2 * u() - 1) * MAX_ROT;
  const th2 = (2 * u() - 1) * MAX_ROT;
  const tauFast = new Float64Array(4);
  const tauSlow = new Float64Array(4);
  for (let i = 0; i < 4; i++) {
    const a = u();
    const b = u();
    tauFast[i] = TAU_FAST[i] * (jitter ? 0.85 + 0.3 * a : 1);
    tauSlow[i] = TAU_SLOW[i] * (jitter ? 0.85 + 0.3 * b : 1);
  }
  const d0 = new Float64Array(4);
  for (let i = 0; i < 4; i++) {
    const xi = rng ? normal(rng) : 0;
    d0[i] = drift ? OU_SD * xi : 0;
  }
  const r1 = rotate ? th1 : 0;
  const r2 = rotate ? th2 : 0;
  return {
    fine,
    coarse,
    rot: [Math.cos(r1), Math.sin(r1), Math.cos(r2), Math.sin(r2)],
    tauFast,
    tauSlow,
    d0,
    sd: drift ? OU_SD : 0,
  };
}

/** Schmitt trigger: 0→1 at ≥ 0.40, 1→2 at ≥ 0.70, 2→1 at ≤ 0.60, 1→0 at ≤ 0.30. */
export function schmitt(band: Band, v: number): Band {
  if (band === 0) return v >= 0.4 ? 1 : 0;
  if (band === 1) return v >= 0.7 ? 2 : v <= 0.3 ? 0 : 1;
  return v <= 0.6 ? 1 : 2;
}

export interface LatentCore {
  t: number;
  fast: Float64Array;
  slow: Float64Array;
  value: Float64Array;
  d: Float64Array;
  band: Uint8Array;
  bandAt: Float64Array;
}

/** Starts at rest. Bands are set from the rest values (focus starts mid) without an event. */
export function latentCore(p: LatentParams, t = 0): LatentCore {
  const band = new Uint8Array(4);
  for (let i = 0; i < 4; i++) band[i] = schmitt(0, REST[i]);
  return {
    t,
    fast: Float64Array.from(REST),
    slow: Float64Array.from(REST),
    value: Float64Array.from(REST),
    d: Float64Array.from(p.d0),
    band,
    bandAt: new Float64Array(4).fill(-Infinity),
  };
}

const centred = new Float64Array(4);

/**
 * One update. `f` holds features f1..f16 at indices 1..16. `ou` feeds the drift (null: no drift step).
 * `onBand` gets the dim index for each band change.
 */
export function stepLatent(
  c: LatentCore,
  p: LatentParams,
  f: ArrayLike<number>,
  presence: number,
  fine: boolean,
  dt: number,
  t: number,
  ou: Rng | null,
  onBand?: (i: number, band: Band, prev: Band) => void,
): void {
  const rows = fine ? FINE : COARSE;
  const w = fine ? p.fine : p.coarse;
  for (let i = 0; i < 4; i++) {
    const row = rows[i];
    const wi = w[i];
    let x = 0;
    for (let k = 0; k < row.length; k++) {
      const a = row[k][1];
      const b = row[k][2];
      x += wi[k] * (b > 0 ? (1 - f[a]) * f[b] : a > 0 ? f[a] : 1 - f[-a]);
    }
    const target = presence * x + (1 - presence) * REST[i];
    c.fast[i] = ema(c.fast[i], target, dt, p.tauFast[i]);
    c.slow[i] = ema(c.slow[i], target, dt, p.tauSlow[i]);
    centred[i] = 0.55 * c.slow[i] + 0.45 * c.fast[i] - 0.5;
  }
  if (ou && p.sd > 0 && dt > 0) {
    const e = Math.exp(-OU_THETA * dt);
    const k = p.sd * Math.sqrt(1 - e * e);
    for (let i = 0; i < 4; i++) c.d[i] = c.d[i] * e + k * normal(ou);
  }
  const [c1, s1, c2, s2] = p.rot;
  const e0 = c1 * centred[0] - s1 * centred[1];
  const e1 = s1 * centred[0] + c1 * centred[1];
  const e2 = c2 * centred[2] - s2 * centred[3];
  const e3 = s2 * centred[2] + c2 * centred[3];
  const lim = SLEW * dt;
  for (let i = 0; i < 4; i++) {
    const r = i === 0 ? e0 : i === 1 ? e1 : i === 2 ? e2 : e3;
    const x = clamp01(r + 0.5 + c.d[i]);
    const dv = x - c.value[i];
    c.value[i] += dv > lim ? lim : dv < -lim ? -lim : dv;
    const prev = c.band[i] as Band;
    const next = schmitt(prev, c.value[i]);
    if (next !== prev && t - c.bandAt[i] >= HOLD) {
      c.band[i] = next;
      c.bandAt[i] = t;
      onBand?.(i, next, prev);
    }
  }
  c.t = t;
}

/** Features f1..f16 (indices 1..16) from a bus frame. */
export function frameFeatures(fr: Readonly<SignalFrame>, f: Float64Array): void {
  f[1] = fr.pointer.speed;
  f[2] = fr.pointer.accel;
  f[3] = fr.pointer.jerk;
  f[4] = fr.pointer.straightness;
  f[5] = fr.clicks.fast;
  f[6] = fr.clicks.regularity;
  f[7] = fr.keys.rate;
  f[8] = fr.scroll.speed;
  f[9] = fr.scroll.reversals;
  f[10] = fr.scroll.newDepth;
  f[11] = nsat(fr.dwell.section, 40);
  f[12] = fr.route.rate;
  f[13] = fr.route.newRoutes;
  f[14] = fr.route.entropy;
  f[15] = fr.pointer.hover;
  f[16] = fr.reading;
}

export interface LatentInternal extends LatentState {
  /** Subscribes to the bus. Idempotent. */
  start(): void;
  dispose(): void;
  running(): boolean;
}

/** `rng` is the visit's latent stream: it sets the mapping, then feeds the drift. */
export function createLatent(bus: InteractionBus, rng: Rng): LatentInternal {
  const params = latentParams(rng);
  const core = latentCore(params);
  const f = new Float64Array(17);
  const dimSnap = (i: number): DimValue => ({
    value: core.value[i], fast: core.fast[i], slow: core.slow[i], band: core.band[i] as Band,
  });
  const snap: LatentSnapshot = {
    t: 0, energy: dimSnap(0), tension: dimSnap(1), focus: dimSnap(2), curiosity: dimSnap(3), presence: 1,
  };
  const dims = [snap.energy, snap.tension, snap.focus, snap.curiosity];
  const hz20 = new Emitter<Readonly<LatentSnapshot>>();
  const hz5 = new Emitter<Readonly<LatentSnapshot>>();
  const hz1 = new Emitter<Readonly<LatentSnapshot>>();
  const bands = new Emitter<Dim, Band, Band>();
  const changed = new Int8Array(4).fill(-1); // previous band per changed dim, −1 when unchanged
  let offs: Unsubscribe[] = [];
  let lastT = NaN;
  let n = 0;

  const mark = (i: number, _band: Band, prev: Band): void => {
    changed[i] = prev;
  };

  function onFrame(fr: Readonly<SignalFrame>): void {
    frameFeatures(fr, f);
    const dt = Number.isNaN(lastT) ? 0 : Math.max(0, fr.t - lastT);
    lastT = fr.t;
    stepLatent(core, params, f, fr.presence.p, fr.pointer.fine, dt, fr.t, rng, mark);
    snap.t = fr.t;
    snap.presence = fr.presence.p;
    for (let i = 0; i < 4; i++) {
      const d = dims[i];
      d.value = core.value[i];
      d.fast = core.fast[i];
      d.slow = core.slow[i];
      d.band = core.band[i] as Band;
    }
    for (let i = 0; i < 4; i++) {
      if (changed[i] < 0) continue;
      const prev = changed[i] as Band;
      changed[i] = -1;
      bands.emit(DIMS[i], core.band[i] as Band, prev);
    }
    hz20.emit(snap);
    if (n % 4 === 0) hz5.emit(snap);
    if (n % 20 === 0) hz1.emit(snap);
    n++;
  }

  return {
    get: () => snap,
    subscribe(fn, opts) {
      const hz = opts?.hz ?? 5;
      return (hz === 20 ? hz20 : hz === 1 ? hz1 : hz5).on(fn);
    },
    onBand: (fn) => bands.on(fn),
    start() {
      if (offs.length > 0) return;
      offs = [
        bus.subscribe(onFrame),
        bus.on('visibility', (e) => {
          if (!e.visible) snap.presence = 0;
        }),
      ];
    },
    dispose() {
      for (const off of offs) off();
      offs = [];
      hz20.clear();
      hz5.clear();
      hz1.clear();
      bands.clear();
      dropSlot('latent');
    },
    running: () => offs.length > 0,
  };
}

/** The shared latent state for this visit's seed, created once per document. Doesn't start it. */
export const getLatent = (seed: number): LatentInternal =>
  slot('latent', () => createLatent(getBus(), stream(seed, 'latent')));
