export interface Master {
  hp: BiquadFilterNode;
  ui: GainNode;
}

export function makeMaster(c: AudioContext): Master {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 6;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 32;
  hp.Q.value = 1;
  const out = c.createGain();
  out.gain.value = 0.9;
  hp.connect(out).connect(comp).connect(c.destination);
  const ui = c.createGain();
  ui.connect(hp);
  return { hp, ui };
}
