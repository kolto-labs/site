import { getClock } from '../core/clock';
import { Emitter } from '../core/emitter';
import { dropSlot, slot } from '../core/global';
import { encodeSeed, parseSeedParam, randomSeed, stream } from '../core/rng';
import type { CueId, EventId, Tier, Unsubscribe, WorldStateId } from '../core/types';
import type { InteractionBus, SignalFrame } from '../signals/bus';
import { getBus } from '../signals/bus';
import { getLatent } from '../state/latent';
import type { LatentState } from '../state/latent';
import { AFFINITY } from './affinity';
import { BLINKS, CATALOGUE, LORE_MULT, STATES, STATE_WEIGHTS, TIER_RANGE } from './catalogue';
import type { Mark } from './catalogue';

export interface SceneMark { name: string; at: number }

export interface SceneEvent {
  uid: number;
  id: EventId;
  tier: Tier;
  phase: 'start' | 'end';
  cut?: boolean;
  state: WorldStateId;
  startAt: number;
  duration: number;
  marks: readonly SceneMark[];
  cues: readonly CueId[];
  variant: { u: number; side: -1 | 1; bay?: 0 | 1 | 2 | 3 };
  parent?: number;
}

export interface WorldSnapshot {
  seed: number;
  seedCode: string;
  state: WorldStateId;
  flags: { koltoFlow: 'normal' | 'dark'; koltoPrice: 1 | 3; subsidy: boolean };
  ambient: readonly EventId[];
  current: SceneEvent | null;
  reducedMotion: boolean;
}

export interface ViewSpec {
  id: string;
  renders: readonly EventId[];
  visible(): boolean;
  screenX?(e: SceneEvent): number | null;
  rect?(): { left: number; top: number; right: number; bottom: number } | null;
}

export interface ViewRegistry {
  register(v: ViewSpec): Unsubscribe;
  anyVisibleFor(id: EventId): boolean;
  screenXFor(e: SceneEvent): number | null;
}

export interface Director {
  world(): Readonly<WorldSnapshot>;
  current(): SceneEvent | null;
  progress(e: SceneEvent, now?: number): number;
  on(fn: (e: SceneEvent) => void): Unsubscribe;
  history(): readonly SceneEvent[];
  shareUrl(): string;
  now(): number;
  views: ViewRegistry;
}

export const NULL_WORLD: Readonly<WorldSnapshot> = Object.freeze({
  seed: 0,
  seedCode: '0',
  state: 'R0',
  flags: Object.freeze({ koltoFlow: 'normal', koltoPrice: 1, subsidy: false }),
  ambient: Object.freeze([]),
  current: null,
  reducedMotion: false,
});

export function rollWorld(seed: number): WorldStateId {
  const u = stream(seed, 'world')() * 100;
  let acc = 0;
  for (let i = 0; i < STATES.length; i++) {
    acc += STATE_WEIGHTS[i];
    if (acc >= u) return STATES[i];
  }
  return 'R0';
}

export interface DirectorOptions {
  seed: number;
  state?: WorldStateId;
  now?: () => number;
  bus?: InteractionBus & { setInsideResolver?(fn: ((x: number, y: number) => string | null) | null): void };
  latent?: LatentState & { start?(): void; dispose?(): void };
}

export interface DirectorInternal extends Director {
  advance(t: number, p: number, g: number, x: ArrayLike<number>, reduced: boolean): void;
  setSnap(start: ((t: number) => number) | null, mark?: ((t: number) => number) | null): void;
  start(): void;
  dispose(): void;
}

const TICK = 6;
const FAMILIES = ['pulse', 'motif', 'swell', 'fx'];
const IDX = new Map<EventId, number>(CATALOGUE.map((d, i) => [d.id, i]));
const mean = (i: number): number => (CATALOGUE[i].lo + CATALOGUE[i].hi) / 2;
const famOf = (i: number): number => {
  let m = 0;
  for (const c of CATALOGUE[i].cues) {
    const k = FAMILIES.indexOf(c.slice(0, c.indexOf('.')));
    if (k >= 0) m |= 1 << k;
  }
  return m;
};
const FAM = CATALOGUE.map((_, i) => famOf(i));
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

export function createDirector(o: DirectorOptions): DirectorInternal {
  const seed = o.seed >>> 0;
  const state = o.state ?? rollWorld(seed);
  const sIdx = STATES.indexOf(state);
  const bit = 1 << sIdx;
  const ev = stream(seed, 'events');
  const clockNow = o.now ?? (() => getClock().now());
  const bus = o.bus;
  const latent = o.latent;

  const pool: number[] = [];
  const ambient: EventId[] = [];
  for (let i = 0; i < CATALOGUE.length; i++) {
    const d = CATALOGUE[i];
    if (!(d.mask & bit)) continue;
    if (d.tier === 'ambient') ambient.push(d.id);
    else if (d.tier !== 'oneShot' && d.tier !== 'rider') pool.push(i);
  }
  const queue: number[] = [];
  if (state === 'R2') queue.push(IDX.get('R2-a')!, IDX.get('R2-b')!);
  if (state === 'R3') queue.push(IDX.get('R3-a')!);

  const world: WorldSnapshot = {
    seed,
    seedCode: encodeSeed(seed),
    state,
    flags: { koltoFlow: state === 'R3' ? 'dark' : 'normal', koltoPrice: state === 'R3' ? 3 : 1, subsidy: state === 'T1' },
    ambient: Object.freeze(ambient),
    current: null,
    reducedMotion: false,
  };

  const out = new Emitter<SceneEvent>();
  const hist: SceneEvent[] = [];
  const live: SceneEvent[] = [];
  const views: ViewSpec[] = [];
  const last = new Float64Array(CATALOGUE.length).fill(-Infinity);
  const fired = new Uint8Array(CATALOGUE.length);
  const wk = new Float64Array(pool.length + 1);
  const ik = new Int32Array(pool.length + 1);
  const ia5 = IDX.get('A5')!;
  const ia6 = IDX.get('A6')!;
  const ib = IDX.get('R2-b')!;
  const gateFree = sIdx >= 5 ? IDX.get('C2')! : -1;

  let uid = 0;
  let t0 = NaN;
  let lastT = 0;
  let nk = 1;
  let aT = 0;
  let mute = -Infinity;
  let active = 0;
  let rareEnd = -Infinity;
  let prevFam = 0;
  let bDone = false;
  let cur: SceneEvent | null = null;
  let curI = -1;
  let curEnd = 0;
  let curOne = false;
  let snap: ((t: number) => number) | null = null;
  let snapMark: ((t: number) => number) | null = null;
  let offs: Unsubscribe[] = [];
  const xs = new Float64Array(4);

  const reg: ViewRegistry = {
    register(v) {
      views.push(v);
      return () => {
        const k = views.indexOf(v);
        if (k >= 0) views.splice(k, 1);
      };
    },
    anyVisibleFor(id) {
      for (let k = 0; k < views.length; k++) {
        if (views[k].renders.includes(id) && views[k].visible()) return true;
      }
      return false;
    },
    screenXFor(e) {
      for (let k = 0; k < views.length; k++) {
        const v = views[k];
        if (v.screenX && v.renders.includes(e.id) && v.visible()) {
          const x = v.screenX(e);
          if (x !== null) return x;
        }
      }
      return null;
    },
  };

  const mapMarks = (m: readonly Mark[], startAt: number, dur: number): SceneMark[] =>
    m.map(([name, f]) => {
      const at = startAt + f * dur;
      return { name, at: snapMark ? Math.max(startAt, snapMark(at)) : at };
    });

  function emit(e: SceneEvent): void {
    if (e.phase === 'start') {
      hist.push(e);
      if (hist.length > 32) hist.shift();
    }
    out.emit(e);
  }

  function begin(i: number, tier: Tier, startAt: number, dur: number, u: number): void {
    const d = CATALOGUE[i];
    const marks = mapMarks(d.id === 'D1' && state === 'R3' ? BLINKS : d.marks, startAt, dur);
    const variant: SceneEvent['variant'] = { u, side: (Math.floor(u * 65536) & 1) === 0 ? -1 : 1 };
    if (d.bays) variant.bay = (d.bays[0] + Math.floor(d.bays[1] * u)) as 0 | 1 | 2 | 3;
    const e: SceneEvent = {
      uid: ++uid, id: d.id, tier, phase: 'start', state, startAt, duration: dur, marks, cues: d.cues, variant,
    };
    cur = e;
    curI = i;
    curEnd = startAt + dur;
    curOne = tier === 'oneShot';
    prevFam = FAM[i];
    live.length = 0;
    live.push(e);
    world.current = e;
    emit(e);
    if (d.id === 'A5' && state === 'T1' && u < 0.5) {
      const ri = IDX.get('T1-a')!;
      const r = CATALOGUE[ri];
      const re: SceneEvent = {
        uid: ++uid, id: r.id, tier: 'rider', phase: 'start', state, startAt, duration: dur,
        marks: mapMarks(r.marks, startAt, dur),
        cues: r.cues, variant: { ...variant }, parent: e.uid,
      };
      live.push(re);
      emit(re);
    }
  }

  function finish(cut: boolean, at: number): void {
    if (!cur) return;
    const e = cur;
    const i = curI;
    for (let k = live.length - 1; k >= 0; k--) {
      const s = live[k];
      const x: SceneEvent = { ...s, phase: 'end' };
      if (cut) x.cut = true;
      emit(x);
    }
    live.length = 0;
    cur = null;
    curI = -1;
    world.current = null;
    last[i] = at;
    if (e.tier === 'rare' || e.tier === 'veryRare') rareEnd = at;
    if (curOne && !cut && i === ib) bDone = true;
  }

  function weight(i: number, g: number): number {
    const d = CATALOGUE[i];
    const w0 = sIdx >= 4 ? d.wT : d.w;
    const [tn, tx] = TIER_RANGE[d.tier];
    const lo = Math.min(tn, w0);
    const hi = Math.max(tx, w0);
    const a = AFFINITY[d.id];
    let b = 0;
    if (a) for (let k = 0; k < 4; k++) b += a[k] * (xs[k] - 0.5);
    let w = clamp(w0 * Math.exp(1.2 * b), lo, hi);
    if (d.tier === 'rare' || d.tier === 'veryRare') w = clamp(w * (0.6 + 0.8 * g), lo, hi);
    for (let k = 0; k < LORE_MULT.length; k++) {
      const m = LORE_MULT[k];
      if (m[0] === d.id && m[1] === sIdx) w *= m[2];
    }
    if (FAM[i] & prevFam) w *= 0.6;
    return w;
  }

  function tick(T: number, p: number, g: number): void {
    const u1 = ev();
    const u2 = ev();
    const u3 = ev();
    let n = 0;
    let sum = 0;
    for (let k = 0; k < pool.length; k++) {
      const i = pool[k];
      const d = CATALOGUE[i];
      if (T - last[i] < 2 * mean(i)) continue;
      if (d.tier === 'rare' || d.tier === 'veryRare') {
        if (fired[i]) continue;
        if (i !== gateFree && (active < (d.tier === 'rare' ? 30 : 90) || p < 0.5 || T - rareEnd < 120)) continue;
      }
      if (i === ib && !bDone) continue;
      if (d.id === 'C1' && !(T - last[ia5] <= 60 && T - last[ia6] <= 60)) continue;
      const w = weight(i, g);
      wk[n] = w;
      ik[n++] = i;
      sum += w;
    }
    const q = 25 * (2 - p);
    sum += q;
    const target = u1 * sum;
    let acc = 0;
    for (let k = 0; k < n; k++) {
      acc += wk[k];
      if (acc >= target) {
        const i = ik[k];
        const d = CATALOGUE[i];
        const dur = d.lo + u2 * (d.hi - d.lo);
        if (d.tier === 'rare' || d.tier === 'veryRare') fired[i] = 1;
        begin(i, d.tier, snap ? Math.max(T, snap(T)) : T, dur, u3);
        return;
      }
    }
  }

  function advance(t: number, p: number, g: number, x: ArrayLike<number>, reduced: boolean): void {
    for (let k = 0; k < 4; k++) xs[k] = x[k];
    if (Number.isNaN(t0)) {
      t0 = lastT = aT = t;
    }
    lastT = t;
    if (reduced !== world.reducedMotion) {
      world.reducedMotion = reduced;
      if (reduced) {
        finish(true, t);
        queue.length = 0;
        bDone = true;
      } else {
        mute = t;
      }
    }
    let c = t;
    for (;;) {
      const T = t0 + TICK * nk;
      if (cur && curEnd <= t && curEnd <= T) {
        c = curEnd;
        finish(false, curEnd);
        continue;
      }
      if (!cur && !reduced && queue.length > 0 && reg.anyVisibleFor(CATALOGUE[queue[0]].id)) {
        const i = queue.shift()!;
        begin(i, 'oneShot', snap ? Math.max(c, snap(c)) : c, CATALOGUE[i].lo, 0);
        continue;
      }
      if (T > t) break;
      nk++;
      active += p * (T - aT);
      aT = T;
      if (!cur && !reduced && T >= mute) tick(T, p, g);
    }
  }

  function onFrame(f: Readonly<SignalFrame>): void {
    const l = latent!.get();
    xs[0] = l.energy.value;
    xs[1] = l.tension.value;
    xs[2] = l.focus.value;
    xs[3] = l.curiosity.value;
    advance(f.t, f.presence.p, f.dwell.g, xs, f.env.reducedMotion);
  }

  return {
    world: () => world,
    current: () => cur,
    progress(e, now) {
      const n = now ?? clockNow();
      return clamp((n - e.startAt) / e.duration, 0, 1);
    },
    on(fn) {
      for (let k = 0; k < live.length; k++) fn(live[k]);
      return out.on(fn);
    },
    history: () => hist.slice(),
    shareUrl() {
      const l = typeof location !== 'undefined' ? location.origin + location.pathname : '';
      return l + '?seed=' + world.seedCode;
    },
    now: clockNow,
    views: reg,
    advance,
    setSnap(start, mark = start) {
      snap = start;
      snapMark = mark;
    },
    start() {
      if (offs.length > 0 || !bus || !latent) return;
      bus.setInsideResolver?.((x, y) => {
        for (let k = views.length - 1; k >= 0; k--) {
          const v = views[k];
          const r = v.rect?.();
          if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && v.visible()) return v.id;
        }
        return null;
      });
      latent.start?.();
      offs = [bus.subscribe(onFrame)];
    },
    dispose() {
      for (const off of offs) off();
      offs = [];
      latent?.dispose?.();
      bus?.setInsideResolver?.(null);
      finish(true, lastT);
      out.clear();
      dropSlot('director');
    },
  };
}

function devState(): WorldStateId | undefined {
  if (!import.meta.env.DEV || typeof location === 'undefined') return undefined;
  const s = new URLSearchParams(location.search).get('state');
  return STATES.find((x) => x === s);
}

export function visitSeed(): number {
  return slot('visitSeed', () => {
    const s = typeof location !== 'undefined' ? parseSeedParam(location.search) : null;
    return s ?? randomSeed();
  });
}

export const getDirector = (seed: number): DirectorInternal =>
  slot('director', () => {
    return createDirector({ seed, state: devState(), bus: getBus(), latent: getLatent(seed) });
  });
