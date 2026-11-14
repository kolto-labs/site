import type { Rng } from '../../core/rng';
import type { LayerKey, ScoreProfile } from './profile';
import type { Par } from './score';
import { LAYERS, clampN, db, hz } from './theory';
import type { Rig } from './voices';
import { pulseWave } from './voices';

export const BASE_DB: Readonly<Record<LayerKey, number>> = {
  drone: -14.5, pad: 7.5, arp: 14.8, bass: 9, hats: 8, kick: 0, melody: -1, cuep: 0, cuefx: 0,
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

export function makeShared(c: AudioContext, rng: Rng, masterHP: BiquadFilterNode, ui: GainNode): Shared {
  const noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
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
  kicks: number[] = [];
  music: GainNode;
  stateLP: BiquadFilterNode;
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
  gone = false;

  constructor(s: Shared, rng: Rng, lite: boolean, private P: ScoreProfile) {
    const c = (this.c = s.c);
    this.noise = s.noise;
    this.w12 = s.w12;
    this.w25 = s.w25;
    this.w50 = s.w50;
    this.music = gain(c, 0);
    this.stateLP = filt(c, 'lowpass', 2400);
    const sum = c.createGain();
    sum.connect(this.stateLP).connect(this.music).connect(s.masterHP);
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
      const wet = gain(c, db(-14));
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
    const nb = c.createBufferSource();
    nb.buffer = s.noise;
    nb.loop = true;
    nb.connect(filt(c, 'bandpass', 240, 0.8)).connect(gain(c, db(-24))).connect(dg);
    const lfo = osc(c, 'sine', 0.3);
    this.tremDepth = gain(c, 0);
    lfo.connect(this.tremDepth).connect(trem.gain);
    this.srcs = [o1, o2, nb, lfo];
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

  retire(t: number): void {
    if (this.gone) return;
    this.gone = true;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(0, t, 0.02);
    this.srcs[0].onended = () => this.music.disconnect();
    for (const n of this.srcs) n.stop(t + 0.9);
  }
}
