import type { DimLike, SignalSnapshot, Treatment } from '../index';

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const value = (x: DimLike | undefined, fallback: number): number =>
  typeof x === 'number' ? x : typeof x === 'function' ? x() : x?.value ?? fallback;

/** Maps only coarse, in-memory signals to the narrow Classic light-treatment range. */
export function classicTreatment(s: SignalSnapshot): Treatment {
  const y = clamp(s.pointer?.y ?? 0.5, 0, 1);
  const daylight = clamp(s.daylight ?? 0.5, 0, 1);
  const depth = clamp(s.scroll?.depth ?? 0, 0, 1);
  const energy = clamp(value(s.latent?.energy, 0.25), 0, 1);
  const curiosity = clamp(value(s.latent?.curiosity, 0.4), 0, 1);
  const centeredY = Math.abs(y - 0.5) <= 0.1 ? 0 : Math.sign(0.5 - y) * (Math.abs(y - 0.5) - 0.1) / 0.4;
  return {
    mode: 'light',
    tilt: clamp(1.4 * centeredY + 1.2 * (daylight - 0.5), -2, 2),
    width: clamp(0.8 + 0.3 * curiosity, 0.8, 1.1),
    send: clamp(-30 + 9 * depth + 3 * (1 - energy), -30, -18),
    level: clamp((energy - 0.5) * 3, -1.5, 1.5),
  };
}
