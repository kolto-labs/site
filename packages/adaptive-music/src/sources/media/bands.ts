const BW_DB = -3.0103;

const bq = (c: BaseAudioContext, type: BiquadFilterType, frequency: number): BiquadFilterNode =>
  new BiquadFilterNode(c, { type, frequency, Q: type === 'allpass' ? Math.SQRT1_2 : BW_DB });

const lr4 = (c: BaseAudioContext, from: AudioNode, type: BiquadFilterType, f: number): AudioNode =>
  from.connect(bq(c, type, f)).connect(bq(c, type, f));

export function split(c: BaseAudioContext, from: AudioNode, fs: readonly number[]): AudioNode[] {
  if (!fs.length) return [from];
  const k = fs.length >> 1;
  let lo = lr4(c, from, 'lowpass', fs[k]);
  let hi = lr4(c, from, 'highpass', fs[k]);
  for (const f of fs.slice(k + 1)) lo = lo.connect(bq(c, 'allpass', f));
  for (const f of fs.slice(0, k)) hi = hi.connect(bq(c, 'allpass', f));
  return [...split(c, lo, fs.slice(0, k)), ...split(c, hi, fs.slice(k + 1))];
}

export interface Bands {
  inp: GainNode;
  gains: GainNode[];
  duck: GainNode;
  width: GainNode;
}

export function makeBands(c: BaseAudioContext, out: AudioNode, lite: boolean): Bands {
  const inp = new GainNode(c);
  const parts = split(c, inp, lite ? [250, 3000] : [150, 800, 4000]);
  const last = parts.length - 1;
  const duck = new GainNode(c);
  const wide = new GainNode(c);
  const gains = parts.map((p, i) => {
    const g = i === 0 ? new GainNode(c, { channelCount: 1, channelCountMode: 'explicit' }) : new GainNode(c);
    p.connect(g).connect(i === 0 ? out : i === last ? wide : duck);
    return g;
  });
  duck.connect(wide).connect(out);
  const sp = new ChannelSplitterNode(c, { numberOfOutputs: 2 });
  const mg = new ChannelMergerNode(c, { numberOfInputs: 2 });
  const width = new GainNode(c, { gain: 0 });
  wide.connect(sp);
  sp.connect(new GainNode(c, { gain: 0.5 }), 0).connect(width);
  sp.connect(new GainNode(c, { gain: -0.5 }), 1).connect(width);
  width.connect(mg, 0, 0);
  width.connect(new GainNode(c, { gain: -1 })).connect(mg, 0, 1);
  mg.connect(out);
  return { inp, gains, duck, width };
}
