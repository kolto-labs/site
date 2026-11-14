// The only engine access for this placement. Switch to the engine facade (engine/index.ts) once it lands.
import type { Director } from '../../engine/director/director';
import type { MotionApi } from '../../engine/motion/index';
import { pageKeyFor } from '../../routes';

export interface EngineHandle {
  motion: MotionApi;
  director: Director;
}

let p: Promise<EngineHandle> | null = null;

export function engine(): Promise<EngineHandle> {
  return (p ??= (async () => {
    const [{ getBus }, { getLatent }, { getDirector, visitSeed }, { getMotion }] = await Promise.all([
      import('../../engine/signals/bus'),
      import('../../engine/state/latent'),
      import('../../engine/director/director'),
      import('../../engine/motion/index'),
    ]);
    const bus = getBus();
    bus.start({ route: pageKeyFor(location.pathname) });
    const seed = visitSeed();
    const director = getDirector(seed);
    const latent = getLatent(seed);
    director.start();
    const motion = getMotion({ bus, latent, director, clock: bus.clock, beat: () => null });
    return { motion, director };
  })().catch((e) => {
    p = null;
    throw e;
  }));
}
