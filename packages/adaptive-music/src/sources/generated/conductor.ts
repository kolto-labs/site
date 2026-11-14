import type { Locator, SceneEventLike } from '../../index';
import type { Transport } from '../../core/transport';
import type { Rng } from '../../core/rng';
import type { CueSpec, Gesture, Quantise } from './cuespec';
import type { Mixer } from './mixer';
import type { LayerKey, ScoreProfile } from './profile';
import type { BarPlan, Ctl, Ev, Inst, Mod, Score } from './score';
import { G3, clampN, db, idxNear, midiOf, pick, vnoise } from './theory';

export interface Env {
  ctx: AudioContext;
  rig(): Mixer;
  score: Score;
  readonly tr: Transport<BarPlan, Ev>;
  profile: ScoreProfile;
  specs(): Readonly<Record<string, CueSpec>>;
  loc(): Locator;
  cx(te: number): number;
  play(e: Ev, dest: AudioNode): void;
  cut(i: Inst, t: number): void;
  ctl(): Ctl;
}

type End = (t: number, cut: boolean) => void;
type G<K extends Gesture['kind']> = Extract<Gesture, { kind: K }>;

export class Conductor {
  insts: Inst[] = [];
  mods: Mod[] = [];
  live = new Map<number, { ends: End[]; e: SceneEventLike }>();
  tracks: { e: SceneEventLike; p: StereoPannerNode; dx: number }[] = [];
  amb: End[] | null = null;
  R: readonly number[];
  permit: number;
  n = 0;
  last = 0;
  plume = 0;
  afx: { id: string; g: G<'fx'> } | null = null;
  junk: [number, AudioNode][] = [];
  pk = 0;

  constructor(private E: Env, mo: Rng, keep?: { R: readonly number[]; permit: number }) {
    this.R = keep?.R ?? E.profile.rhythms[pick(mo, E.profile.rhythms.map(() => 1))];
    this.permit = keep?.permit ?? (mo() < 0.5 ? 1 : -1);
  }

  private drop(ends: End[], n: AudioNode): void {
    ends.push((te) => this.junk.push([te + 3, n]));
  }

  private cap(t: number): void {
    const live = this.insts.filter((i) => i.t1 > t + 0.005);
    if (live.length < (this.E.ctl().lite ? 2 : 4)) return;
    const rk = (i: Inst): number => (i.layer === 'hats' ? 0 : 1);
    const v = live.reduce((a, b) => (rk(b) - rk(a) || b.tg - a.tg || b.t0 - a.t0) < 0 ? b : a);
    const p = (v.dest as GainNode).gain;
    p.cancelScheduledValues(t);
    p.setTargetAtTime(0, t, 0.005);
    v.t1 = t;
    this.E.cut(v, t);
  }

  private bt(t: number): number {
    const b = this.E.tr.barAt(t);
    return b ? b.step * 4 : 0.52;
  }

  private bar(t: number): number {
    const b = this.E.tr.barAt(t);
    return b ? b.dur : 2.07;
  }

  private when(q: Quantise, e: SceneEventLike, T0: number): number[] {
    if (q === 'now' || q === 'bar') return [T0];
    if (q === 'beat') return [T0 + this.bt(T0)];
    if (q === 'phrase') return [this.E.tr.next];
    const out: number[] = [];
    for (const m of e.marks) {
      if (m.name === q.mark || (q.each && m.name.startsWith(q.mark))) out.push(this.E.cx(m.at) + (q.beats ?? 0) * this.bt(T0));
      if (out.length && !q.each) break;
    }
    return out;
  }

  private panX(spec: CueSpec, e: SceneEventLike | null): number {
    if (typeof spec.pan === 'number') return spec.pan;
    const x = spec.pan === 'track' && e ? this.E.loc().screenX(e) : null;
    return x === null ? 0 : clampN((2 * x) / Math.max(1, this.E.loc().width()) - 1, -0.6, 0.6);
  }

  private bus(spec: CueSpec, e: SceneEventLike | null, sub: boolean, level: number, lp: number, to: LayerKey | 'hatF', dx = 0) {
    const { ctx } = this.E;
    const rig = this.E.rig();
    const g = ctx.createGain();
    g.gain.value = level * (sub ? db(-9) : 1);
    const f = ctx.createBiquadFilter();
    f.frequency.value = sub ? Math.min(lp, 1200) : lp;
    const p = ctx.createStereoPanner();
    p.pan.value = clampN(this.panX(spec, e) + dx, -1, 1);
    g.connect(f).connect(p).connect(to === 'hatF' ? rig.hatF : rig.layer(to));
    if (e && spec.pan === 'track') this.tracks.push({ e, p, dx });
    return { g, p };
  }

  poll(now: number): void {
    if (now - this.last < 0.1) return;
    this.last = now;
    this.junk = this.junk.filter(([t, n]) => t > now || (n.disconnect(), false));
    this.tracks = this.tracks.filter((k) => this.live.has(k.e.uid));
    for (const k of this.tracks) {
      const x = this.E.loc().screenX(k.e);
      if (x !== null) k.p.pan.setTargetAtTime(clampN(clampN((2 * x) / Math.max(1, this.E.loc().width()) - 1, -0.6, 0.6) + k.dx, -1, 1), now, 0.08);
    }
  }

  onBar(b: BarPlan): void {
    this.mods = this.mods.filter((m) => m.t1 > b.t - 1);
    this.insts = this.insts.filter((i) => i.t1 > b.t - 1);
    if (this.plume) this.E.rig().droneLP.frequency.setTargetAtTime(this.plume + 900 * vnoise(this.E.score.seed + 7, b.n), b.t, 0.6);
    const fx = this.afx;
    if (fx) {
      const u = this.E.score.rh();
      if (u < (fx.g.p ?? 0) && this.E.loc().visible(fx.id)) {
        const g = this.E.ctx.createGain();
        g.gain.value = db(fx.g.lv + 15.5);
        g.connect(this.E.rig().layer('cuefx'));
        this.junk.push([b.t + 3, g]);
        this.E.play({ t: b.t + Math.min(1 + 2 * Math.floor(u * 16), b.meter - 1) * b.step, v: fx.g.voice, m: 0, d: 0.07, g: 1, l: 'cuefx' }, g);
      }
    }
  }

  ambient(ids: readonly string[]): void {
    this.endAmbient();
    const ends: End[] = (this.amb = []);
    const specs = this.E.specs();
    for (const id of ids) {
      for (const g of specs[id]?.gestures ?? []) {
        if (g.kind === 'bed') this.bed(g, ends, id);
        else if (g.kind === 'fx' && g.p !== undefined) this.afx = { id, g };
      }
    }
  }

  endAmbient(): void {
    for (const f of this.amb ?? []) f(this.E.ctx.currentTime, true);
    this.amb = null;
    this.afx = null;
    this.plume = 0;
  }

  private bed(g: G<'bed'>, ends: End[], id: string): void {
    const { ctx, tr, score } = this.E;
    const rig = this.E.rig();
    const t = ctx.currentTime;
    const lpf = rig.droneLP.frequency;
    if (g.layer === 'drone') {
      const [a, b] = g.lp ?? [600, 600];
      this.plume = a === b || g.glide ? 0 : a;
      if (a === b) lpf.setTargetAtTime(a, t, 0.4);
      else if (g.glide) {
        lpf.cancelScheduledValues(t);
        lpf.setValueAtTime(Math.min(a, lpf.value), t);
        lpf.linearRampToValueAtTime(b, t + g.glide);
      }
      if (g.tremolo) rig.tremDepth.gain.setTargetAtTime(g.tremolo.depth * 0.5, t, 0.5);
      if (g.drips) {
        const [lo, hi] = g.drips;
        const go = (at: number): void => {
          if (this.amb !== ends || rig.gone) return;
          const bus = ctx.createGain();
          bus.gain.value = db(-18 + 15.5);
          const pn = ctx.createStereoPanner();
          pn.pan.value = (score.rh() - 0.5) * 0.6;
          bus.connect(pn).connect(rig.layer('cuefx'));
          this.junk.push([at + 3, pn]);
          this.E.play({ t: at, v: 'sonar', m: score.rh() < 0.5 ? G3 : G3 - 5, d: 0.35, g: 1, l: 'cuefx' }, bus);
          tr.at(at + lo + (hi - lo) * score.rh(), go, -1);
        };
        tr.at(t + lo, go, -1);
      }
    } else if (g.layer === 'texture') {
      const src = ctx.createBufferSource();
      src.buffer = rig.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 600;
      bp.Q.value = 4;
      const fl = ctx.createGain();
      fl.gain.value = 0.7;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.2;
      const ld = ctx.createGain();
      ld.gain.value = 0.3;
      lfo.connect(ld).connect(fl.gain);
      const out = ctx.createGain();
      out.gain.value = db(g.lv + 15.5) * 0.3;
      const lp = ctx.createBiquadFilter();
      lp.frequency.value = this.E.loc().visible(id) ? 20000 : 1200;
      src.connect(bp).connect(fl).connect(out).connect(lp).connect(rig.layer('cuefx'));
      src.start(t);
      lfo.start(t);
      this.drop(ends, lp);
      ends.push((te) => {
        out.gain.setTargetAtTime(0, te, 0.2);
        src.stop(te + 1.5);
        lfo.stop(te + 1.5);
      });
    }
  }

  end(uid: number, cut: boolean): void {
    const E = this.E;
    const r = this.live.get(uid);
    this.live.delete(uid);
    E.tr.cancel(uid);
    const now = E.ctx.currentTime;
    for (const f of r?.ends ?? []) f(cut ? now : Math.max(now, E.cx(r!.e.startAt + r!.e.duration)), cut);
  }

  start(e: SceneEventLike): void {
    const E = this.E;
    if (this.live.has(e.uid)) return;
    const spec = E.specs()[e.id];
    if (!spec) return;
    const vis = E.loc().visible(e.id);
    if (spec.offscreen === 'skip' && !vis) return;
    const T0 = Math.max(E.cx(e.startAt), E.ctx.currentTime + 0.03);
    const ends: End[] = [];
    this.live.set(e.uid, { ends, e });
    for (const g of spec.gestures) this.run(g, e, spec, ends, T0, spec.offscreen === 'submerge' && !vis);
  }

  private run(g: Gesture, e: SceneEventLike, spec: CueSpec, ends: End[], T0: number, sub: boolean): void {
    const E = this.E;
    const rig = E.rig();
    const step = this.bt(T0) / 4;
    const bar = this.bar(T0);
    const tEv = E.cx(e.startAt + e.duration);
    if (g.kind === 'state') {
      E.score.setState(g.to, e.marks[0] ? E.cx(e.marks[0].at) : T0);
    } else if (g.kind === 'transform') {
      this.transform(g, e, ends, T0, bar, tEv);
    } else if (g.kind === 'layer') {
      this.cap(T0);
      const bus = this.bus(spec, e, sub, 0.0001, 20000, g.layer === 'hats' ? 'hatF' : 'cuep');
      const tg = db(g.lv + 15.5) * (sub ? db(-9) : 1);
      bus.g.gain.setTargetAtTime(tg, T0, Math.max(0.01, (g.fade[0] * bar) / 3));
      const inst: Inst = {
        id: ++this.n, voice: g.voice, layer: g.layer, cycle: g.cycle, k: g.k, rate: g.rate ?? 1, g: 1,
        t0: T0, t1: g.bars ? T0 + g.bars * bar : Infinity, sched: T0, seed: (e.id.length * 0.137) % 1, dest: bus.g, tg,
      };
      if (spec.pan === 'sweep') {
        bus.p.pan.setValueAtTime(-0.6, T0);
        bus.p.pan.linearRampToValueAtTime(0.6, T0 + (g.bars ?? 2) * bar);
      }
      this.insts.push(inst);
      if (import.meta.env.DEV) this.pk = Math.max(this.pk, this.insts.filter((i) => i.t1 > T0 + 0.005).length);
      const stop = g.stop ? this.when({ mark: g.stop }, e, T0)[0] : undefined;
      if (stop !== undefined) {
        inst.t1 = stop;
        bus.g.gain.setTargetAtTime(0, stop, 0.004);
      }
      ends.push((te, cut) => {
        const fo = cut ? 1 : g.fade[1];
        this.junk.push([te + fo * bar + 3, bus.p]);
        if (stop !== undefined && te > stop) return;
        const t = Math.min(te, inst.t1);
        bus.g.gain.cancelScheduledValues(t);
        bus.g.gain.setTargetAtTime(0, t, Math.max(0.01, (fo * bar) / 3));
        inst.t1 = Math.min(inst.t1, t + fo * bar + 0.05);
      });
    } else if (g.kind === 'swell') {
      const span = Math.max(1, tEv - T0);
      const v = g.env === 'span' ? ([span * 0.45, span * 0.1, span * 0.45] as const) : g.env;
      const bus = this.bus(spec, e, sub, db(g.lv + 15.5), 20000, 'cuefx');
      const ev: Ev = { t: T0, v: g.voice, m: 0, d: v[0] + v[1] + v[2], g: 1, l: 'cuefx' };
      if (g.voice === 'sub') Object.assign(ev, { f: 36.7, x: [...v, g.glide ?? 0] });
      else if (g.voice === 'noiseSwell') ev.x = g.sweep;
      else Object.assign(ev, { m: E.score.harm.cur.pcs[0] + G3 + 12, d: Math.min(6, span) });
      E.tr.at(T0, () => E.play(ev, bus.g), e.uid);
      if (g.dip) {
        rig.padF.detune.setTargetAtTime(1200 * Math.log2(1 - g.dip), T0, span / 8);
        rig.padF.detune.setTargetAtTime(0, T0 + span / 2, span / 8);
      }
      this.drop(ends, bus.p);
      ends.push((te, cut) => cut && bus.g.gain.setTargetAtTime(0, te, bar / 3));
    } else if (g.kind === 'motif' || g.kind === 'fx') {
      const times = this.when(g.at, e, T0).filter((t) => t >= E.ctx.currentTime - 0.05);
      if (!times.length) return;
      const bus = this.bus(spec, e, sub, db(g.lv + 15.5), g.lp ?? 20000, 'cuefx', g.kind === 'motif' ? g.dx ?? 0 : 0);
      this.drop(ends, bus.p);
      const put = (ev: Ev): void => E.tr.at(ev.t, () => E.play(ev, bus.g), e.uid);
      for (const tm of times) {
        if (g.kind === 'motif') {
          this.motif(g, e, tm, step).forEach(put);
          continue;
        }
        const pitched = g.pitch !== undefined && g.pitch < 200;
        const mk = (t: number, gg: number): Ev => ({
          t, v: g.voice, m: pitched ? g.pitch! : 62, f: g.pitch && !pitched ? g.pitch : undefined,
          d: g.dur ?? 0.3, g: gg, l: 'cuefx', s: step, x: g.voice === 'rise' && g.lp ? [g.lp] : undefined,
        });
        put(mk(tm, 1));
        if (g.echo) for (let r = 1; r <= 3; r++) put(mk(tm + r * step * 3, Math.pow(g.echo, r)));
        if (g.duck) {
          for (const k of ['drone', 'pad'] as const) {
            rig.lay[k].c.gain.setTargetAtTime(db(-4), tm, 0.01);
            rig.lay[k].c.gain.setTargetAtTime(1, tm + 1.2, 0.2);
          }
        }
      }
    }
  }

  private transform(g: G<'transform'>, e: SceneEventLike, ends: End[], T0: number, bar: number, tEv: number): void {
    const rig = this.E.rig();
    const end = g.bars ? T0 + g.bars * bar : tEv;
    if (g.op === 'heldDissonance') {
      const sec = (g.until ? this.when(g.until, e, T0)[0] : undefined) ?? tEv;
      this.mods.push({ op: 'dis', t0: T0, t1: sec + this.bar(sec) / 2 });
    } else if (g.op === 'dropout') {
      const act: LayerKey[] = this.E.ctl().eBand >= 1 ? ['arp', 'bass', 'hats', 'kick', 'melody'] : ['arp', 'bass', 'melody'];
      this.when(g.at ?? 'now', e, T0).forEach((t, i) => {
        const p = rig.lay[act[i % act.length]].b.gain;
        p.setTargetAtTime(0, t, 0.01);
        p.setTargetAtTime(1, t + bar, bar / 6);
      });
    } else if (g.op === 'cutLayer') {
      const t = this.when(g.at ?? 'now', e, T0)[0];
      const pulse = this.insts.find((i) => i.layer !== 'hats' && i.t0 <= t && i.t1 > t);
      const p = pulse ? (pulse.dest as GainNode).gain : rig.lay.arp.b.gain;
      p.setTargetAtTime(0, t, 0.002);
      if (!pulse || pulse.t1 > t + 4 * bar) p.setTargetAtTime(pulse ? pulse.tg : 1, t + 4 * bar, bar / 3);
    } else {
      this.mods.push({ op: g.op, t0: T0, t1: end });
      if (g.op === 'part') {
        rig.lay.cuep.c.gain.setTargetAtTime(db(-6), T0, bar / 6);
        rig.lay.cuep.c.gain.setTargetAtTime(1, end, bar / 6);
      }
      ends.push((te, cut) => {
        if (cut) for (const m of this.mods) if (m.t1 > te) m.t1 = te;
      });
    }
  }

  motif(g: G<'motif'>, e: SceneEventLike, tm: number, step: number): Ev[] {
    const sc = this.E.score;
    const m = sc.harm.m;
    const def = this.E.profile.motifs[g.motif];
    const out: Ev[] = [];
    if (!def) return out;
    const base = idxNear(m, def.centre ?? 74) + (g.octave ?? 0) * 7;
    const add = (p: number, s: number, l: number, extra?: Partial<Ev>): void => {
      out.push({ t: tm + s * step, v: g.voice, m: midiOf(m, base + p), d: l * step, g: 1, l: 'cuefx', ...extra });
    };
    if (def.chord) {
      const tones: number[] = [];
      for (const pc of sc.harm.cur.pcs) for (let k = -24; k <= 36; k += 12) if (G3 + pc + k >= def.chord[0] && G3 + pc + k <= def.chord[1]) tones.push(G3 + pc + k);
      (g.hits ?? [0]).forEach((s, i) => out.push({ t: tm + s * step, v: g.voice, m: tones[i % 2] ?? 60, d: step * 2, g: 1, l: 'cuefx' }));
    } else if (def.dna !== undefined) {
      const dna = sc.mel.dna[def.dna];
      const k = g.augment ?? 1;
      for (const n of def.take ? dna.slice(0, def.take) : dna) add(n.p, n.s * k, n.l * k, g.detune ? { x: [g.detune] } : undefined);
    } else {
      const ps = def.ps!.slice();
      let s = 0;
      const ss = def.rhythm ? this.R.map((r) => (s += r) - r) : def.ss!;
      if (def.signed) ps[0] = this.permit;
      const late = def.late;
      const T = late ? late.states.indexOf(sc.state) : -1;
      const verdict = late && T >= 0 ? e.marks.find((x) => x.name === late.mark) : undefined;
      if (late && verdict) ps[late.at] = late.ps[T];
      if (g.mode === 'minor') ps[1] = ps[ps.length - 1] = 1;
      ps.forEach((p, i) =>
        add(
          p + (g.mode === 'minor' ? -7 : 0), ss[i], def.rhythm ? this.R[i] : (def.lens?.[i] ?? def.len ?? 0),
          late && verdict && i === late.at ? { t: this.E.cx(verdict.at) } : undefined,
        ),
      );
    }
    return out;
  }
}
