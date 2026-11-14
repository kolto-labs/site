import type { Director, MotionApi, SceneEvent, Unsubscribe } from '../engine';
import { whenEngine } from '../engine';

export type { SceneEvent };

export interface HeroView {
  visible(): boolean;
  rect(): DOMRect;
  screenX(e: SceneEvent): number | null;
  scene(e: SceneEvent): void;
}

export interface HeroLink {
  gait(kind: 'suit' | 'selkath', id: number): { speed: number; halfStride: number } | null;
  progress(e: SceneEvent): number;
  now(): number;
  dispose(): void;
}

const classic = (): number => (globalThis as { __koltoPulse?: () => number }).__koltoPulse?.() ?? 0;
let source: () => number = classic;

export function setHeroPulse(fn: (() => number) | null): void {
  source = fn ?? classic;
}

export const pulse = (): number => source();

export function linkHero(v: HeroView): HeroLink {
  let director: Director | null = null;
  let motion: MotionApi | null = null;
  let offs: Unsubscribe[] = [];
  let dead = false;
  whenEngine()
    .then((e) => {
      if (dead) return;
      director = e.director;
      offs = [
        e.director.views.register({ id: 'hero', renders: ['F2', 'S1'], visible: v.visible, rect: v.rect, screenX: v.screenX }),
        e.director.on((x) => {
          if (x.id === 'F2' || x.id === 'S1') v.scene(x);
        }),
      ];
      return e.motion().then((m) => {
        if (!dead) motion = m;
      });
    })
    .catch(() => undefined);
  return {
    gait: (kind, id) => (motion ? motion.gait(kind, id) : null),
    progress: (e) => (director ? director.progress(e) : 1),
    now: () => (director ? director.now() : 0),
    dispose() {
      dead = true;
      for (const off of offs) off();
      offs = [];
    },
  };
}
