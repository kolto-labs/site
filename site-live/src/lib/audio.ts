/**
 * Procedural music + UI sounds, pure WebAudio. No samples, no modules, nothing
 * fetched. Loaded on demand the first time someone turns sound on.
 *
 * The track is an original 2000s keygen/cracktro-style tune (song data in
 * song.ts): G minor at 132 BPM, borrowing Star Wars/KotOR colour (i-bVI-bVII-i,
 * minor iv, rising-fourth fanfares) with a heroic lift to the relative B-flat
 * major. 64 bars, about 1:56:
 *   intro 8 (filter opens, drums build) / A 16 (G minor) / B 16 (B-flat major)
 *   / breakdown 8 / A' 16 (doubled lead), then it loops back to A.
 * Voices: detuned saw + PWM lead with ping-pong echo, tick-rate chord arpeggio
 * through a resonant sweeping low-pass, squelchy saw bass, soft pad, synthetic
 * kick, noise snare, offbeat hats.
 *
 * UI sounds suit the underwater theme: a droplet tick and a two-note sonar ping.
 */
import { BARS, BPM, H, R, STEPS_PER_BAR, songBar, type Bar } from './song';

export const STEP = 60 / BPM / 4; // 16th note
const BAR = STEP * STEPS_PER_BAR;
const MUSIC_LEVEL = 0.3;
const LOOKAHEAD = 0.2;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let pulse25: PeriodicWave | null = null;
let pulse50: PeriodicWave | null = null;
let timer: number | null = null;
let suspendTimer: number | null = null;
let nextTime = 0;
let step = 0;
let playing = false;
const kicks: number[] = [];

/** Music graph for one play-through; per-note sources plug into these buses. */
interface Buses {
  music: GainNode; // fade in/out
  out: AudioNode; // last node before master
  feedback: AudioNode[]; // echo loop, broken when the bus is retired
  lead: GainNode;
  arpFilter: BiquadFilterNode;
  padL: StereoPannerNode;
  padR: StereoPannerNode;
  drums: GainNode;
  snare: BiquadFilterNode;
  hats: BiquadFilterNode;
}
let bus: Buses | null = null;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function pulseWave(c: AudioContext, duty: number): PeriodicWave {
  const n = 48;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return c.createPeriodicWave(real, imag);
}

function ensureCtx(): AudioContext {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const c = (ctx = new AC());
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 6;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  master = c.createGain();
  master.gain.value = 0.9;
  master.connect(comp).connect(c.destination);
  noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  pulse25 = pulseWave(c, 0.25);
  pulse50 = pulseWave(c, 0.5);
  return c;
}

function createBuses(c: AudioContext): Buses {
  const music = c.createGain();
  music.gain.value = 0;
  // subsonic filter: keep inaudible energy below the kick out of the compressor
  const out = c.createBiquadFilter();
  out.type = 'highpass';
  out.frequency.value = 32;
  music.connect(out).connect(master!);

  // lead: dry plus a dotted-8th ping-pong echo, darkened in the loop
  const lead = c.createGain();
  lead.connect(music);
  const send = c.createGain();
  send.gain.value = 0.32;
  const tone = c.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2600;
  const dl = c.createDelay(1);
  const dr = c.createDelay(1);
  dl.delayTime.value = dr.delayTime.value = STEP * 3;
  const fbl = c.createGain();
  const fbr = c.createGain();
  fbl.gain.value = fbr.gain.value = 0.42;
  const merge = c.createChannelMerger(2);
  lead.connect(send).connect(tone).connect(dl);
  dl.connect(merge, 0, 0);
  dr.connect(merge, 0, 1);
  dl.connect(fbl).connect(dr);
  dr.connect(fbr).connect(dl);
  merge.connect(music);

  const arpFilter = c.createBiquadFilter();
  arpFilter.type = 'lowpass';
  arpFilter.Q.value = 6;
  arpFilter.frequency.value = 800;
  const arpPan = c.createStereoPanner();
  arpPan.pan.value = -0.3;
  arpFilter.connect(arpPan).connect(music);

  const padFilter = c.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 1100;
  padFilter.connect(music);
  const padL = c.createStereoPanner();
  const padR = c.createStereoPanner();
  padL.pan.value = -0.6;
  padR.pan.value = 0.6;
  padL.connect(padFilter);
  padR.connect(padFilter);

  const drums = c.createGain();
  drums.connect(music);
  const snare = c.createBiquadFilter();
  snare.type = 'bandpass';
  snare.frequency.value = 1900;
  snare.Q.value = 0.8;
  snare.connect(drums);
  const hats = c.createBiquadFilter();
  hats.type = 'highpass';
  hats.frequency.value = 7500;
  const hatPan = c.createStereoPanner();
  hatPan.pan.value = 0.25;
  hats.connect(hatPan).connect(drums);

  return { music, out, feedback: [fbl, fbr], lead, arpFilter, padL, padR, drums, snare, hats };
}

function env(c: AudioContext, t: number, peak: number, attack: number, end: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  return g;
}

/** Detuned saw + PWM pulse (saw minus a delayed copy of itself), filtered, with late vibrato. */
function leadNote(c: AudioContext, bs: Buses, midi: number, t: number, dur: number, gain: number) {
  const f = mtof(midi);
  const end = t + dur;
  const o1 = c.createOscillator();
  const o2 = c.createOscillator();
  o1.type = o2.type = 'sawtooth';
  o1.frequency.value = o2.frequency.value = f;
  o1.detune.value = 8;
  o2.detune.value = -8;

  const dly = c.createDelay(0.05);
  dly.delayTime.value = 0.5 / f;
  const inv = c.createGain();
  inv.gain.value = -1;
  const pwm = c.createOscillator();
  pwm.frequency.value = 2.3;
  const pwmAmt = c.createGain();
  pwmAmt.gain.value = 0.32 / f;
  pwm.connect(pwmAmt).connect(dly.delayTime);

  const saw2 = c.createGain();
  saw2.gain.value = 0.7;
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.Q.value = 3;
  filt.frequency.setValueAtTime(6500, t);
  filt.frequency.exponentialRampToValueAtTime(2200, t + 0.25);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  const decayed = Math.min(t + 0.16, t + dur * 0.5);
  g.gain.exponentialRampToValueAtTime(gain * 0.7, decayed);
  g.gain.setValueAtTime(gain * 0.7, Math.max(decayed, end - 0.06));
  g.gain.exponentialRampToValueAtTime(0.0001, end);

  o1.connect(filt);
  o1.connect(dly).connect(inv).connect(filt);
  o2.connect(saw2).connect(filt);
  filt.connect(g).connect(bs.lead);

  const stop = end + 0.02;
  if (dur > STEP * 4) {
    const vib = c.createOscillator();
    vib.frequency.value = 5.6;
    const depth = c.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.setValueAtTime(0, t + dur * 0.35);
    depth.gain.linearRampToValueAtTime(22, end);
    vib.connect(depth);
    depth.connect(o1.detune);
    depth.connect(o2.detune);
    vib.start(t);
    vib.stop(stop);
  }
  for (const o of [o1, o2, pwm]) {
    o.start(t);
    o.stop(stop);
  }
}

/** Plain square an octave under the lead, for the last verse. */
function doubleNote(c: AudioContext, bs: Buses, midi: number, t: number, dur: number, gain: number) {
  const o = c.createOscillator();
  o.setPeriodicWave(pulse50!);
  o.frequency.value = mtof(midi - 12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.setValueAtTime(gain, Math.max(t + 0.008, t + dur - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bs.lead);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function bassNote(c: AudioContext, bs: Buses, midi: number, t: number, dur: number, gain: number) {
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = mtof(midi);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 2.5;
  f.frequency.setValueAtTime(2000, t);
  f.frequency.exponentialRampToValueAtTime(mtof(midi) * 3, t + 0.2);
  const g = env(c, t, gain, 0.004, t + dur);
  o.connect(f).connect(g).connect(bs.music);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function padChord(c: AudioContext, bs: Buses, notes: readonly number[], t: number, dur: number) {
  for (const n of notes) {
    for (const [side, cents] of [[bs.padL, -11], [bs.padR, 11]] as const) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(n);
      o.detune.value = cents;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.45);
      g.gain.setValueAtTime(0.045, t + dur - 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.35);
      o.connect(g).connect(side);
      o.start(t);
      o.stop(t + dur + 0.4);
    }
  }
}

function noiseHit(c: AudioContext, dest: AudioNode, t: number, dur: number, gain: number) {
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(g).connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.01);
}

function kick(c: AudioContext, bs: Buses, t: number, gain: number) {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(150, t + 0.012);
  o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.setValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
  o.connect(g).connect(bs.drums);
  o.start(t);
  o.stop(t + 0.36);
  kicks.push(t);
  if (kicks.length > 8) kicks.shift();
}

function snare(c: AudioContext, bs: Buses, t: number, gain: number) {
  noiseHit(c, bs.snare, t, 0.18, gain * 4);
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(210, t);
  o.frequency.exponentialRampToValueAtTime(150, t + 0.07);
  const g = env(c, t, gain * 0.8, 0.002, t + 0.09);
  o.connect(g).connect(bs.drums);
  o.start(t);
  o.stop(t + 0.1);
}

/** Bar position (0..1) mapped onto the section's filter sweep. */
function sweepHz(b: Bar, pos: number): number {
  const [lo, hi, period, shape] = b.section.sweep;
  const p = ((b.bar % period) + pos) / period;
  const v = shape === 'up' ? p : p < 0.5 ? p * 2 : 2 - p * 2;
  return lo * Math.pow(hi / lo, v);
}

/** How many steps a lead note lasts: until the next note or rest, across bars. */
function leadSteps(barNo: number, s: number): number {
  let len = 1;
  for (let k = s + 1; len < STEPS_PER_BAR * 2; k++, len++) {
    const b = BARS[songBar(barNo + Math.floor(k / STEPS_PER_BAR))];
    const v = b.lead ? b.lead[k % STEPS_PER_BAR] : R;
    if (v !== H) break;
  }
  return len;
}

function scheduleStep(bs: Buses, n: number, t: number) {
  const barNo = Math.floor(n / STEPS_PER_BAR);
  const b = BARS[songBar(barNo)];
  const i = n % STEPS_PER_BAR;
  const p = b.parts;
  const c = ctx!;

  if (i === 0) {
    const f = bs.arpFilter.frequency;
    f.setValueAtTime(sweepHz(b, 0), t);
    f.exponentialRampToValueAtTime(sweepHz(b, 1), t + BAR);
    if (p.pad) padChord(c, bs, b.chord.notes, t, BAR);
    // crash on the downbeat of each full-band section
    if (b.bar === 0 && p.snare) noiseHit(c, bs.hats, t, 1.4, 0.3);
  }

  if (p.arp) {
    // tracker-style arpeggio: one note per step, pitch cycling every third of a step
    const tones = b.chord.arp;
    const o = c.createOscillator();
    o.setPeriodicWave(pulse25!);
    for (let j = 0; j < 3; j++) o.frequency.setValueAtTime(mtof(tones[(n * 3 + j) % tones.length]), t + (j * STEP) / 3);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.003);
    g.gain.setValueAtTime(0.2, t + STEP * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + STEP * 0.95);
    o.connect(g).connect(bs.arpFilter);
    o.start(t);
    o.stop(t + STEP);
  }

  if (p.bass) {
    const q = i % 4;
    if (q === 0) bassNote(c, bs, b.chord.bass, t, STEP * 1.7, 0.85);
    else if (q === 2) bassNote(c, bs, b.chord.bass + 12, t, STEP * 0.9, 0.68);
    else if (q === 3) bassNote(c, bs, b.chord.bass + 12, t, STEP * 0.8, 0.46);
  }

  const v = b.lead?.[i];
  if (v !== undefined && v > 0) {
    const dur = STEP * leadSteps(barNo, i) * 0.94;
    leadNote(c, bs, v, t, dur, 0.15);
    if (p.dbl) doubleNote(c, bs, v, t, dur, 0.06);
  }

  if (p.kick === 'four' ? i % 4 === 0 : p.kick === 'half' && i % 8 === 0) kick(c, bs, t, p.kick === 'four' ? 0.55 : 0.4);
  if (p.roll) {
    if (i % 2 === 0 || i >= 8) snare(c, bs, t, 0.06 + (0.3 * i) / 15);
  } else if (p.snare) {
    if (i === 4 || i === 12) snare(c, bs, t, 0.36);
    else if (p.fill && i >= 13) snare(c, bs, t, 0.14 + 0.06 * (i - 12));
  }
  if (p.hats && i % 4 === 2) noiseHit(c, bs.hats, t, 0.11, 0.5);
  else if (p.hats === 2 && i % 2 === 1) noiseHit(c, bs.hats, t, 0.025, 0.15);
}

/** After a stall: how many steps to skip and the next step time, so the grid stays aligned. */
export function skipMissed(nextTime: number, now: number, stepLen: number): { steps: number; nextTime: number } {
  if (nextTime >= now) return { steps: 0, nextTime };
  const steps = Math.ceil((now - nextTime) / stepLen);
  return { steps, nextTime: nextTime + steps * stepLen };
}

function tick() {
  if (!ctx || !bus) return;
  // after a stall (hidden tab, busy main thread) skip the missed steps instead of firing them all at once
  const skip = skipMissed(nextTime, ctx.currentTime, STEP);
  step += skip.steps;
  nextTime = skip.nextTime;
  while (nextTime < ctx.currentTime + LOOKAHEAD) {
    scheduleStep(bus, step, nextTime);
    nextTime += STEP;
    step++;
  }
}

/** Fade a bus out fast from wherever its gain is, then cut it loose. */
function retire(old: Buses, now: number) {
  const g = old.music.gain;
  const v = g.value;
  g.cancelScheduledValues(now);
  g.setValueAtTime(v, now);
  g.setTargetAtTime(0, now, 0.005);
  window.setTimeout(() => {
    old.out.disconnect();
    for (const n of old.feedback) n.disconnect();
  }, 100);
}

export function startMusic() {
  const c = ensureCtx();
  if (suspendTimer !== null) window.clearTimeout(suspendTimer);
  suspendTimer = null;
  void c.resume();
  if (playing) return;
  playing = true;
  step = 0;
  kicks.length = 0;
  const now = c.currentTime;
  // Each start gets a fresh bus. Pad tails, held notes, echoes and filter
  // automation from the last run stay on the old bus and fade with it.
  if (bus) retire(bus, now);
  const b = (bus = createBuses(c));
  nextTime = now + 0.06;
  b.music.gain.setValueAtTime(0.0001, now);
  b.music.gain.exponentialRampToValueAtTime(MUSIC_LEVEL, now + 1.5);
  timer = window.setInterval(tick, 25);
  tick();
  (globalThis as { __koltoPulse?: () => number }).__koltoPulse = pulse;
}

export function stopMusic() {
  if (!ctx || !bus || !playing) return;
  playing = false;
  const c = ctx;
  const g = bus.music.gain;
  const v = Math.max(g.value, 0.0001);
  g.cancelScheduledValues(c.currentTime);
  g.setValueAtTime(v, c.currentTime);
  g.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.6);
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  (globalThis as { __koltoPulse?: () => number }).__koltoPulse = undefined;
  suspendTimer = window.setTimeout(() => {
    suspendTimer = null;
    if (!playing) void c.suspend();
  }, 800);
}

/** 0..1 envelope that spikes on each kick drum; drives the hero animation. */
export function pulse(): number {
  if (!ctx || !playing) return 0;
  // currentTime runs ahead of what the speakers play by the output latency
  const now = ctx.currentTime - (ctx.outputLatency ?? ctx.baseLatency ?? 0);
  let v = 0;
  for (const k of kicks) if (k <= now) v = Math.max(v, Math.exp(-(now - k) * 7));
  return v;
}

/** Soft sine ping with a slight downward glide, like a sonar return. */
function ping(c: AudioContext, freq: number, t: number, gain: number, dest: AudioNode) {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.985, t + 0.3);
  const g = env(c, t, gain, 0.005, t + 0.3);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.32);
}

export function blip(kind: 'ok' | 'tick' = 'ok') {
  const c = ensureCtx();
  void c.resume();
  const t = c.currentTime + 0.01;
  if (kind === 'ok') {
    // two-note sonar confirm, a rising fifth (G5 to D6) with a faint, muffled echo
    ping(c, 784, t, 0.07, master!);
    ping(c, 1175, t + 0.1, 0.06, master!);
    const far = c.createBiquadFilter();
    far.type = 'lowpass';
    far.frequency.value = 1500;
    far.connect(master!);
    ping(c, 1175, t + 0.27, 0.018, far);
  } else {
    // droplet: a quick rising sine blip, the sound of a bubble closing
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(650, t);
    o.frequency.exponentialRampToValueAtTime(1800, t + 0.04);
    const g = env(c, t, 0.05, 0.002, t + 0.07);
    o.connect(g).connect(master!);
    o.start(t);
    o.stop(t + 0.08);
  }
}
