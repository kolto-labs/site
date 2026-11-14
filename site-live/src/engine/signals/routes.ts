import type { PageKey } from '../core/types';
import type { Hub, Sensor } from './bus';
import { Leaky, clamp01, nsat } from './maths';

export interface RoutesSensor extends Sensor {
  notify(to: PageKey, pop: boolean, t: number): void;
}

/** Conditional entropy of the next route given the current one, over log2(8). */
export function routeEntropy(history: readonly PageKey[]): number {
  const n = history.length - 1;
  if (n < 1) return 0;
  const pairs = new Map<string, number>();
  const from = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const k = history[i] + '>' + history[i + 1];
    pairs.set(k, (pairs.get(k) ?? 0) + 1);
    from.set(history[i], (from.get(history[i]) ?? 0) + 1);
  }
  let h = 0;
  for (const [k, c] of pairs) h -= (c / n) * Math.log2(c / from.get(k.slice(0, k.indexOf('>')))!);
  return clamp01(h / 3);
}

/** Route dwell (weighted by presence), route rate, new routes and route entropy. */
export function createRoutes(hub: Hub, onChange: () => void): RoutesSensor {
  const r = hub.frame.route;
  const dw = hub.frame.dwell;
  const hist = r.history as PageKey[];
  const seen = new Set<PageKey>();
  const rate = new Leaky(60);
  const fresh = new Leaky(180);
  let known = false;
  let dRoute = 0;
  let popAt = -Infinity;

  return {
    notify(to, pop, t) {
      const isPop = pop || t - popAt < 1;
      popAt = -Infinity;
      if (!known) {
        // the first route of the visit sets the start; it isn't a change
        known = true;
        r.key = to;
        hist.push(to);
        seen.add(to);
        hub.emit({ type: 'route', t, from: null, to, pop: isPop });
        return;
      }
      if (to === r.key) return; // same page, e.g. a hash change
      const from = r.key;
      r.key = to;
      hist.push(to);
      if (hist.length > 32) hist.shift();
      rate.hit(t);
      if (!seen.has(to)) {
        seen.add(to);
        fresh.hit(t);
      }
      dRoute = 0;
      r.entropy = routeEntropy(hist);
      hub.maskScroll(0.6);
      onChange();
      hub.emit({ type: 'route', t, from, to, pop: isPop });
    },
    start(signal) {
      window.addEventListener('popstate', () => {
        popAt = hub.clock.now();
      }, { passive: true, signal });
    },
    stop() {},
    tick(t, dt) {
      dRoute += hub.frame.presence.p * dt;
      dw.route = dRoute;
      dw.g = 1 - Math.exp(-dRoute / 90);
      const rr = rate.rate(t);
      const nr = fresh.rate(t);
      r.rate = nsat(rr, 1 / 20);
      r.newRoutes = nsat(nr, 1 / 60);
      if (import.meta.env.DEV) {
        hub.raw.routeRate = rr;
        hub.raw.newRouteRate = nr;
      }
    },
  };
}
