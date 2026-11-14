import type { Rng } from '../../core/rng';
import { BPM_RANGE } from '../../core/config';
import { at, normal, u } from '../../core/rng';
import type { Nt } from './melody';
import { Melody, centreFor, onsetsFor } from './melody';
import type { LayerKey, Route, ScoreProfile, StateDef } from './profile';
import type { Chord } from './theory';
import type { Form, BarForm } from './depth/form';
import type { HarmonyPlanner, HarmBar } from './depth/harmony';
import type { Layers as LayerPatterns, Section as LayerSection, BarLayers } from './depth/layers';
import type { LayerId } from './depth/layers';
import {
  G3, Harmony, WEYL, clampN, eu, frac, lerp, lfo, makeChord, midiOf, snapTo, vnoise, voice,
} from './theory';

export interface Ctl {
  eV: number;
  eFast: number;
  eSlow: number;
  eBand: 0 | 1 | 2;
  tV: number;
  tBand: 0 | 1 | 2;
  fV: number;
  qV: number;
  qSlow: number;
  lite: boolean;
  dl: number;
  /** 'range' (default) keeps 98-116 BPM; 'follow' lets activity swing it ±4% (§6.9). */
  tempo?: 'range' | 'follow';
}

export interface Ev {
  t: number;
  v: string;
  m: number;
  d: number;
  g: number;
  l: LayerKey;
  x?: readonly number[];
  inst?: Inst;
  kind?: number;
  f?: number;
  s?: number;
  c?: number;
  p?: number;
  fe?: number;
  at?: number;
  du?: number;
}

export interface Inst {
  id: number;
  voice: string;
  layer: 'harvest' | 'pack' | 'load' | 'station' | 'hats';
  cycle: number;
  k: readonly [number, number, number];
  rate: number;
  g: number;
  t0: number;
  t1: number;
  sched: number;
  seed: number;
  dest?: AudioNode;
  tg: number;
}

export interface Mod {
  op: 'quicken' | 'doubleTime' | 'part' | 'sus' | 'resolve' | 'dis' | 'thin';
  t0: number;
  t1: number;
}

export interface Par {
  arpHz: number;
  padHz: number;
  echoFb: number;
  tilt?: number;
  width?: number;
  send?: number;
}

export interface BarPlan {
  n: number;
  t: number;
  dur: number;
  step: number;
  meter: number;
  bpm: number;
  evs: Ev[];
  par: Par;
  st: number;
  tones: number[];
  root: number;
  pcs: number[];
}

export type BarPlanLike = Pick<BarPlan, 'n' | 't' | 'dur' | 'step' | 'meter' | 'st' | 'tones' | 'root' | 'pcs'>;

const KEYS = ['arp', 'bass', 'hats', 'kick', 'melody'] as const;
type VariationModule = typeof import('./depth/variation');
const arpIndex = (o: number, q: number, len: number, c: number): number => {
  const p = 2 * len - 2 || 1;
  const x = q % p;
  return o === 0 ? q % len : o === 1 ? len - 1 - (q % len) : o === 2 ? (x < len ? x : p - x) : Math.floor(len * frac(q * 0.6180339887 + c * (Math.SQRT2 - 1)));
};

/**
 * Counter streams (first key of u/at, §6.10): 1 LFO phases and rotation offsets, 2 layer mutes,
 * 3 harmonic rate, 4 chord-tone snap, 5 tension bend, 6 jitter, 7 sonar, 8 pad drift, 9 harmony,
 * 10 melody, 11 motif DNA, 12 route fills, 13 ambient fx, 14 drips, 15 pulse-layer seed,
 * 16 skitter, 17 noise restart offsets.
 */

export class Score {
  /** Draws other modules take at frame-dependent moments (route fills). The score itself never reads it. */
  rh: Rng;
  mo: Rng;
  harm: Harmony;
  mel: Melody;
  phases: number[];
  state: string;
  pending: { s: string; after: number } | null = null;
  route: string;
  bpm: number;
  steps = 0;
  phrase = 0;
  chords: Chord[] = [];
  pads: boolean[] = [];
  phr: Nt[] = [];
  band = -1;
  kk = [6, 2, 2, 0];
  rot = [0, 0, 0];
  mute: Record<string, boolean> = {};
  off: number[] = [];
  pivot = false;
  drift = 0;
  driftT = 0;
  voiced: number[] = [];
  rate: 1 | 2 = 1;
  base = -1;
  meters: readonly number[] = [16, 16, 16, 16];
  private form: Form | null = null;
  private planner: HarmonyPlanner | null = null;
  private pendingDepth: { form: Form; planner: HarmonyPlanner } | null = null;
  private barForms: BarForm[] = [];
  private harmBars: HarmBar[] = [];
  private layers: LayerPatterns | null = null;
  private pendingLayers: LayerPatterns | null = null;
  private layerSection: LayerSection | null = null;
  private variation: VariationModule | null = null;
  private pendingVariation: VariationModule | null = null;
  private phraseDuty = 2;
  private phraseSend = 0;

  constructor(public seed: number, private P: ScoreProfile) {
    this.state = P.initial;
    this.route = P.home;
    this.bpm = P.states[P.initial].bpm;
    this.rh = at(seed, 12);
    this.mo = at(seed, 11);
    this.harm = new Harmony(P);
    this.mel = new Melody(this.mo);
    this.phases = [0, 1, 2, 3, 4, 5].map((i) => u(seed, 1, i));
    this.off = [0, 1, 2, 3, 4, 5, 6].map((i) => u(seed, 1, 6 + i));
  }

  attachDepth(form: Form, planner: HarmonyPlanner): void {
    this.pendingDepth = { form, planner };
  }

  attachLayers(layers: LayerPatterns): void {
    this.pendingLayers = layers;
  }

  attachVariation(variation: VariationModule): void {
    this.pendingVariation = variation;
  }

  private varied(id: LayerId, n: number, s: number, lite: boolean, e: Ev): Ev {
    if (!this.variation || !this.layerSection) return e;
    const ix = ['drone', 'pad', 'bass', 'kick', 'arp', 'hats', 'ticks', 'pulse', 'glint', 'melody'].indexOf(id);
    const v = this.variation.micro(this.seed, id, this.layerSection.push[ix] ?? 0, n, s, lite, this.phrase);
    return { ...e, t: e.t + v.dt, g: e.g * Math.pow(10, v.dB / 20), c: v.ct, p: v.pan, fe: v.flt, at: v.att, du: this.phraseDuty };
  }

  private rt(k: string): Route {
    return this.P.routes[k] ?? this.P.routes[this.P.home];
  }

  private sd(): StateDef {
    return this.harm.def;
  }

  setState(s: string, after: number | true = true): void {
    if (after === true) this.apply(s);
    else this.pending = { s, after };
  }

  private apply(s: string): void {
    this.state = s;
    this.harm.use(s);
    this.pending = null;
  }

  setRoute(r: string, nextBar: number): void {
    if (r === this.route) return;
    this.route = r;
    this.pivot = true;
    if (this.form && this.planner) {
      this.form.force(nextBar, 'route');
      const pb = nextBar % 4;
      for (let i = pb; i < 4; i++) {
        const bar = nextBar - pb + i;
        const t = this.lastPhraseT + this.phraseDurations.slice(0, i).reduce((a, b) => a + b, 0);
        this.setDepthBar(i, bar, t);
      }
    } else if (nextBar % 4 !== 0 && this.chords.length === 4) this.planChords(nextBar - (nextBar % 4), nextBar % 4, false);
  }

  private lastPhraseT = 0;
  private phraseDurations: number[] = [];

  private setDepthBar(i: number, n: number, t: number): void {
    if (!this.form || !this.planner) return;
    const bf = this.form.at(n, t, this.state);
    const rt = this.rt(this.route);
    const hb = this.planner.at(n, t, { state: this.state, grav: rt.grav, noCad: rt.noCad });
    this.barForms[i] = bf;
    this.harmBars[i] = hb;
    this.chords[i] = hb.chord;
    this.pads[i] = hb.change;
    KEYS.forEach((k) => (this.mute[k] = !this.form!.has(bf.s, k as 'arp' | 'bass' | 'hats' | 'kick' | 'melody')));
    if (this.layers && (!this.layerSection || this.layerSection.i !== bf.s.i)) {
      const ids = ['drone', 'pad', 'bass', 'kick', 'arp', 'hats', 'ticks', 'pulse', 'glint', 'melody'] as const;
      const pick = ids.filter((_, k) => !!(bf.s.recipe.layers & (1 << k)));
      this.layerSection = this.layers.recipe(bf.s.i, bf.s.n0, bf.s.bars, bf.arc, pick);
    }
  }

  private planChords(n: number, from: number, tMid: boolean): void {
    const rt = this.rt(this.route);
    const rate = from > 0 ? rt.rate : this.rate;
    this.rate = rate;
    for (let i = from; i < 4; i++) {
      const bar = n + i;
      if (bar % rate === 0 || (i === from && this.pivot)) {
        const pv = this.pivot ? this.harm.cur : undefined;
        this.chords[i] = this.harm.next(at(this.seed, 9, bar), Math.floor(bar / rate), 8 / rate, rt.grav, tMid, !!rt.noCad, pv);
        this.pivot = false;
        this.pads[i] = true;
      } else {
        this.chords[i] = this.chords[i - 1];
        this.pads[i] = false;
      }
    }
  }

  private startPhrase(n: number, c: Ctl, t: number): void {
    if (this.pending && t >= this.pending.after) this.apply(this.pending.s);
    if (this.pendingDepth) {
      this.form = this.pendingDepth.form;
      this.planner = this.pendingDepth.planner;
      this.pendingDepth = null;
    }
    if (this.pendingLayers) {
      this.layers = this.pendingLayers;
      this.pendingLayers = null;
      this.layerSection = null;
    }
    if (this.pendingVariation) {
      this.variation = this.pendingVariation;
      this.pendingVariation = null;
    }
    const rt = this.rt(this.route);
    this.phrase = Math.floor(n / 4);
    this.lastPhraseT = t;
    if (this.variation) {
      const pv = this.variation.phraseVar(this.seed, this.phrase, t);
      this.phraseDuty = pv.duty;
      this.phraseSend = pv.send;
    }
    this.meters = this.sd().meters ?? [16, 16, 16, 16];
    if (c.eBand + (c.lite ? 3 : 0) !== this.band) {
      this.band = c.eBand + (c.lite ? 3 : 0);
      this.kk = [lerp(6, 12, c.eSlow), lerp(2, 5, c.eSlow), lerp(2, 8, c.eSlow), c.eBand * 2].map((x) => Math.round(x * (c.lite ? 0.6 : 1)));
    }
    this.rot = [0, 1, 2].map((i) => Math.floor(16 * frac(this.phrase * WEYL[KEYS[i]] + this.off[i])));
    const vn = vnoise(this.seed, n);
    this.chords = [];
    this.pads = [];
    this.harmBars = [];
    this.barForms = [];
    if (this.form && this.planner) {
      this.phraseDurations = [];
      let bt = t;
      for (let i = 0; i < 4; i++) {
        const meter = this.meters[i];
        this.phraseDurations[i] = (60 / this.bpm / 4) * meter;
        this.setDepthBar(i, n + i, bt);
        bt += this.phraseDurations[i];
      }
      this.rate = 1;
    } else {
      KEYS.forEach((k, i) => (this.mute[k] = u(this.seed, 2, n, i) < 0.15 * vn));
      this.rate = u(this.seed, 3, n) < 0.05 + 0.2 * vn ? (rt.rate === 1 ? 2 : 1) : rt.rate;
      this.planChords(n, 0, c.tBand >= 1);
    }
    this.phr = rt.dens === 0 ? [] : this.mel.phrase({
      m: this.harm.m,
      centre: centreFor(this.harm.m, c.eV, c.fV, rt.reg + (this.barForms[0]?.s.recipe.reg ?? 0) * 2, lfo(this.phases, 4, t)),
      onsets: onsetsFor(c.eV, Math.max(0, rt.dens + (this.barForms[0]?.s.recipe.dens ?? 0) * 0.15) * (0.8 + 0.4 * vn)) * (this.mute.melody ? 0.5 : 1),
      lambda: 0.5 + c.qV,
      odd: this.phrase % 2 === 1,
      meters: this.meters,
      chords: this.chords.map((x) => x.pcs),
      tHigh: c.tBand === 2,
    }, at(this.seed, 10, n));
  }

  plan(n: number, t: number, c: Ctl, mods: readonly Mod[]): BarPlan {
    const pb = n % 4;
    if (this.base !== n - pb) {
      this.startPhrase(n - pb, c, t);
      this.base = n - pb;
    }
    const rt = this.rt(this.route);
    const sd = this.sd();
    const meter = this.meters[pb];
    const [lo, hi] = c.tempo === 'follow' ? [0, 999] : BPM_RANGE;
    this.bpm = clampN(this.bpm + clampN(clampN(sd.bpm * (1 + 0.04 * (2 * c.eSlow - 1)), lo, hi) - this.bpm, -1, 1), lo, hi);
    const step = 60 / this.bpm / 4;
    const dur = step * meter;
    const hb = this.harmBars[pb];
    const bf = this.barForms[pb];
    const chord = hb?.chord ?? this.chords[pb];
    if (hb?.change) this.voiced = [...hb.voicing];
    const evs: Ev[] = [];
    const st = this.steps;
    const pattern: BarLayers | null = this.layers && this.layerSection ? this.layers.bar(n, st, meter, this.layerSection) : null;
    const sw = clampN(0.04 + 0.1 * c.qSlow + 0.04 * lfo(this.phases, 5, t), 0, 0.18);
    const ts = (s: number): number => t + s * step + (s % 2 === 1 ? sw * step : 0);
    const M: Partial<Record<Mod['op'], Mod>> = {};
    for (const x of mods) if (t >= x.t0 && t < x.t1) M[x.op] = x;
    const thin = M.thin || sd.thin || rt.sparse;
    const q = M.quicken ? 2 : 0;
    const band = c.eBand;
    const on = (k: string, cond = true): boolean => cond && !thin && !this.mute[k] && rt.gain[k as LayerKey] !== -60;
    const allowedHit = (x: { f?: number }, id: string): boolean => !M.part || (x.f !== 2 && (id !== 'hats' || x.f === 1));
    const hitGain = (x: { f?: number; g: number }): number => M.quicken && x.f === 2 ? 0.8 : x.g;

    if (this.pads[pb] || M.sus || M.resolve || M.dis) {
      const pcs = M.sus || (M.resolve && t < M.resolve.t0 + (M.resolve.t1 - M.resolve.t0) / 2)
        ? makeChord(this.harm.m, chord.deg, 2).pcs.map((x) => x + (bf?.centre ?? 0))
        : chord.pcs;
      if (M.sus || M.resolve || M.dis) this.voiced = voice(this.voiced, pcs.slice(0, 3));
      const notes = this.voiced.slice();
      if (chord.add9) notes.push(G3 + chord.pcs[3] + 12);
      if (chord.sev) notes.push(G3 + chord.pcs[3]);
      if (M.dis) notes.push(this.voiced[2] + 1);
      if (c.lite) notes.length = Math.min(notes.length, 2);
      const dr = sd.drift?.sd ?? 0;
      const decay = Math.exp(-Math.max(1e-3, t - this.driftT) / (sd.drift?.tau ?? 30));
      this.driftT = t;
      this.drift = this.drift * decay + 0.7 * dr * Math.sqrt(1 - decay * decay) * normal(at(this.seed, 8, n));
      const cents = clampN(this.drift, -dr, dr) + (c.tBand === 2 ? 4 : 0);
      const slotBars = hb ? (hb.p.at[hb.slot + 1] ?? hb.p.len) - hb.p.at[hb.slot] : this.rate;
      const padEvent: Ev = { t, v: 'pad', m: 0, d: dur * (M.sus || M.resolve ? 1 : slotBars) + 0.35, g: 1, l: 'pad', x: notes, kind: Math.round(cents * 10) };
      evs.push(pattern ? this.varied('pad', n, 0, c.lite, padEvent) : padEvent);
    }

    const tones = this.voiced.length ? this.voiced.slice(0, 3) : [57, 60, 64];
    const arpNotes = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[0] + 24];
    const root = G3 + chord.pcs[0];
    const bassRoot = root - 12 * Math.ceil((root - 46) / 12);
    const arpOn = on('arp') && (!pattern || pattern.on.includes('arp'));
    const bassOn = on('bass') && (!pattern || pattern.on.includes('bass'));
    const hatsOn = on('hats', band >= 1 || !!rt.hatsOnly || !!M.doubleTime) && (!pattern || pattern.on.includes('hats'));
    const kickOn = on('kick', band >= 1) && (!pattern || pattern.on.includes('kick'));
    const [kA, kB, kH0] = this.kk;
    const kA2 = clampN(kA + q, 1, 14);
    const kB2 = clampN(kB + q, 1, 14);
    const kH = clampN(Math.max(kH0 + q, M.quicken ? 6 : 0) - (M.part ? 2 : 0), 1, 14);
    const gate = rt.half ? 2 : 1;
    const four = this.kk[3] === 4;
    for (let s = 0; s < meter; s++) {
      const ah = pattern?.hits.arp?.filter((x) => Math.floor(x.s) === s) ?? [];
      const bh = pattern?.hits.bass?.filter((x) => Math.floor(x.s) === s && allowedHit(x, 'bass')) ?? [];
      const hh = pattern?.hits.hats?.filter((x) => Math.floor(x.s) === s && allowedHit(x, 'hats')) ?? [];
      const kh = pattern?.hits.kick?.filter((x) => Math.floor(x.s) === s && allowedHit(x, 'kick')) ?? [];
      if (arpOn && (pattern ? ah.length > 0 : s % gate === 0 && eu(kA2, 16, s, this.rot[0]))) {
        for (const x of pattern ? ah : [{ s, g: 1, o: 0, q: s, c: 0, f: 0 as const }]) {
          const notes = pattern ? [arpNotes[arpIndex(x.o, x.q, arpNotes.length, x.c)], ...arpNotes.slice(1)] : arpNotes;
          if (!pattern || allowedHit(x, 'arp')) evs.push(this.varied('arp', n, x.s, c.lite, { t: ts(x.s), v: 'arp', m: 0, d: step * 0.85 * (pattern ? 1 : gate), g: pattern ? hitGain(x) : x.g, l: 'arp', x: notes, s: step }));
        }
      }
      if (bassOn && (pattern ? bh.length > 0 : eu(kB2, 16, s, this.rot[1]))) {
        for (const x of pattern ? bh : [{ s, g: 1 }]) {
          const m = band >= 1 && (s + n) % 4 === 3 ? bassRoot + (s % 8 === 3 ? 7 : 12) : bassRoot;
          evs.push(this.varied('bass', n, x.s, c.lite, { t: ts(x.s), v: band === 2 && !sd.noSaw ? 'bassSaw' : 'bass', m, d: step * 1.6, g: pattern ? hitGain(x) : x.g, l: 'bass' }));
        }
      }
      if (hatsOn && (pattern ? hh.length > 0 : eu(kH, 16, s, this.rot[2]))) {
        for (const x of pattern ? hh : [{ s, g: s % 4 === 2 ? 1 : 0.6, f: 0 as const }]) evs.push(this.varied('hats', n, x.s, c.lite, { t: ts(x.s), v: 'hat', m: 0, d: 0.04, g: pattern ? hitGain(x) : x.g, l: 'hats' }));
      }
      if (hatsOn && M.doubleTime && eu(kH, 16, s + 1, this.rot[2] + 3)) evs.push({ t: ts(s) + step / 2, v: 'hat', m: 0, d: 0.03, g: 0.45, l: 'hats' });
      if (kickOn && (pattern ? kh.length > 0 : four ? s % 4 === 0 : s === 0 || s === 8)) {
        for (const x of pattern ? kh : [{ s, g: s === 0 ? 1 : 0.8 }]) evs.push(this.varied('kick', n, x.s, c.lite, { t: ts(x.s), v: 'kick', m: 0, d: 0.3, g: pattern ? hitGain(x) : x.g, l: 'kick' }));
      }
    }

    if (pattern) {
      const tickVoice = u(this.seed, 19, pattern.sec.i) < 0.5 ? 'droplet' : 'clack';
      for (const x of pattern.hits.ticks ?? []) if (allowedHit(x, 'ticks') && on('ticks') && pattern.on.includes('ticks')) evs.push(this.varied('ticks', n, x.s, c.lite, { t: ts(x.s), v: tickVoice, m: 0, d: 0.08, g: hitGain(x), l: 'ticks' }));
      for (const x of pattern.hits.pulse ?? []) if (allowedHit(x, 'pulse') && on('pulse') && pattern.on.includes('pulse')) evs.push(this.varied('pulse', n, x.s, c.lite, { t: ts(x.s), v: 'station', m: G3 + chord.pcs[0] + 36, d: 0.35, g: hitGain(x) * 0.5, l: 'pulse' }));
      for (const x of pattern.hits.glint ?? []) if (allowedHit(x, 'glint') && on('glint') && pattern.on.includes('glint')) evs.push(this.varied('glint', n, x.s, c.lite, { t: ts(x.s), v: 'bell', m: G3 + chord.pcs[x.q % Math.min(3, chord.pcs.length)] + 24, d: 1.2, g: hitGain(x) * 0.35, l: 'glint' }));
    }

    if (rt.sparse && n % 2 === 0) {
      const r = u(this.seed, 7, n);
      if (r < 0.6) {
        const s = Math.floor(r * 20);
        evs.push(this.varied('melody', n, s, c.lite, { t: ts(s), v: 'sonar', m: 98 + (r < 0.3 ? 0 : 7) + (bf?.centre ?? 0), d: 0.35, g: 0.5, l: 'melody' }));
      }
    }

    if (!this.mute.melody && rt.dens > 0 && !rt.sparse) {
      const m = this.harm.m;
      for (const x of this.phr) {
        const s = x.s % 16;
        if (Math.floor(x.s / 16) !== pb || s >= meter) continue;
        let midi = midiOf(m, x.p) + (bf?.centre ?? 0);
        if ((s === 0 || s === 8) && !chord.pcs.some((y) => (((y + G3 - midi) % 12) + 12) % 12 === 0) && u(this.seed, 4, n, x.s) < 0.8) {
          midi = snapTo(chord.pcs, midi);
        }
        if (c.tBand === 2 && s % 4 === 2 && x.l <= 1 && u(this.seed, 5, n, x.s) < 0.15) midi = midiOf(m, x.p - 1);
        const jit = sd.jitter ? (u(this.seed, 6, n, x.s) - 0.5) * 0.06 * step : 0;
        evs.push(this.varied('melody', n, x.s, c.lite, { t: ts(s) + jit, v: rt.bell ? 'bell' : 'lead', m: midi, d: x.l * step * 0.95, g: 1, l: 'melody', kind: sd.melKind ?? 0 }));
      }
    }

    this.steps += meter;
    const drift = this.variation?.drift(this.seed, t);
    const par: Par = {
      arpHz: 800 * Math.pow(2, 0.5 * lfo(this.phases, 1, t)) * (1 + 0.4 * c.eV),
      padHz: (sd.padMul ?? 1) * (900 + 600 * c.dl) * Math.pow(2, 0.4 * lfo(this.phases, 2, t)),
      echoFb: clampN(0.25 + 0.15 * c.fV + 0.05 * lfo(this.phases, 0, t), 0.2, 0.45),
      ...(drift ? { tilt: drift.tilt, width: drift.width, send: drift.send + this.phraseSend } : {}),
    };
    return { n, t, dur, step, meter, bpm: this.bpm, evs, par, st, tones, root: bassRoot, pcs: chord.pcs };
  }

  pulses(it: Inst, bars: readonly BarPlanLike[], from: number, to: number, c: Ctl, mods: readonly Mod[]): Ev[] {
    const out: Ev[] = [];
    const hl = it.layer === 'hats';
    for (const r of bars) {
      if (r.t >= to || r.t + r.dur <= from) continue;
      const M: Partial<Record<Mod['op'], Mod>> = {};
      for (const x of mods) if (r.t >= x.t0 && r.t < x.t1) M[x.op] = x;
      const sub = it.rate * (M.doubleTime ? 2 : 1);
      const per = it.cycle;
      const k = Math.min(per - 2, Math.round(lerp(it.k[0], it.k[2], c.eSlow)) + (M.quicken ? 2 : 0));
      const rot = Math.floor(per * frac(Math.floor(r.n / 4) * WEYL[it.layer] + it.seed));
      for (let j = 0, n2 = Math.round(r.meter * sub); j < n2; j++) {
        const at = r.t + (j / sub) * r.step;
        const gi = Math.round(r.st * sub) + j;
        if (at < from || at >= to || at < it.t0 || at >= it.t1 || !eu(k, per, gi, rot)) continue;
        const mm = it.layer === 'harvest' ? clampN(r.tones[gi % 3] + 12 * Math.round((70 - r.tones[gi % 3]) / 12), 67, 74)
          : it.layer === 'load' ? r.root - 12 + (gi % 2) * 7
          : it.layer === 'station' ? G3 + r.pcs[(gi % 2) * 2] + 36
          : it.layer === 'pack' || hl ? 0 : r.tones[gi % 3] + 12;
        out.push({ t: at, v: it.voice, m: mm, d: it.layer === 'pack' ? 0.08 : hl ? 0.025 : (r.step * 1.2) / sub, g: 1, l: hl ? 'hats' : 'cuep', inst: it, s: r.step });
      }
    }
    return out;
  }
}
