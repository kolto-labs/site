import type { Rng } from '../../core/rng';
import { createStreams, normal } from '../../core/rng';
import type { Nt } from './melody';
import { Melody, centreFor, onsetsFor } from './melody';
import type { LayerKey, Route, ScoreProfile, StateDef } from './profile';
import type { Chord } from './theory';
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

export class Score {
  rh: Rng;
  me: Rng;
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

  constructor(public seed: number, private P: ScoreProfile) {
    this.state = P.initial;
    this.route = P.home;
    this.bpm = P.states[P.initial].bpm;
    const s = createStreams(seed);
    this.rh = s.rhythm;
    this.me = s.melody;
    this.mo = s.motif;
    this.harm = new Harmony(s.harmony, P);
    this.mel = new Melody(this.me, this.mo);
    this.phases = [0, 1, 2, 3, 4, 5].map(() => this.rh());
    this.off = [0, 1, 2, 3, 4, 5, 6].map(() => this.rh());
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
    if (nextBar % 4 !== 0 && this.chords.length === 4) this.planChords(nextBar - (nextBar % 4), nextBar % 4, false);
  }

  private planChords(n: number, from: number, tMid: boolean): void {
    const rt = this.rt(this.route);
    const rate = from > 0 ? rt.rate : this.rate;
    this.rate = rate;
    for (let i = from; i < 4; i++) {
      const bar = n + i;
      if (bar % rate === 0 || (i === from && this.pivot)) {
        const pv = this.pivot ? this.harm.cur : undefined;
        this.chords[i] = this.harm.next(Math.floor(bar / rate), 8 / rate, rt.grav, tMid, !!rt.noCad, pv);
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
    const rt = this.rt(this.route);
    this.phrase = Math.floor(n / 4);
    this.meters = this.sd().meters ?? [16, 16, 16, 16];
    if (c.eBand + (c.lite ? 3 : 0) !== this.band) {
      this.band = c.eBand + (c.lite ? 3 : 0);
      this.kk = [lerp(6, 12, c.eSlow), lerp(2, 5, c.eSlow), lerp(2, 8, c.eSlow), c.eBand * 2].map((x) => Math.round(x * (c.lite ? 0.6 : 1)));
    }
    this.rot = [0, 1, 2].map((i) => Math.floor(16 * frac(this.phrase * WEYL[KEYS[i]] + this.off[i])));
    const vn = vnoise(this.seed, n);
    for (const k of KEYS) this.mute[k] = this.rh() < 0.15 * vn;
    this.rate = this.rh() < 0.05 + 0.2 * vn ? (rt.rate === 1 ? 2 : 1) : rt.rate;
    this.chords = [];
    this.planChords(n, 0, c.tBand >= 1);
    this.phr = rt.dens === 0 ? [] : this.mel.phrase({
      m: this.harm.m,
      centre: centreFor(this.harm.m, c.eV, c.fV, rt.reg, lfo(this.phases, 4, t)),
      onsets: onsetsFor(c.eV, rt.dens * (0.8 + 0.4 * vn)) * (this.mute.melody ? 0.5 : 1),
      lambda: 0.5 + c.qV,
      odd: this.phrase % 2 === 1,
      meters: this.meters,
      chords: this.chords.map((x) => x.pcs),
      tHigh: c.tBand === 2,
    });
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
    this.bpm += clampN(sd.bpm * (1 + 0.04 * (2 * c.eSlow - 1)) - this.bpm, -1, 1);
    const step = 60 / this.bpm / 4;
    const dur = step * meter;
    const chord = this.chords[pb];
    const evs: Ev[] = [];
    const sw = clampN(0.04 + 0.1 * c.qSlow + 0.04 * lfo(this.phases, 5, t), 0, 0.18);
    const ts = (s: number): number => t + s * step + (s % 2 === 1 ? sw * step : 0);
    const M: Partial<Record<Mod['op'], Mod>> = {};
    for (const x of mods) if (t >= x.t0 && t < x.t1) M[x.op] = x;
    const thin = M.thin || sd.thin || rt.sparse;
    const q = M.quicken ? 2 : 0;
    const band = c.eBand;
    const on = (k: string, cond = true): boolean => cond && !thin && !this.mute[k] && rt.gain[k as LayerKey] !== -60;

    if (this.pads[pb] || M.sus || M.resolve || M.dis) {
      const pcs = M.sus || (M.resolve && t < M.resolve.t0 + (M.resolve.t1 - M.resolve.t0) / 2) ? makeChord(this.harm.m, chord.deg, 2).pcs : chord.pcs;
      this.voiced = voice(this.voiced, pcs.slice(0, 3));
      const notes = this.voiced.slice();
      if (chord.add9) notes.push(G3 + chord.pcs[3] + 12);
      if (chord.sev) notes.push(G3 + chord.pcs[3]);
      if (M.dis) notes.push(this.voiced[2] + 1);
      if (c.lite) notes.length = Math.min(notes.length, 2);
      const dr = sd.drift?.sd ?? 0;
      const decay = Math.exp(-Math.max(1e-3, t - this.driftT) / (sd.drift?.tau ?? 30));
      this.driftT = t;
      this.drift = this.drift * decay + 0.7 * dr * Math.sqrt(1 - decay * decay) * normal(this.me);
      const cents = clampN(this.drift, -dr, dr) + (c.tBand === 2 ? 4 : 0);
      evs.push({ t, v: 'pad', m: 0, d: dur * (M.sus || M.resolve ? 1 : this.rate) + 0.35, g: 1, l: 'pad', x: notes, kind: Math.round(cents * 10) });
    }

    const tones = this.voiced.length ? this.voiced.slice(0, 3) : [57, 60, 64];
    const arpNotes = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[0] + 24];
    const root = G3 + chord.pcs[0];
    const bassRoot = root - 12 * Math.ceil((root - 46) / 12);
    const arpOn = on('arp');
    const bassOn = on('bass');
    const hatsOn = on('hats', band >= 1 || !!rt.hatsOnly || !!M.doubleTime);
    const kickOn = on('kick', band >= 1);
    const [kA, kB, kH0] = this.kk;
    const kA2 = clampN(kA + q, 1, 14);
    const kB2 = clampN(kB + q, 1, 14);
    const kH = clampN(Math.max(kH0 + q, M.quicken ? 6 : 0) - (M.part ? 2 : 0), 1, 14);
    const gate = rt.half ? 2 : 1;
    const four = this.kk[3] === 4;
    for (let s = 0; s < meter; s++) {
      if (arpOn && s % gate === 0 && eu(kA2, 16, s, this.rot[0])) {
        evs.push({ t: ts(s), v: 'arp', m: 0, d: step * 0.85 * gate, g: 1, l: 'arp', x: arpNotes, s: step });
      }
      if (bassOn && eu(kB2, 16, s, this.rot[1])) {
        const m = band >= 1 && (s + n) % 4 === 3 ? bassRoot + (s % 8 === 3 ? 7 : 12) : bassRoot;
        evs.push({ t: ts(s), v: band === 2 && !sd.noSaw ? 'bassSaw' : 'bass', m, d: step * 1.6, g: 1, l: 'bass' });
      }
      if (hatsOn && eu(kH, 16, s, this.rot[2])) evs.push({ t: ts(s), v: 'hat', m: 0, d: 0.04, g: s % 4 === 2 ? 1 : 0.6, l: 'hats' });
      if (hatsOn && M.doubleTime && eu(kH, 16, s + 1, this.rot[2] + 3)) evs.push({ t: ts(s) + step / 2, v: 'hat', m: 0, d: 0.03, g: 0.45, l: 'hats' });
      if (kickOn && (four ? s % 4 === 0 : s === 0 || s === 8)) evs.push({ t: ts(s), v: 'kick', m: 0, d: 0.3, g: s === 0 ? 1 : 0.8, l: 'kick' });
    }

    if (rt.sparse && n % 2 === 0) {
      const u = this.rh();
      if (u < 0.6) evs.push({ t: ts(Math.floor(u * 20)), v: 'sonar', m: 98 + (u < 0.3 ? 0 : 7), d: 0.35, g: 0.5, l: 'melody' });
    }

    if (!this.mute.melody && rt.dens > 0 && !rt.sparse) {
      const m = this.harm.m;
      for (const x of this.phr) {
        const s = x.s % 16;
        if (Math.floor(x.s / 16) !== pb || s >= meter) continue;
        let midi = midiOf(m, x.p);
        if ((s === 0 || s === 8) && !chord.pcs.some((y) => (((y + G3 - midi) % 12) + 12) % 12 === 0) && this.me() < 0.8) {
          midi = snapTo(chord.pcs, midi);
        }
        if (c.tBand === 2 && s % 4 === 2 && x.l <= 1 && this.me() < 0.15) midi = midiOf(m, x.p - 1);
        const jit = sd.jitter ? (this.me() - 0.5) * 0.06 * step : 0;
        evs.push({ t: ts(s) + jit, v: rt.bell ? 'bell' : 'lead', m: midi, d: x.l * step * 0.95, g: 1, l: 'melody', kind: sd.melKind ?? 0 });
      }
    }

    const st = this.steps;
    this.steps += meter;
    const par: Par = {
      arpHz: 800 * Math.pow(2, 0.5 * lfo(this.phases, 1, t)) * (1 + 0.4 * c.eV),
      padHz: (sd.padMul ?? 1) * (900 + 600 * c.dl) * Math.pow(2, 0.4 * lfo(this.phases, 2, t)),
      echoFb: clampN(0.25 + 0.15 * c.fV + 0.05 * lfo(this.phases, 0, t), 0.2, 0.45),
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
