import type { Ev } from './score';
import type { LayerKey } from './theory';
import { u } from '../../core/rng';
import { hz } from './theory';

export interface Rig {
  c: BaseAudioContext;
  noise: AudioBuffer;
  w12: PeriodicWave;
  w25: PeriodicWave;
  w50: PeriodicWave;
  wd: readonly PeriodicWave[];
  kicks: number[];
  padL: AudioNode;
  padR: AudioNode;
  arpF: AudioNode;
  hatF: AudioNode;
  layer(k: LayerKey): AudioNode;
}

const Z = 0.0001;
type Ctx = BaseAudioContext;
type Voice = (r: Rig, to: AudioNode, e: Ev) => void;

export function pulseWave(c: Ctx, duty: number): PeriodicWave {
  const re = new Float32Array(40);
  for (let k = 1; k < 40; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return c.createPeriodicWave(re, new Float32Array(40));
}

function env(c: Ctx, t: number, peak: number, a: number, end: number, h = 0): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(Z, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, Z * 2), t + a);
  if (h > 0) g.gain.setValueAtTime(peak, t + a + h);
  g.gain.exponentialRampToValueAtTime(Z, end);
  return g;
}

function osc(c: Ctx, w: OscillatorType | PeriodicWave, f: number, t: number, end: number): OscillatorNode {
  const o = c.createOscillator();
  if (typeof w === 'string') o.type = w as OscillatorType;
  else o.setPeriodicWave(w);
  o.frequency.setValueAtTime(f, t);
  o.start(t);
  o.stop(end);
  return o;
}

function nz(r: Rig, t: number, end: number, to: AudioNode, off = (t * 7.3) % 5): void {
  const s = r.c.createBufferSource();
  s.buffer = r.noise;
  s.loop = true;
  s.connect(to);
  s.start(t, off);
  s.stop(end);
}

function filt(c: Ctx, type: BiquadFilterType, f: number, q = 1, t = 0): BiquadFilterNode {
  const b = c.createBiquadFilter();
  b.type = type;
  b.Q.value = q;
  b.frequency.value = f;
  if (t) b.frequency.setValueAtTime(f, t);
  return b;
}

const lead: Voice = (r, to, e) => {
  const end = e.t + e.d + 0.03;
  const w = e.du !== undefined ? r.wd[e.du] : e.kind === 1 ? r.w12 : r.w25;
  const o = osc(r.c, w, hz(e.m), e.t, end);
  const lp = filt(r.c, 'lowpass', 3000 * (e.fe ?? 1));
  o.detune.value = e.c ?? 0;
  o.connect(lp).connect(env(r.c, e.t, 0.13 * e.g, 0.012 * (e.at ?? 1), e.t + e.d, Math.max(0, e.d - 0.08))).connect(to);
  if (e.d > 0.45) {
    const vg = r.c.createGain();
    vg.gain.setValueAtTime(0, e.t + e.d * 0.4);
    vg.gain.linearRampToValueAtTime(18, end);
    osc(r.c, 'sine', 5.4, e.t, end).connect(vg).connect(o.detune);
  }
  if (e.x) {
    const o2 = osc(r.c, w, hz(e.m), e.t, end);
    o.detune.value = e.x[0] + (e.c ?? 0);
    o2.detune.value = -e.x[0] + (e.c ?? 0);
    o2.connect(lp);
  }
};

const arp: Voice = (r, to, e) => {
  const n = e.x ?? [60, 60, 60];
  const o = osc(r.c, e.du !== undefined ? r.wd[e.du] : r.w25, hz(n[0]), e.t, e.t + e.d + 0.02);
  for (let i = 1; i < 3; i++) o.frequency.setValueAtTime(hz(n[i]), e.t + ((e.s ?? 0.13) / 3) * i);
  o.detune.value = e.c ?? 0;
  o.connect(env(r.c, e.t, 0.06 * e.g, 0.004 * (e.at ?? 1), e.t + e.d)).connect(to);
};

const pad: Voice = (r, _to, e) => {
  const cents = (e.kind ?? 0) / 10;
  for (const m of e.x ?? []) {
    for (const [side, d] of [[r.padL, -11 - cents], [r.padR, 11 + cents]] as const) {
      const o = osc(r.c, 'sawtooth', hz(m), e.t, e.t + e.d + 0.05);
      o.detune.value = d;
      o.connect(env(r.c, e.t, 0.03 * e.g, 0.45, e.t + e.d, e.d - 0.8)).connect(side);
    }
  }
};

const tone = (wave: (r: Rig) => OscillatorType | PeriodicWave, peak: number, att: number): Voice => (r, to, e) => {
  osc(r.c, wave(r), e.f ?? hz(e.m), e.t, e.t + e.d + 0.03).connect(env(r.c, e.t, peak * e.g, att * (e.at ?? 1), e.t + e.d)).connect(to);
};

const ring = (decay: number, part: number, glide = 1): Voice => (r, to, e) => {
  const f = e.f ?? hz(e.m);
  for (const [k, a] of [[1, 0.1], [2.76, part]] as const) {
    if (a <= 0) continue;
    const o = osc(r.c, 'sine', f * k, e.t, e.t + decay + 0.1);
    o.frequency.exponentialRampToValueAtTime(f * k * glide, e.t + decay);
    o.connect(env(r.c, e.t, a * e.g, 0.004, e.t + decay)).connect(to);
  }
};

const burst = (hp: number, peak: number): Voice => (r, to, e) => {
  const g = env(r.c, e.t, peak * e.g, 0.002, e.t + e.d + 0.02);
  g.connect(to);
  let src: AudioNode = g;
  if (hp) src = filt(r.c, 'highpass', hp);
  if (hp) src.connect(g);
  nz(r, e.t, e.t + e.d + 0.03, src, (e.t * 7) % 0.5);
};

const bassSaw: Voice = (r, to, e) => {
  const f = hz(e.m);
  const lp = filt(r.c, 'lowpass', 1800, 2.5, e.t);
  lp.frequency.exponentialRampToValueAtTime(f * 3 * (e.fe ?? 1), e.t + 0.2);
  osc(r.c, 'sawtooth', f, e.t, e.t + e.d + 0.03).connect(lp).connect(env(r.c, e.t, 0.16 * e.g, 0.005, e.t + e.d)).connect(to);
};

const kick: Voice = (r, to, e) => {
  const o = osc(r.c, 'sine', 420, e.t, e.t + 0.36);
  o.frequency.exponentialRampToValueAtTime(150, e.t + 0.012);
  o.frequency.exponentialRampToValueAtTime(44, e.t + 0.11);
  o.connect(env(r.c, e.t, 0.5 * e.g, 0.001, e.t + 0.34)).connect(to);
  r.kicks.push(e.t);
  if (r.kicks.length > 8) r.kicks.shift();
};

const stab: Voice = (r, to, e) => {
  const end = e.t + Math.max(0.18, e.d);
  const lp = filt(r.c, 'lowpass', 200, 2, e.t);
  lp.frequency.exponentialRampToValueAtTime(2400, e.t + 0.04);
  lp.frequency.exponentialRampToValueAtTime(600, e.t + 0.18);
  for (const d of [-9, 0, 9]) {
    const o = osc(r.c, 'sawtooth', hz(e.m), e.t, end + 0.04);
    o.detune.value = d;
    o.connect(lp);
  }
  lp.connect(env(r.c, e.t, 0.1 * e.g, 0.006, end)).connect(to);
};

const sub: Voice = (r, to, e) => {
  const [a, h, rel, glide] = e.x ?? [1, 1, 1, 0];
  const f = e.f ?? 36.7;
  const end = e.t + a + h + rel;
  const o = osc(r.c, 'sine', f, e.t, end + 0.05);
  if (glide) o.frequency.exponentialRampToValueAtTime(f * Math.pow(2, glide / 12), end);
  o.connect(env(r.c, e.t, 0.1 * e.g, a, end, h)).connect(to);
};

const sweep = (type: BiquadFilterType, q: number, peak: number, f0: number, f1: number, back: boolean): Voice => (r, to, e) => {
  const [a, b] = e.x ?? [f0, f1];
  const f = filt(r.c, type, a, q, e.t);
  f.frequency.linearRampToValueAtTime(b, e.t + e.d / 2);
  f.frequency.linearRampToValueAtTime(back ? a : b * 1.5, e.t + e.d);
  nz(r, e.t, e.t + e.d + 0.05, f);
  f.connect(env(r.c, e.t, peak * e.g, e.d / 2, e.t + e.d)).connect(to);
};

const glideDown: Voice = (r, to, e) => {
  const f = hz(e.m);
  const o = osc(r.c, r.w25, f, e.t, e.t + e.d + 0.05);
  o.frequency.exponentialRampToValueAtTime(f / 2, e.t + e.d);
  const lp = filt(r.c, 'lowpass', 2000, 1, e.t);
  lp.frequency.exponentialRampToValueAtTime(500, e.t + e.d);
  o.connect(lp).connect(env(r.c, e.t, 0.09 * e.g, 0.4, e.t + e.d, e.d - 1)).connect(to);
};

const rise: Voice = (r, to, e) => {
  const f = hz(e.m);
  const g = env(r.c, e.t, 0.1 * e.g, e.d * 0.9, e.t + e.d);
  const o = osc(r.c, r.w25, f, e.t, e.t + e.d + 0.05);
  o.frequency.exponentialRampToValueAtTime(f * 2, e.t + e.d);
  o.connect(g);
  const bp = filt(r.c, 'bandpass', 600, 1.5, e.t);
  bp.frequency.exponentialRampToValueAtTime(2400, e.t + e.d);
  nz(r, e.t, e.t + e.d + 0.05, bp);
  bp.connect(g);
  g.connect(filt(r.c, 'lowpass', e.x ? e.x[0] : 12000)).connect(to);
};

const cluster: Voice = (r, to, e) => {
  const lp = filt(r.c, 'lowpass', 1800);
  for (let k = 0; k < 4; k++) osc(r.c, 'sine', hz(e.m) * Math.pow(2, (k * 0.3) / 12), e.t, e.t + 1.4).connect(lp);
  lp.connect(env(r.c, e.t, 0.07 * e.g, 0.08, e.t + 1.3, 0.6)).connect(to);
};

const thump = (f0: number, f1: number, lp: number, dur: number, peak: number): Voice => (r, to, e) => {
  const g = env(r.c, e.t, peak * e.g, 0.005, e.t + dur);
  const o = osc(r.c, 'sine', f0, e.t, e.t + dur + 0.1);
  o.frequency.exponentialRampToValueAtTime(f1, e.t + dur * 0.8);
  o.connect(g);
  const f = filt(r.c, 'lowpass', lp);
  nz(r, e.t, e.t + dur, f);
  f.connect(g);
  g.connect(to);
};

const chirp = (w: OscillatorType, f0: number, f1: number, ramp: number, len: number, peak: number): Voice => (r, to, e) => {
  const o = osc(r.c, w, f0, e.t, e.t + len + 0.02);
  o.frequency.exponentialRampToValueAtTime(f1, e.t + ramp);
  o.connect(env(r.c, e.t, peak * e.g, 0.002, e.t + len)).connect(to);
};

const skitter: Voice = (r, to, e) => {
  const hp = filt(r.c, 'highpass', 5000);
  hp.connect(to);
  const step = Math.max(0.01, (e.s ?? 0.13) / 2);
  const tick = burst(0, 0.06);
  for (let t = e.t, k = 0; t < e.t + e.d; t += step, k++) {
    if (u(e.x?.[0] ?? 0, k) < 0.6) tick(r, hp, { ...e, t, d: 0.03 });
  }
};

const ping = ring(0.3, 0, 0.985);

export const VOICES: Readonly<Record<string, Voice>> = {
  lead, arp, pad, bassSaw, kick, stab, sub, glideDown, rise, cluster, skitter, ping, sonar: ping,
  bass: tone(() => 'triangle', 0.22, 0.006),
  pulse12: tone((r) => r.w12, 0.1, 0.004),
  pulse25: tone((r) => r.w25, 0.1, 0.004),
  pulse50: tone((r) => r.w50, 0.1, 0.008),
  clack: chirp('triangle', 330, 110, 0.07, 0.08, 0.1),
  droplet: chirp('sine', 650, 1800, 0.04, 0.07, 0.08),
  bell: ring(1.2, 0.035),
  station: ring(0.35, 0.03),
  hat: burst(0, 0.1),
  tick: burst(6000, 0.1),
  noiseSwell: sweep('bandpass', 3, 0.1, 300, 900, true),
  swoosh: sweep('highpass', 1, 0.12, 2000, 6000, false),
  boom: thump(45, 30, 180, 1.2, 0.1),
  impact: thump(55, 35, 220, 0.32, 0.1),
};

export function dest(r: Rig, e: Ev): AudioNode {
  return e.v === 'arp' ? r.arpF : e.v === 'hat' ? r.hatF : r.layer(e.l);
}
