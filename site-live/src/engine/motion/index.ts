import { dropSlot, slot } from '../core/global';
import type { Lat } from './kit';
import { beatPos, gaitOf, idleEase, lockStride, npcZ } from './gait';
import { enforceInvariants } from './invariants';
import type { Scene } from './scene';
import { steer } from './steering';
import type { MotionApi, MotionDeps, Placement } from './types';

export type { MotionApi, MotionDeps, MountOpts, Placement } from './types';
export type { Agent, Actor } from './kit';
export { actor } from './kit';

export function getMotion(d: MotionDeps): MotionApi {
  return slot('motion', () => api(d));
}

const scene = (d: MotionDeps): Promise<Scene> =>
  slot('motionScene', () =>
    import('./scene')
      .then((m) => m.createScene(d))
      .catch((e) => {
        dropSlot('motionScene');
        throw e;
      }),
  );

const none: Placement = { dispose() {}, redraw() {} };

function api(d: MotionDeps): MotionApi {
  const lat: Lat = { E: 0, T: 0, F: 0, Q: 0, P: 1 };
  let idle = 1;
  let last = 0;
  return {
    gait(kind, id) {
      const s = d.latent.get();
      lat.E = s.energy.slow;
      lat.T = s.tension.slow;
      lat.F = s.focus.slow;
      lat.Q = s.curiosity.slow;
      lat.P = s.presence;
      const now = d.clock.now();
      idle = idleEase(idle, lat.P, now - last);
      last = now;
      const g = gaitOf(lat, kind, npcZ(d.director.world().seed, id), idle);
      const b = d.beat?.();
      if (b) g.halfStride = lockStride(g, { bpm: b.bpm, pos: beatPos(b) }).l;
      return g;
    },
    steer,
    enforceInvariants,
    async mount(canvas, o) {
      const s = await scene(d);
      return o.signal?.aborted || !canvas.isConnected ? none : s.mount(canvas, o);
    },
  };
}
