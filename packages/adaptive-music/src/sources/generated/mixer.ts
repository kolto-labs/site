import type { Rng } from '../../core/rng';
import type { LayerKey, ScoreProfile } from './profile';
import type { Par } from './score';
import { LAYERS, clampN, db, hz } from './theory';
import type { Rig } from './voices';
import { pulseWave } from './voices';

export const BASE_DB: Readonly<Record<LayerKey, number>> = {
  drone: -14.5, pad: 7.5, arp: 14.8, bass: 9, hats: 8, kick: 0, ticks: -4, pulse: -14, glint: -16, melody: -1, cuep: 0, cuefx: 0,
};

export interface Shared {
  c: AudioContext;
  noise: AudioBuffer;
  w12: PeriodicWave;
  w25: PeriodicWave;
  w50: PeriodicWave;
  ir: AudioBuffer | null;
  masterHP: BiquadFilterNode;
  ui: GainNode;
}

const gain = (c: BaseAudioContext, v: number): GainNode => {
  const g = c.createGain();
  g.gain.value = v;
  return g;
};

const filt = (c: BaseAudioContext, type: BiquadFilterType, f: number, q = 1): BiquadFilterNode => {
  const b = c.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
};

const pan = (c: BaseAudioContext, v: number): StereoPannerNode => {
  const p = c.createStereoPanner();
  p.pan.value = v;
  return p;
};

const osc = (c: BaseAudioContext, type: OscillatorType, f: number): OscillatorNode => {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = f;
  return o;
};
const WAVE_DUTY = [0.125, 0.1875, 0.25, 0.3125, 0.375] as const;

export interface Nz {
  s: AudioBufferSourceNode;
  g: GainNode;
  t: number;
}

const XF = 0.05;
const FADE = [0, 1].map((k) => Float32Array.from({ length: 16 }, (_, i) => Math.sin((Math.PI / 2) * (k ? 1 - i / 15 : i / 15))));

/** Starts the noise again at `off` seconds into the buffer, with a 50 ms equal-power crossfade from `prev` (W6). */
export function renoise(c: BaseAudioContext, buf: AudioBuffer, to: AudioNode, prev: Nz | null, t: number, off: number): Nz {
  t = Math.max(t, c.currentTime);
  // a restart inside the previous fade-in would overlap its curve (setValueCurveAtTime throws): keep the running one
  if (prev && t < prev.t + XF + 0.01) return prev;
  const g = c.createGain();
  g.gain.value = 0;
  g.gain.setValueCurveAtTime(FADE[0], t, XF);
  const s = c.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.connect(g).connect(to);
  s.start(t, off);
  if (prev) {
    prev.g.gain.cancelScheduledValues(t);
    prev.g.gain.setValueCurveAtTime(FADE[1], t, XF);
    prev.s.stop(t + XF + 0.01);
  }
  return { s, g, t };
}

export function makeShared(c: AudioContext, rng: Rng, masterHP: BiquadFilterNode, ui: GainNode): Shared {
  // 6 s, not 1 s: beds restart at a new offset every bar, and one-shots never loop inside a cycle you can hear (W6)
  const noise = c.createBuffer(1, c.sampleRate * 6, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rng() * 2 - 1;
  return { c, noise, w12: pulseWave(c, 0.125), w25: pulseWave(c, 0.25), w50: pulseWave(c, 0.5), ir: null, masterHP, ui };
}

function makeIR(c: AudioContext, rng: Rng): AudioBuffer {
  const sr = c.sampleRate;
  const pre = Math.floor(sr * 0.012);
  const b = c.createBuffer(2, Math.floor(sr * 1.6), sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = pre; i < d.length; i++) d[i] = (rng() * 2 - 1) * Math.exp(-(i - pre) / sr / 0.35);
  }
  return b;
}

export class Mixer implements Rig {
  c: AudioContext;
  noise: AudioBuffer;
  w12: PeriodicWave;
  w25: PeriodicWave;
  w50: PeriodicWave;
  wd: readonly PeriodicWave[];
  kicks: number[] = [];
  music: GainNode;
  stateLP: BiquadFilterNode;
  tiltLo: BiquadFilterNode;
  tiltHi: BiquadFilterNode;
  wet: GainNode | null = null;
  lay = {} as Record<LayerKey, { a: GainNode; b: GainNode; c: GainNode }>;
  padL: StereoPannerNode;
  padR: StereoPannerNode;
  padF: BiquadFilterNode;
  arpF: BiquadFilterNode;
  hatF: BiquadFilterNode;
  dl: DelayNode;
  dr: DelayNode;
  fb: GainNode[];
  droneLP: BiquadFilterNode;
  tremDepth: GainNode;
  srcs: AudioScheduledSourceNode[];
  nIn: AudioNode;
  nz: Nz;
  gone = false;

  constructor(s: Shared, rng: Rng, lite: boolean, private P: ScoreProfile) {
    const c = (this.c = s.c);
    this.noise = s.noise;
    this.w12 = s.w12;
    this.w25 = s.w25;
    this.w50 = s.w50;
    this.wd = WAVE_DUTY.map((d) => pulseWave(c, d));
    this.music = gain(c, 0);
    this.stateLP = filt(c, 'lowpass', 2400);
    this.tiltLo = filt(c, 'lowshelf', 200);
    this.tiltHi = filt(c, 'highshelf', 3000);
    const sum = c.createGain();
    sum.connect(this.stateLP).connect(this.tiltLo).connect(this.tiltHi).connect(this.music).connect(s.masterHP);
    for (const k of LAYERS) {
      const a = gain(c, db(BASE_DB[k] + (this.rt(P.home).gain[k] ?? 0)));
      const b = c.createGain();
      const cc = c.createGain();
      a.connect(b).connect(cc).connect(k === 'hats' ? this.music : sum);
      this.lay[k] = { a, b, c: cc };
    }
    const echo = gain(c, 0.3);
    this.dl = c.createDelay(1);
    this.dr = c.createDelay(1);
    this.fb = [gain(c, 0.35), gain(c, 0.35)];
    const merge = c.createChannelMerger(2);
    echo.connect(filt(c, 'lowpass', 2600)).connect(this.dl);
    this.dl.connect(merge, 0, 0);
    this.dr.connect(merge, 0, 1);
    this.dl.connect(this.fb[0]).connect(this.dr);
    this.dr.connect(this.fb[1]).connect(this.dl);
    merge.connect(sum);
    this.lay.melody.c.connect(echo);

    if (!lite) {
      const wet = (this.wet = gain(c, db(-14)));
      const cv = c.createConvolver();
      cv.buffer = s.ir ??= makeIR(c, rng);
      wet.connect(cv).connect(filt(c, 'lowpass', 2500)).connect(sum);
      this.lay.pad.c.connect(wet);
      this.lay.melody.c.connect(wet);
    }

    this.padF = filt(c, 'lowpass', 1100);
    this.padF.connect(this.lay.pad.a);
    this.padL = pan(c, -0.6);
    this.padR = pan(c, 0.6);
    this.padL.connect(this.padF);
    this.padR.connect(this.padF);
    this.arpF = filt(c, 'lowpass', 800, 6);
    this.arpF.connect(pan(c, -0.3)).connect(this.lay.arp.a);
    this.hatF = filt(c, 'highpass', 7500);
    this.hatF.connect(pan(c, 0.25)).connect(this.lay.hats.a);

    this.droneLP = filt(c, 'lowpass', 600);
    const trem = gain(c, 1);
    this.droneLP.connect(trem).connect(this.lay.drone.a);
    const dg = gain(c, 0.2);
    dg.connect(this.droneLP);
    const o1 = osc(c, 'sine', hz(31));
    const o2 = osc(c, 'triangle', hz(43));
    o1.connect(dg);
    o2.connect(gain(c, db(-12))).connect(dg);
    this.nIn = filt(c, 'bandpass', 240, 0.8);
    this.nIn.connect(gain(c, db(-24))).connect(dg);
    this.nz = renoise(c, s.noise, this.nIn, null, c.currentTime, 0);
    const lfo = osc(c, 'sine', 0.3);
    this.tremDepth = gain(c, 0);
    lfo.connect(this.tremDepth).connect(trem.gain);
    this.srcs = [o1, o2, lfo];
    for (const n of this.srcs) n.start();
  }

  layer(k: LayerKey): AudioNode {
    return this.lay[k].a;
  }

  private rt(k: string) {
    return this.P.routes[k] ?? this.P.routes[this.P.home];
  }

  setRoute(route: string, t: number, tau: number): void {
    const rt = this.rt(route);
    const r = rt.gain;
    for (const k of LAYERS) {
      this.lay[k].a.gain.setTargetAtTime(db(BASE_DB[k] + (k === 'drone' ? (rt.droneDb ?? 0) : (r[k] ?? 0))), t, tau);
    }
  }

  applyPar(p: Par, t: number, step: number): void {
    this.arpF.frequency.setTargetAtTime(clampN(p.arpHz, 200, 6000), t, 0.3);
    this.padF.frequency.setTargetAtTime(clampN(p.padHz, 300, 3000), t, 0.5);
    for (const g of this.fb) g.gain.setTargetAtTime(p.echoFb, t, 0.3);
    for (const d of [this.dl, this.dr]) d.delayTime.setTargetAtTime(step * 3, t, 0.2);
    this.tiltLo.gain.setTargetAtTime(-(p.tilt ?? 0), t, 4);
    this.tiltHi.gain.setTargetAtTime(p.tilt ?? 0, t, 4);
    const width = clampN(0.6 + (p.width ?? 0), 0.3, 0.9);
    this.padL.pan.setTargetAtTime(-width, t, 6);
    this.padR.pan.setTargetAtTime(width, t, 6);
    this.wet?.gain.setTargetAtTime(db(-14 + (p.send ?? 0)), t, 3);
  }

  noiseBar(t: number, off: number): void {
    if (!this.gone) this.nz = renoise(this.c, this.noise, this.nIn, this.nz, t, off);
  }

  pulse(now: number): number {
    let v = 0;
    for (const k of this.kicks) if (k <= now) v = Math.max(v, Math.exp(-(now - k) * 7));
    return v;
  }

  duck(v: number, tau: number): void {
    const g = this.music.gain;
    const t = this.c.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(v, t, tau);
  }

  retire(t: number, fade = 0.3): void {
    if (this.gone) return;
    this.gone = true;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setValueAtTime(this.music.gain.value, t);
    this.music.gain.linearRampToValueAtTime(0, t + fade);
    this.srcs[0].onended = () => this.music.disconnect();
    for (const n of [...this.srcs, this.nz.s]) n.stop(t + fade);
  }
}
