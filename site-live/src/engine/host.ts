import { getBus } from './signals/bus';
import type { PageKey } from './core/types';

/** Application-shell signal producers. Placement components must use engine/index.ts. */
export function notifyRoute(to: PageKey, pop: boolean): void {
  getBus().notifyRoute(to, pop);
}

export function markProgrammaticScroll(ms?: number): void {
  getBus().markProgrammaticScroll(ms);
}

export function notifyHotkey(kind: 'nav' | 'toggle'): void {
  getBus().notifyHotkey(kind);
}
