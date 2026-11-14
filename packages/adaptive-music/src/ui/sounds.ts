import { splitmix32 } from '../core/rng';

export type UiKind = 'click' | 'hover' | 'route' | 'section' | 'edge' | 'confirm' | 'error';
export interface UiBar {
  n: number;
  t: number;
  dur: number;
  step: number;
  pcs: readonly number[];
}
export interface UiHost {
  ctx: BaseAudioContext;
  out: AudioNode;
  seed: number;
  ref(): number;
  lite(): boolean;
  bar(t: number): UiBar | null;
  x(): number | null;
}
export type UiTuple = readonly [r: number, pc: number, o: number, band: number, t0: number, t1: number];
export interface Ui {
  play(k: UiKind, sub?: string): UiTuple | undefined;
  fallbacks: number;
}

const R = [
  [3000, 2, 0.012, 1, 72, 1.6, 0.07],
  [1800, 3, 0.012, 1, 72, 1, 0.35],
  [6000, 4, 0.008, 1, 84, 1, 0.5],
  [1200, 1.5, 0.02, 2, 60, 1, 0.06],
  [2500, 6, 0.015, 0],
  [900, 0.7, 0.12, 0],
  [700, 1, 0.06, 1, 60, 2, 0.25],
  [1500, 0.8, 0.25, 0],
  [1800, 3, 0.01, 1, 72, 1, 0.18, 4],
  [300, 1, 0.03, 1, 36, 0.5, 0.18],
  [2000, 3, 0.01, 1, 0, 1, 0.3, 2, 784, 1.5],
  [2000, 3, 0.01, 1, 0, 1, 0.3, 2, 1175, 2 / 3],
];
const KS: readonly UiKind[] = ['click', 'hover', 'route', 'section', 'edge', 'confirm', 'error'];
const C: readonly (readonly [readonly number[], number, number, number, number])[] = [
  [[0, 1, 2, 3, 4], -22, 0.07, 8, 2],
  [[0, 2, 5, 1], -30, 0, 4, 1],
  [[6, 7, 8], -20, 0, 9, 1],
  [[2], -32, 8, 9, 1],
  [[9, 6], -30, 4, 9, 1],
  [[10], -20, 0, 99, 1],
  [[11], -22, 0, 99, 1],
];
const FAM: Readonly<Record<string, number>> = { link: 0, button: 2, disclosure: 5, card: 1 };

export function createUi(h: UiHost): Ui {
  const c = h.ctx;
  const T: number[][] = KS.map(() => []);
  const M: string[][] = KS.map(() => []);
  const N = KS.map(() => 0);
  const P = KS.map(() => -1);
  let V: { e: number; g: GainNode; s: AudioScheduledSourceNode[] }[] = [];
  let mute = 0;
  let buf: AudioBuffer | null = null;
  const u = (k: number, i: number, j: number): number => splitmix32((splitmix32((splitmix32(h.seed ^ Math.imul(k + 1, 0x9e3779b9)) + i) | 0) + j) | 0) / 4294967296;
  const noise = (): AudioBuffer => {
    if (!buf) {
      buf = c.createBuffer(1, (c.sampleRate * 0.4) | 0, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = splitmix32(h.seed + i) / 2147483648 - 1;
    }
    return buf;
  };

  const ui: Ui = {
    fallbacks: 0,
    play(k, sub) {
      const now = c.currentTime;
      const lite = h.lite();
      const ki = KS.indexOf(k);
      if (lite && !((37 >> ki) & 1)) return;
      const [pool, db, gap, max, win] = C[ki];
      const b0 = h.bar(now);
      const bd = b0?.dur ?? 2;
      const ts = (T[ki] = T[ki].filter((x) => now - x < 30));
      if ((27 >> ki) & 1 && now < mute) return;
      if (ts.length && now - ts[ts.length - 1] < (ki === 2 ? bd - 1e-6 : gap)) return;
      if (ts.filter((x) => now - x < win).length >= max) return;
      V = V.filter((v) => v.e > now);
      const st = V.length >= (lite ? 2 : 3);
      while (V.length >= (lite ? 2 : 3)) {
        const v = V.shift()!;
        const a = v.g.gain;
        a.cancelScheduledValues(now);
        a.setValueAtTime(a.value, now);
        a.linearRampToValueAtTime(0, now + 0.02);
        for (const s of v.s) s.stop(now + 0.02);
      }
      const t0 = now + (st ? 0.02 : 0.005);
      const bt = h.bar(t0 + 0.02);
      const g32 = bt ? bt.step / 2 : 0.0625;
      const t1 = bt ? bt.t + Math.ceil((t0 + 0.02 - bt.t) / g32 - 1e-9) * g32 : t0 + 0.02;
      const b1 = bt && h.bar(t1);
      const pcs = b1 ? b1.pcs.slice(0, 5) : [];
      const on = bt ? ((t0 - bt.t) / (bt.step * 4)) % 1 : 0.5;
      const fam = FAM[sub ?? ''] ?? -1;
      const idx = N[ki]++;
      const H = M[ki];
      let pick: number[] = [];
      let best = -1;
      for (let i = 0; i < 4 && best < 1; i++) {
        const d = (j: number): number => u(ki, idx, i * 16 + j);
        const ws = pool.map((r) => (r === P[ki] && pool.length > 1 ? 0 : 1) * (r === fam ? 3 : 1) * (ki ? 1 : r === (on < 0.15 || on > 0.85 ? 2 : 0) ? 3 : 1));
        let x = d(0) * ws.reduce((a, w) => a + w, 0);
        let r = pool[0];
        for (let j = 0; j < pool.length; j++) if ((x -= ws[j]) < 0) {
          r = pool[j];
          break;
        }
        const p = R[r][3] && (R[r][8] || pcs.length) ? (R[r][8] ? 12 : ki === 4 ? pcs[0] : pcs[Math.floor(d(1) * pcs.length)]) : -1;
        const cand = [r, p, p < 0 || R[r][8] ? 0 : d(2) < 0.5 ? 0 : 1, Math.round(d(3) * 4 - 2), d(3) * 4 - 2, d(4), d(5), d(6), d(7), d(8), d(9)];
        best = +!H.includes(cand.slice(0, 4) + '');
        pick = cand;
      }
      if (best < 1) ui.fallbacks++;
      H.push(pick.slice(0, 4) + '');
      if (H.length > 6) H.shift();
      const [r, p, o, band, lj, dc, dd, da, dp, dt, dn] = pick;
      P[ki] = r;
      const n = Math.min(8, ts.push(now) - 1);
      if (ki === 2) mute = now + bd;
      const [bp, q, nd, , base, gl, dec, sec, fx, ratio = 1] = R[r] as number[];
      const pk = h.ref() * 10 ** ((db + lj) / 20) * 0.75 ** n;
      const cm = 2 ** ((dc - 0.5) * 0.667);
      const dm = 1 + (dd - 0.5) * 0.4;
      const am = 1 + (da - 0.5) * 0.6;
      const f = c.createBiquadFilter();
      const g = c.createGain();
      const pn = c.createStereoPanner();
      const s = c.createBufferSource();
      const x = h.x();
      f.type = 'bandpass';
      f.Q.setValueAtTime(q, t0);
      f.frequency.setValueAtTime(bp * cm, t0);
      pn.pan.value = (x === null ? 0 : Math.max(-0.5, Math.min(0.5, x - 0.5))) + (dp - 0.5) * 0.1;
      s.buffer = noise();
      s.connect(f).connect(g).connect(pn).connect(h.out);
      const a = 0.002 * am;
      const gg = g.gain;
      gg.setValueAtTime(0, t0);
      gg.setTargetAtTime(p < 0 ? pk : pk * 0.5, t0, a / 3);
      gg.setTargetAtTime(0, t0 + a, nd / 3);
      s.start(t0, dn * 0.2);
      let e = t0 + a + nd * 1.6;
      s.stop(e);
      const src: AudioScheduledSourceNode[] = [s];
      if (p >= 0) {
        const os = c.createOscillator();
        const hz = fx || 440 * 2 ** ((base + ((((55 + p - base) % 12) + 12) % 12) + 12 * o - 69) / 12);
        const tau = (dec * dm) / 4;
        const a2 = 0.004 * am;
        const t2 = sec ? t1 + sec * g32 : 0;
        os.type = R[r][3] === 2 ? 'triangle' : 'sine';
        os.detune.value = (dt - 0.5) * 10;
        os.frequency.setValueAtTime(hz, t1);
        if (gl !== 1) os.frequency.exponentialRampToValueAtTime(hz * gl, t1 + dec * dm);
        if (t2) os.frequency.setValueAtTime(hz * ratio, t2);
        f.frequency.setValueAtTime(hz * cm, t1);
        f.Q.setValueAtTime(0.7, t1);
        os.connect(f);
        for (const [tt, v] of t2 ? [[t1, pk], [t2, pk * 0.8]] : [[t1, pk]]) {
          gg.setTargetAtTime(v, tt, a2 / 3);
          gg.setTargetAtTime(0, tt + a2, tau);
        }
        os.start(t1);
        e = Math.max(e, (t2 || t1) + a2 + tau * 5);
        os.stop(e);
        src.push(os);
      }
      V.push({ e, g, s: src });
      return [r, p, o, band, t0, p >= 0 ? t1 : 0];
    },
  };
  return ui;
}
