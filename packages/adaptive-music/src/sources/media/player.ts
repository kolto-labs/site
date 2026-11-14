import type { MediaHost, PlaySource, SourceBegin } from '../../index';
import type { BarOf, Transport } from '../../core/transport';
import type { Bands } from './bands';
import { makeBands } from './bands';

export interface Res {
  id: string;
  buf: AudioBuffer;
  g: number;
}
export interface Cache {
  ids(): readonly string[];
  get(id: string): Res | undefined;
  prime(id: string | null): Promise<Res | null>;
}
interface Seg {
  id: string;
  r: Res;
  stop?: number;
  s: AudioBufferSourceNode;
  g: GainNode;
  t0: number;
  off: number;
  dur: number;
}
type Bar = BarOf<never>;

const BAR = 2;
const W4 = [0.4, 0.3, 0.2, 0.1];
const W3 = [0.45, 0.4, 0.15];

export function createPlayer(h: MediaHost, k: Cache) {
  let c: AudioContext | null = null;
  let out: GainNode | null = null;
  let b: Bands | null = null;
  let tr: Transport<Bar, never> | null = null;
  let cur: Seg | null = null;
  let segs: Seg[] = [];
  let resume: { id: string; pos: number } | null = null;
  let lite = false;
  let exAt = 0;
  const dbg = { late: 0, joins: 0, log: [] as { t: number; at: number; id: string }[] };

  const next = (id: string | null): string | null => {
    const ids = k.ids();
    return ids.length ? ids[(ids.indexOf(id!) + 1) % ids.length] : null;
  };

  const plan = (n: number, t: number): Bar => ({ n, t, dur: BAR, step: BAR / 16, meter: 16, bpm: 120, st: 0, tones: [], root: 0, pcs: [], evs: [] });

  const playing = (): Seg | null => {
    let p: Seg | null = null;
    for (const x of segs) if (x.t0 <= c!.currentTime && !(x.stop! <= c!.currentTime)) p = x;
    return p;
  };

  const halt = (x: Seg, t: number): void => {
    x.g.gain.cancelScheduledValues(c!.currentTime);
    x.g.gain.setTargetAtTime(0, t - 0.015, 0.005);
    x.s.stop((x.stop = t + 0.05));
  };

  const seg = (r: Res, at: number, off: number): void => {
    const s = new AudioBufferSourceNode(c!, { buffer: r.buf, loop: true });
    const g = new GainNode(c!, { gain: 0 });
    s.connect(g).connect(b!.inp);
    g.gain.setTargetAtTime(r.g, at, 0.005);
    s.start(at, off);
    if (import.meta.env.DEV) {
      dbg.log.push({ t: at, at: c!.currentTime, id: r.id });
      if (dbg.log.length > 200) dbg.log.shift();
    }
    cur = { id: r.id, r, s, g, t0: at, off, dur: r.buf.duration };
    segs = [...segs.filter((x) => !(x.stop! <= c!.currentTime)), cur];
    tr!.cancel(1);
    tr!.at(at + r.buf.duration - off, join, 1);
    void k.prime(next(r.id));
  };

  const join = (T: number): void => {
    if (!cur || !c || !tr) return;
    const nx = next(cur.id);
    const r = nx && nx !== cur.id ? k.get(nx) : undefined;
    if (!r) {
      if (nx !== cur.id) void k.prime(nx);
      tr.at(T + cur.dur, join, 1);
      return;
    }
    const now = c.currentTime;
    if (T < now + 0.02) {
      if (import.meta.env.DEV) dbg.late++;
      T = now + 0.05;
    }
    halt(cur, T);
    if (import.meta.env.DEV) dbg.joins++;
    seg(r, T, 0);
  };

  const wake = (): void => {
    if (!tr || !c || !b) return;
    tr.wake();
    const now = c.currentTime;
    if (now - exAt < 0.1) return;
    exAt = now;
    const x = h.ctl();
    const A = 0.6 * x.eV + 0.4 * x.eSlow;
    const g = b.gains;
    const n = g.length;
    const w = n === 3 ? W3 : W4;
    const db = g.map((_, i) => (i === 0 || i === n - 1 ? 3 * (A - 0.5) : -2 * x.fV));
    let p = 0;
    for (let i = 0; i < n; i++) p += w[i] * Math.pow(10, db[i] / 10);
    const trim = -10 * Math.log10(p);
    for (let i = 0; i < n; i++) g[i].gain.setTargetAtTime(Math.pow(10, (db[i] + trim) / 20), now, 0.5);
    b.width.gain.setTargetAtTime(Math.min(lite ? 0.6 : 1, 0.7 + 0.3 * x.qV) - 1, now, 2);
  };

  const ui = (): void => {
    if (!c || !b) return;
    const t = c.currentTime;
    const d = b.duck.gain;
    d.cancelScheduledValues(t);
    d.setTargetAtTime(0.794, t, 0.005);
    d.setTargetAtTime(1, t + 0.12, 0.15);
  };

  const src: PlaySource = {
    begin(a: SourceBegin, at?: number): void {
      c = h.ctx()!;
      lite = a.lite;
      out = new GainNode(c, { gain: 0.0001 });
      out.connect(h.master()!.hp);
      out.gain.setTargetAtTime(a.level, c.currentTime, 0.5);
      b = makeBands(c, out, lite);
      tr = new h.Transport<Bar, never>(() => c!.currentTime, plan, { bar() {}, play() {} });
      const t0 = Math.max(c.currentTime + 0.1, at ?? 0);
      tr.start(t0);
      const id = want();
      const r = id ? k.get(id) : undefined;
      if (r) seg(r, t0, resume?.id === id ? resume.pos % r.buf.duration : 0);
      exAt = 0;
      wake();
    },
    end(at?: number, fade = 0.6): void {
      if (!c || !out) return;
      const now = c.currentTime;
      const stopAt = Math.max(now, at ?? now);
      out.gain.cancelScheduledValues(stopAt);
      out.gain.setValueAtTime(out.gain.value, stopAt);
      out.gain.linearRampToValueAtTime(0, stopAt + fade);
      const p = playing() ?? cur;
      if (p) resume = { id: p.id, pos: p.off + Math.max(0, stopAt - p.t0) };
      for (const x of segs) x.s.stop(stopAt + fade);
      segs = [];
      tr?.cancel(Math.max(0.01, stopAt - now + fade));
      const o = out;
      setTimeout(() => o.disconnect(), Math.max(1500, (stopAt - now + fade + 0.5) * 1000));
      cur = tr = out = b = null;
    },
    wake,
    route() {},
    duck(level: number, tau: number): void {
      if (c && out) out.gain.setTargetAtTime(level, c.currentTime, tau);
    },
    blip(kind: 'ok' | 'tick'): void {
      if (!c) return;
      const t = c.currentTime + 0.01;
      for (const [dt, f, v] of kind === 'ok' ? [[0, 784, 0.12], [0.1, 1175, 0.1]] : [[0, 1568, 0.06]]) {
        const o = new OscillatorNode(c, { frequency: f });
        const e = new GainNode(c, { gain: 0 });
        o.connect(e).connect(h.master()!.ui);
        e.gain.setTargetAtTime(v, t + dt, 0.003);
        e.gain.setTargetAtTime(0, t + dt + 0.03, 0.06);
        o.start(t + dt);
        o.stop(t + dt + 0.4);
      }
      ui();
    },
    ui,
    pulse: () => 0,
    beat: () => null,
    nextDownbeat: (te) => te,
    nextBeat: (te) => te,
  };
  if (import.meta.env.DEV) src.debug = () => ({ ctx: c, out, bands: b, transport: tr, cur, late: dbg.late, joins: dbg.joins, log: dbg.log, skippedBars: tr?.skipped ?? 0 });

  const want = (): string | null => {
    const ids = k.ids();
    return resume && ids.includes(resume.id) ? resume.id : (ids[0] ?? null);
  };

  return {
    src,
    want,
    next: () => next(cur?.id ?? null),
    current: () => cur?.id ?? null,
    cut(): void {
      if (!c || !cur) return;
      const ids = k.ids();
      const p = playing();
      if ((!p || ids.includes(p.id)) && ids.includes(cur.id)) return;
      const keep = p && ids.includes(p.id) ? p : null;
      const r0 = keep ? keep.r : ids.includes(cur.id) ? cur.r : null;
      void (r0 ? Promise.resolve(r0) : k.prime(next(p?.id ?? cur.id))).then((r) => {
        if (!r || !c || !tr) return;
        const T = c.currentTime + 0.3;
        for (const x of segs) halt(x, T);
        seg(r, T, keep ? (keep.off + T - keep.t0) % keep.dur : 0);
      });
    },
  };
}
