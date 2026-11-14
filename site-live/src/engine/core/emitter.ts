import type { Unsubscribe } from './types';

type Fn<A, B, C> = (a: A, b: B, c: C) => void;

function rethrow(err: unknown): void {
  setTimeout(() => {
    throw err;
  }, 0);
}

/**
 * Tiny typed emitter with up to three arguments. `emit` allocates nothing.
 * Removing a listener during an emit is safe; listeners added during an emit
 * start with the next one. A listener that throws doesn't stop the others.
 */
export class Emitter<A = void, B = void, C = void> {
  private fns: (Fn<A, B, C> | null)[] = [];
  private depth = 0;
  private holes = 0;

  on(fn: Fn<A, B, C>): Unsubscribe {
    this.fns.push(fn);
    let live = true;
    return () => {
      if (!live) return;
      live = false;
      const i = this.fns.indexOf(fn);
      if (i < 0) return;
      if (this.depth > 0) {
        this.fns[i] = null;
        this.holes++;
      } else {
        this.fns.splice(i, 1);
      }
    };
  }

  emit(a: A, b: B, c: C): void {
    const fns = this.fns;
    const n = fns.length;
    this.depth++;
    for (let i = 0; i < n; i++) {
      const f = fns[i];
      if (f === null) continue;
      try {
        f(a, b, c);
      } catch (err) {
        rethrow(err);
      }
    }
    if (--this.depth === 0 && this.holes > 0) {
      let w = 0;
      for (let r = 0; r < fns.length; r++) if (fns[r] !== null) fns[w++] = fns[r];
      fns.length = w;
      this.holes = 0;
    }
  }

  clear(): void {
    if (this.depth > 0) {
      for (let i = 0; i < this.fns.length; i++) if (this.fns[i] !== null) {
        this.fns[i] = null;
        this.holes++;
      }
    } else {
      this.fns.length = 0;
      this.holes = 0;
    }
  }
}
