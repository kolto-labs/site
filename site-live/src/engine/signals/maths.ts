export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** EMA step weight for an irregular interval: 1 − exp(−Δt/τ). */
export const alpha = (dt: number, tau: number): number => (dt > 0 ? 1 - Math.exp(-dt / tau) : 0);

/** y ← y + α·(x − y). The same result whatever the sample rate. */
export const ema = (y: number, x: number, dt: number, tau: number): number => y + alpha(dt, tau) * (x - y);

/** clamp(ln(x/x0) / ln(x1/x0), 0, 1); 0 for x ≤ 0. */
export const nlog = (x: number, x0: number, x1: number): number =>
  x > 0 ? clamp01(Math.log(x / x0) / Math.log(x1 / x0)) : 0;

/** 1 − exp(−x/k); 0 for x ≤ 0. */
export const nsat = (x: number, k: number): number => (x > 0 ? 1 - Math.exp(-x / k) : 0);

export const median3 = (a: number, b: number, c: number): number =>
  Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));

/** Leaky event counter. `rate` is in events per second. */
export class Leaky {
  private c = 0;
  private t = 0;
  constructor(readonly tau: number) {}

  hit(t: number): void {
    const dt = t - this.t;
    this.c = (dt > 0 ? this.c * Math.exp(-dt / this.tau) : this.c) + 1;
    if (dt > 0) this.t = t;
  }

  rate(t: number): number {
    const dt = t - this.t;
    return ((dt > 0 ? this.c * Math.exp(-dt / this.tau) : this.c) / this.tau);
  }

  reset(): void {
    this.c = 0;
  }
}

/** An EMA that remembers when it was last fed, for irregular samples. */
export class Ema {
  constructor(
    readonly tau: number,
    public y = 0,
    public t = 0,
  ) {}

  push(x: number, t: number): number {
    this.y = ema(this.y, x, t - this.t, this.tau);
    if (t > this.t) this.t = t;
    return this.y;
  }
}
