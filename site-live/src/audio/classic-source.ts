import type { BeatInfo, ExternalSource, Treatment } from '@kolto/adaptive-music';
import { STEP, blip, pulse, setOutput, startMusic, stopMusic } from '../lib/audio';
import { BPM, STEPS_PER_BAR } from '../lib/song';

type Mode = 'light' | 'none';

interface Chain {
  ctx: AudioContext;
  out: AudioNode;
  lite: boolean;
  inp: GainNode;
  lo: BiquadFilterNode;
  hi: BiquadFilterNode;
  wa: GainNode[];
  wb: GainNode[];
  send: GainNode | null;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lin = (db: number): number => Math.pow(10, db / 20);

function shelf(c: AudioContext, type: BiquadFilterType): BiquadFilterNode {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = 1000;
  f.gain.value = 0;
  return f;
}

function room(c: AudioContext): AudioBuffer {
  const sr = c.sampleRate;
  const pre = Math.floor(sr * 0.012);
  const b = c.createBuffer(2, Math.floor(sr * 1.6), sr);
  let s = 0x2f6b9a1d;
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = pre; i < d.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[i] = (s / 2147483648 - 1) * Math.exp(-(i - pre) / sr / 0.35);
    }
  }
  return b;
}

function build(c: AudioContext, out: AudioNode, lite: boolean): Chain {
  const inp = c.createGain();
  const lo = shelf(c, 'lowshelf');
  const hi = shelf(c, 'highshelf');
  inp.connect(lo).connect(hi);
  const ch: Chain = { ctx: c, out, lite, inp, lo, hi, wa: [], wb: [], send: null };
  if (lite) {
    hi.connect(out);
    return ch;
  }
  const split = c.createChannelSplitter(2);
  const merge = c.createChannelMerger(2);
  hi.connect(split);
  for (let i = 0; i < 2; i++) {
    const a = c.createGain();
    const b = c.createGain();
    split.connect(a, i).connect(merge, 0, i);
    split.connect(b, i).connect(merge, 0, 1 - i);
    ch.wa.push(a);
    ch.wb.push(b);
  }
  merge.connect(out);
  const send = (ch.send = c.createGain());
  const cv = c.createConvolver();
  cv.buffer = room(c);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2500;
  merge.connect(send).connect(cv).connect(lp).connect(out);
  return ch;
}

function createClassicSource(): ExternalSource {
  let mode: Mode = 'light';
  let io: { ctx: AudioContext; out: AudioNode } | null = null;
  let chain: Chain | null = null;
  let lite = false;
  let t0 = -1;
  const p = { tilt: 0, width: 1, send: -30, level: 0 };

  const apply = (ch: Chain, now: number, tau: number): void => {
    const set = (a: AudioParam, v: number): void => {
      if (tau > 0) a.setTargetAtTime(v, now, tau);
      else a.setValueAtTime(v, now);
    };
    set(ch.lo.gain, -p.tilt / 2);
    set(ch.hi.gain, p.tilt / 2);
    for (const g of ch.wa) set(g.gain, (1 + p.width) / 2);
    for (const g of ch.wb) set(g.gain, (1 - p.width) / 2);
    if (ch.send) set(ch.send.gain, lin(p.send));
    ch.inp.gain.setTargetAtTime(lin(p.level), now, tau > 0 ? 8 : 0.001);
  };

  const target = (io: { ctx: AudioContext; out: AudioNode }): AudioNode => {
    if (mode === 'none') return io.out;
    if (!chain || chain.ctx !== io.ctx || chain.out !== io.out || chain.lite !== lite) {
      chain = build(io.ctx, io.out, lite);
      apply(chain, io.ctx.currentTime, 0);
    }
    return chain.inp;
  };

  return {
    start(a) {
      io = { ctx: a.ctx, out: a.out };
      if (a.treatment) mode = a.treatment;
      lite = !!a.lite;
      t0 = startMusic({ ctx: a.ctx, out: target(io), at: a.at });
    },
    stop(at, fade) {
      stopMusic(at, fade);
    },
    pulse: () => pulse(),
    blip,
    beat(t): BeatInfo | null {
      if (t0 < 0 || t < t0) return null;
      const s = (t - t0) / STEP;
      const bar = Math.floor(s / STEPS_PER_BAR);
      const k = (s - bar * STEPS_PER_BAR) / 4;
      return { bar, beat: Math.floor(k), phase: k - Math.floor(k), bpm: BPM, meter: STEPS_PER_BAR, nextDownbeat: t0 + (bar + 1) * STEPS_PER_BAR * STEP };
    },
    pitch: { centre: 67, scale: [0, 2, 3, 5, 7, 8, 10] },
    treat(t: Treatment) {
      p.tilt = clamp(t.tilt ?? p.tilt, -2, 2);
      p.width = clamp(t.width ?? p.width, 0.8, 1.1);
      p.send = clamp(t.send ?? p.send, -30, -18);
      p.level = clamp(t.level ?? p.level, -1.5, 1.5);
      if (t.mode && t.mode !== mode) {
        mode = t.mode;
        if (io) setOutput(target(io));
      }
      if (chain && io && mode === 'light') apply(chain, io.ctx.currentTime, 0.05);
    },
  };
}

export const classicSource = createClassicSource();
