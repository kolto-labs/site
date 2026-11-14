import type { EventId, WorldStateId } from '../core/types';
import { buildBg, xf } from './art';
import type { Bg } from './art';
import { beatPos } from './gait';
import type { Beat, Env, Lat, Ptr } from './kit';
import { cl } from './kit';
import { L } from './layout';
import { MOTION } from './map';
import { createSim } from './sim';
import type { Sim } from './sim';
import { render } from './view';
import type { MotionDeps, MountOpts, Placement } from './types';

interface View {
  id: string;
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  crop: number;
  bg: Bg | null;
  vis: boolean;
  ok: boolean;
  io: IntersectionObserver | null;
  ro: ResizeObserver | null;
}

const STATES: readonly WorldStateId[] = ['R0', 'R1', 'R2', 'R3', 'T1', 'T2', 'T3'];
const CROP = { all: 0, city: 1, rift: 2 } as const;
const STAGE_H = [L.H, L.wl + 16, L.H - L.wl + 2];

const AMBIENT_OF: Record<string, readonly EventId[]> = {
  R0: ['V1', 'F1', 'A1', 'A2', 'A3'],
  R1: ['V1', 'F1', 'A1', 'A2', 'A3'],
  R2: ['V1', 'F1', 'A1', 'A2', 'A3'],
  R3: ['V1x', 'A1', 'A2', 'A3'],
  T: ['V1', 'F1', 'A1', 'A2', 'A3'],
};

const stills = new Map<string, Sim>();

function stillSim(state: WorldStateId): Sim {
  let S = stills.get(state);
  if (S) return S;
  const idx = STATES.indexOf(state);
  const neutral: Lat = { E: 0.15, T: 0.2, F: 0.5, Q: 0.2, P: 1 };
  const env: Env = {
    seed: (0x6b6f6c74 + idx * 0x9e3779b1) >>> 0, state, lat: () => neutral, beat: () => null, pointer: () => null, reduced: () => false,
  };
  S = createSim(env, MOTION, AMBIENT_OF[state[0] === 'T' ? 'T' : state]);
  S.open = 1;
  for (let t = 0; t <= 8; t++) S.advance(t);
  stills.set(state, S);
  return S;
}

export interface Scene {
  mount(canvas: HTMLCanvasElement, o: MountOpts): Placement;
  dispose(): void;
}

export function createScene(d: MotionDeps): Scene {
  const { bus, director: dir, clock, latent } = d;
  const world = dir.world();
  const lat: Lat = { E: 0, T: 0, F: 0, Q: 0, P: 1 };
  const ptr: Ptr = { x: 0, y: 0, vx: 0, active: false };
  const bt: Beat = { bpm: 0, pos: 0 };
  const views = new Set<View>();
  const placements = new Set<() => void>();
  const effectiveCrop = (crop: number): number => world.state[0] === 'T' ? CROP.rift : crop;
  let reduced = bus.frame().env.reducedMotion;
  let cur: View | null = null;
  let running = false;
  let lastT = 0;
  let lastX = 0;
  let tick = 0;
  let disposed = false;

  const env: Env = {
    seed: world.seed,
    state: world.state,
    lat() {
      const s = latent.get();
      lat.E = s.energy.slow;
      lat.T = s.tension.slow;
      lat.F = s.focus.slow;
      lat.Q = s.curiosity.slow;
      lat.P = s.presence;
      return lat;
    },
    beat() {
      const b = d.beat?.();
      if (!b) return null;
      bt.bpm = b.bpm;
      bt.pos = beatPos(b);
      return bt;
    },
    pointer: () => (cur && ptr.active ? ptr : null),
    reduced: () => reduced,
  };
  const sim = createSim(env, MOTION, world.ambient, import.meta.env.DEV ? (m) => console.error(m) : undefined);
  const unsubs = [
    dir.on((e) => (e.phase === 'start' ? sim.start(e) : sim.end(e))),
    bus.on('reducedMotion', (e) => {
    reduced = e.on;
    if (reduced) {
      sim.reset();
      sim.open = 1;
      for (const v of views) paint(v);
    } else ensure();
    }),
    clock.onVisibility((vis) => {
    if (vis) ensure();
    }),
  ];

  function free(v: View): void {
    if (!v.bg) return;
    v.bg.base.width = v.bg.base.height = v.bg.murk.width = v.bg.murk.height = 0;
    v.bg = null;
  }

  function size(v: View): boolean {
    // Trial states live in the Rift, even when a placement was designed for the city crop.
    const crop = effectiveCrop(v.crop);
    const r = Math.max(1, devicePixelRatio || 1);
    const w = v.canvas.clientWidth * r;
    const h = v.canvas.clientHeight * r;
    if (w < 8 || h < 8) return false;
    const sh = STAGE_H[crop];
    let P = cl(Math.floor(Math.min(w / L.W, h / sh)), 1, 4 * Math.ceil(r));
    P = Math.max(P, Math.ceil(w / 640));
    const W = Math.ceil(w / P);
    const H = Math.ceil(h / P);
    if (v.canvas.width !== W || v.canvas.height !== H || !v.bg) {
      free(v);
      v.canvas.width = W;
      v.canvas.height = H;
      v.canvas.style.imageRendering = 'pixelated';
      v.bg = buildBg(xf(W, H, crop), world.state);
    }
    return true;
  }

  function paint(v: View): void {
    if (!v.ok || !v.bg) return;
    render(v.g, reduced ? stillSim(world.state) : sim, v.bg, reduced);
  }

  function track(): void {
    const pf = bus.frame().pointer;
    cur = null;
    ptr.active = false;
    if (!pf.inside) return;
    for (const v of views) {
      if (v.id !== pf.inside || !v.bg) continue;
      const r = v.canvas.getBoundingClientRect();
      const ax = ((pf.x * innerWidth - r.left) / r.width) * v.bg.f.W - v.bg.f.ox;
      const ay = v.bg.f.iy(((pf.y * innerHeight - r.top) / r.height) * v.bg.f.H);
      const t = clock.now();
      const dt = Math.max(t - lastT, 1e-3);
      ptr.vx += ((ax - lastX) / dt - ptr.vx) * 0.3;
      lastX = ax;
      lastT = t;
      ptr.x = ax;
      ptr.y = ay;
      ptr.active = pf.fine && (pf.still >= 1.5 || pf.speed < 0.05);
      cur = v;
    }
  }

  function frame(): void {
    if (reduced || clock.hidden()) {
      running = false;
      return;
    }
    let any = false;
    for (const v of views) if (v.vis && v.ok) any = true;
    if (!any) {
      running = false;
      return;
    }
    requestAnimationFrame(frame);
    track();
    if (!sim.advance(clock.now())) return;
    if (bus.frame().env.tier === 'lite' && (tick++ & 1)) return;
    for (const v of views) if (v.vis) paint(v);
  }

  function ensure(): void {
    if (running || reduced || clock.hidden()) return;
    for (const v of views) {
      if (v.vis && v.ok) {
        running = true;
        requestAnimationFrame(frame);
        return;
      }
    }
  }

  const ids = (crop: number): EventId[] =>
    (Object.keys(MOTION) as EventId[]).filter((k) => crop === 0 || MOTION[k].lay & crop || MOTION[k].lay === 3);

  const api: Scene = {
    mount(canvas, o) {
      const g = canvas.getContext('2d', { alpha: false });
      if (!g || o.signal?.aborted) return { dispose() {}, redraw() {} };
      const crop = CROP[o.crop ?? 'all'];
      const v: View = { id: o.id, canvas, g, crop, bg: null, vis: typeof IntersectionObserver === 'undefined', ok: false, io: null, ro: null };
      views.add(v);
      const host = o.host ?? canvas;
      if (typeof IntersectionObserver !== 'undefined') {
        v.io = new IntersectionObserver((es) => {
          v.vis = es[es.length - 1].isIntersecting;
          ensure();
        });
        v.io.observe(host);
      }
      const relayout = (): void => {
        v.ok = size(v);
        if (v.ok) paint(v);
        ensure();
      };
      if (typeof ResizeObserver !== 'undefined') {
        v.ro = new ResizeObserver(relayout);
        v.ro.observe(canvas);
      }
      const un = dir.views.register({
        id: o.id,
        renders: ids(effectiveCrop(crop)),
        visible: () => v.vis && v.ok,
        screenX(e) {
          const a = sim.primary(e.uid);
          const ax = a ? a.x : MOTION[e.id].ax;
          if (ax === undefined || !v.bg) return null;
          const r = v.canvas.getBoundingClientRect();
          return r.left + ((v.bg.f.ox + ax) / v.bg.f.W) * r.width;
        },
        rect() {
          const r = v.canvas.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        },
      });
      const lost = (e: Event): void => {
        e.preventDefault();
        v.ok = false;
        free(v);
      };
      canvas.addEventListener('contextlost', lost);
      canvas.addEventListener('contextrestored', relayout);
      let done = false;
      const dispose = (): void => {
        if (done) return;
        done = true;
        un();
        v.io?.disconnect();
        v.ro?.disconnect();
        canvas.removeEventListener('contextlost', lost);
        canvas.removeEventListener('contextrestored', relayout);
        o.signal?.removeEventListener('abort', dispose);
        views.delete(v);
        placements.delete(dispose);
        free(v);
        if (cur === v) cur = null;
      };
      placements.add(dispose);
      o.signal?.addEventListener('abort', dispose);
      relayout();
      return { dispose, redraw: relayout };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const unsub of unsubs) unsub();
      for (const dispose of placements) dispose();
      running = false;
    },
  };
  if (import.meta.env.DEV) Object.assign(globalThis, { __koltoMotion: { sim, views, api, paint } });
  return api;
}
