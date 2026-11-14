import type { BeatInfo, GeneratedSource, SourceBegin, SourceHost } from '../../index';
import { mulberry32 } from '../../core/rng';
import type { Transport } from '../../core/transport';
import { Conductor } from './conductor';
import type { Env } from './conductor';
import type { Shared } from './mixer';
import { Mixer, makeShared } from './mixer';
import type { ScoreProfile } from './profile';
import type { BarPlan, Ev, Inst } from './score';
import { Score } from './score';
import { clampN } from './theory';
import type { Rig } from './voices';
import { VOICES, dest } from './voices';

const KEEP = ['kick', 'bass', 'bassSaw', 'sub', 'pad'];
const TAIL: Readonly<Record<string, number>> = { bell: 1.3, cluster: 1.4, boom: 1.3, station: 0.45, impact: 0.45, ping: 0.4, sonar: 0.4 };
const rank = (l: string): number => (l === 'hats' ? 0 : l === 'cuefx' ? 1 : l === 'arp' ? 2 : 3);

type Row = { t: number; at: number; v: string; l: string; d: number; w: number };
interface Live {
  t: number;
  end: number;
  w: number;
  r: number;
  q: number;
  sg: GainNode | null;
  o?: Inst;
  row?: Row;
}

export function createSource(h: SourceHost & { profile: ScoreProfile }): GeneratedSource {
  const { ctx, profile: P } = h;
  const score = new Score(h.seed, P);
  const shared: Shared = makeShared(ctx, mulberry32(h.seed ^ 0x5bd1e995), h.master.hp, h.master.ui);
  let rig: Mixer | null = null;
  let cond: Conductor | null = null;
  let tr: Transport<BarPlan, Ev> | null = null;
  let cap = 24;
  let live: Live[] = [];
  let lpAt = 0;
  let kept: { R: readonly number[]; permit: number } | null = null;
  let lastFill = -9;
  let barCount = 0;
  let depthLoad: Promise<void> | null = null;
  let light = false;
  const dbg = { dropped: 0, shed: 0, peak: 0, log: [] as Row[] };

  const load = (a: number): number => live.reduce((n, x) => (x.t <= a && x.end > a ? n + x.w : n), 0);

  const admit = (e: Ev, w: number, end: number, keep: boolean, r: number): boolean => {
    const pts = [e.t, ...live.filter((x) => x.t > e.t && x.t < end).map((x) => x.t)].sort((a, b) => a - b);
    for (const a of pts) {
      while (load(a) + w > cap) {
        const c = live.filter((x) => x.sg && x.t <= a && x.end > a && x.r <= r);
        if (!c.length) {
          if (keep) break;
          return false;
        }
        const x = c.reduce((p, k) => ((k.r - p.r || k.q - p.q || k.t - p.t) < 0 ? k : p));
        x.sg!.gain.setTargetAtTime(0, a, 0.005);
        x.sg = null;
        x.end = a + 0.02;
        if (import.meta.env.DEV && x.row) x.row.d = Math.max(0, a - x.t - 0.03);
      }
    }
    if (import.meta.env.DEV) for (const a of pts) dbg.peak = Math.max(dbg.peak, load(a) + w);
    return true;
  };

  const play = (e: Ev, to: AudioNode): void => {
    const v = VOICES[e.v];
    if (!v || !rig || rig.gone) return;
    const now = ctx.currentTime;
    if (e.t < now - 0.01 && e.v !== 'sub' && e.v !== 'pad') {
      if (import.meta.env.DEV) dbg.dropped++;
      return;
    }
    live = live.filter((x) => x.end > now);
    const keep = KEEP.includes(e.v);
    const w = e.v === 'pad' ? (e.x?.length ?? 3) : 1;
    const q = e.g * (to instanceof GainNode ? to.gain.value : 1);
    const end = e.t + Math.max(e.d, TAIL[e.v] ?? 0) + 0.05;
    if (!admit(e, w, end, keep, keep ? 9 : rank(e.l))) {
      if (import.meta.env.DEV) dbg.shed++;
      return;
    }
    const sg = keep ? null : ctx.createGain();
    sg?.connect(to);
    let dest = sg ?? to;
    let panNode: StereoPannerNode | null = null;
    if (e.p !== undefined) {
      panNode = ctx.createStereoPanner();
      panNode.pan.setValueAtTime(clampN(e.p, -1, 1), e.t);
      panNode.connect(dest);
      dest = panNode;
    }
    v(rig, dest, e);
    if (panNode) window.setTimeout(() => panNode?.disconnect(), Math.max(1000, (e.d + 2) * 1000));
    const row: Row | undefined = import.meta.env.DEV ? { t: e.t, at: now, v: e.v, l: e.l, d: e.d, w } : undefined;
    if (row) {
      dbg.log.push(row);
      if (dbg.log.length > 500) dbg.log.shift();
    }
    live.push({ t: e.t, end, w, r: rank(e.l), q, sg, o: e.inst, row });
  };

  const sink = {
    bar(b: BarPlan): void {
      rig!.applyPar(b.par, b.t, b.step);
      cond!.onBar(b);
      h.bar(b.n, h.fromCx(b.t));
      if (!depthLoad) {
        depthLoad = Promise.all([import('./depth/form'), import('./depth/harmony'), import('./depth/layers'), import('./depth/variation')]).then(([f, y, l, v]) => {
          const form = f.createForm(h.seed, { centres: P.centres, visit: h.visit, lite: light });
          score.attachDepth(form, y.createHarmony(h.seed, P, form));
          score.attachLayers(new l.Layers(h.seed, light));
          score.attachVariation(v);
        }).catch(() => {
          depthLoad = null;
        });
      }
    },
    play(e: Ev): void {
      const to = e.inst?.dest ?? dest(rig!, e);
      play(e, to);
    },
  };

  const snapTo = (f: (t: number) => number) => (te: number): number => (tr && tr.bars.length ? Math.max(te, h.fromCx(f(h.cx(te)))) : te);
  const snapDown = snapTo((t) => tr!.downbeatAtOrAfter(t));
  const snapBeat = snapTo((t) => tr!.beatAtOrAfter(t));

  const wake = (): void => {
    if (!tr || !rig) return;
    const now = ctx.currentTime;
    tr.wake();
    cond!.poll(now);
    const c = h.ctl();
    let fc = 1200 * Math.pow(2, 2.1 * (0.6 * c.eFast + 0.4 * (1 - c.fV)));
    const cp = P.states[score.state]?.lpCap;
    if (cp) fc = Math.min(fc, cp);
    if (now - lpAt < 0.1) return;
    lpAt = now;
    rig.stateLP.frequency.setTargetAtTime(clampN(fc, 400, 9000), now, 0.3);
  };

  const source: GeneratedSource = {
    begin(a: SourceBegin, at?: number): void {
      light = a.lite;
      cap = a.lite ? 12 : 24;
      live = [];
      lpAt = 0;
      if (rig) rig.retire(ctx.currentTime);
      rig = new Mixer(shared, mulberry32(h.seed ^ 0x1b873593), a.lite, P);
      const env: Env = {
        ctx,
        rig: () => rig!,
        score,
        get tr() {
          return tr!;
        },
        profile: P,
        specs: h.specs,
        loc: h.loc,
        cx: h.cx,
        play,
        cut(i, t) {
          for (const x of live) if (x.o === i) x.end = x.t >= t ? x.t : Math.min(x.end, t + 0.02);
        },
        ctl: h.ctl,
      };
      tr = new h.Transport<BarPlan, Ev>(
        () => ctx.currentTime,
        (n, t) => score.plan(n, t, h.ctl(), cond!.mods),
        sink,
        (to) => {
          for (const it of cond!.insts) {
            const end = Math.min(to, it.t1);
            if (it.sched >= end) continue;
            for (const e of score.pulses(it, tr!.bars, it.sched, end, h.ctl(), cond!.mods)) sink.play(e);
            it.sched = end;
          }
        },
      );
      cond = new Conductor(env, score.mo, kept ?? undefined);
      kept = { R: cond.R, permit: cond.permit };
      score.setState(a.state ?? P.initial, true);
      score.route = a.route ?? P.home;
      rig.setRoute(score.route, ctx.currentTime, 0.01);
      const t0 = Math.max(ctx.currentTime + 0.1, at ?? 0);
      tr.start(t0);
      tr.n = barCount;
      rig.music.gain.setValueAtTime(0.0001, ctx.currentTime);
      rig.music.gain.setTargetAtTime(a.level, ctx.currentTime, 0.5);
      wake();
      cond.ambient(a.ambient);
    },
    end(at?: number, fade = 0.3): void {
      cond?.endAmbient();
      if (rig && !rig.gone) {
        rig.retire(Math.max(ctx.currentTime, at ?? 0), fade);
      }
      if (tr) barCount = tr.n;
      tr?.jobs.splice(0);
    },
    wake,
    route(to: string): void {
      if (!rig || !tr) return;
      const now = ctx.currentTime;
      const b = tr.barAt(now);
      const tb = tr.bars.find((r) => r.t >= now + 0.08)?.t ?? tr.next;
      rig.setRoute(to, tb, (b ? b.dur : 2) / 4);
      score.setRoute(to, tr.n);
      const beat = b ? b.step * 4 : 0.5;
      if (tb - now >= beat && tr.n - lastFill >= 2) {
        lastFill = tr.n;
        const hat = score.rh() < 0.5;
        const s = b ? b.step : 0.13;
        const r = (score.voiced[0] ?? 57) + 12;
        for (let i = 0; i < 4; i++) {
          const t = tb - beat + i * s;
          sink.play(hat ? { t, v: 'hat', m: 0, d: 0.03, g: 0.7, l: 'hats' } : { t, v: 'arp', m: 0, d: s * 0.8, g: 0.8, l: 'arp', x: [r + i * 3, r + i * 3, r + i * 3], s });
        }
      }
    },
    duck(v: number, tau: number): void {
      rig?.duck(v, tau);
    },
    cueStart(e) {
      cond?.start(e);
    },
    cueEnd(uid, cut) {
      cond?.end(uid, cut);
    },
    ambient(ids) {
      cond?.ambient(ids);
    },
    setState(s) {
      score.setState(s, true);
    },
    blip(kind: 'ok' | 'tick'): void {
      const to = shared.ui;
      const u: Rig = { ...shared, wd: rig?.wd ?? [], kicks: [], padL: to, padR: to, arpF: to, hatF: to, layer: () => to };
      const t = ctx.currentTime + 0.01;
      if (kind === 'ok') {
        for (const [dt, g, f] of [[0, 0.6, 784], [0.1, 0.5, 1175], [0.27, 0.15, 1175]]) VOICES.ping(u, to, { t: t + dt, v: 'ping', m: 0, d: 0.3, g, l: 'cuefx', f });
      } else VOICES.droplet(u, to, { t, v: 'droplet', m: 0, d: 0.07, g: 0.6, l: 'cuefx' });
    },
    pulse(): number {
      if (!rig) return 0;
      return rig.pulse(ctx.currentTime - (ctx.outputLatency ?? ctx.baseLatency ?? 0));
    },
    beat(): BeatInfo | null {
      if (!tr) return null;
      const now = ctx.currentTime;
      const b = tr.barAt(now);
      if (!b) return null;
      const beatLen = b.step * 4;
      const k = Math.max(0, (now - b.t) / beatLen);
      return {
        bar: b.n,
        beat: Math.floor(k),
        phase: k - Math.floor(k),
        bpm: b.bpm,
        meter: b.meter === 14 ? 14 : 16,
        nextDownbeat: h.fromCx(b.t + b.dur),
      };
    },
    nextDownbeat: snapDown,
    nextBeat: snapBeat,
  };
  if (import.meta.env.DEV) {
    source.debug = () => ({
      skippedBars: tr?.skipped ?? 0,
      dropped: dbg.dropped,
      lastMaxSim: score.mel.lastMaxSim,
      noveltyFallbacks: score.mel.fallbacks,
      lfoPhases: score.phases,
      chord: 'd' + score.harm.cur.deg,
      mode: score.state,
      log: dbg.log,
      transport: tr,
      score,
      bpm: score.bpm,
      shared,
      rig,
      cond,
      peak: dbg.peak,
      shed: dbg.shed,
    });
  }
  return source;
}
