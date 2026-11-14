import type { Hub, Sensor } from './bus';
import { isTypingTarget } from '../../lib/dom';
import { Ema, Leaky, alpha, clamp01, ema, median3, nlog, nsat } from './maths';

const HOVER_SEL = 'a, button, summary, [role=button], [data-hover]';
const RING = 20; // 1 s at 20 Hz
const HOVER_RING = 32;

/** Pointer position and derivatives, path straightness, hover exploration, touch taps and clicks. */
export function createPointer(hub: Hub): Sensor {
  const f = hub.frame.pointer;
  const fc = hub.frame.clicks;
  const raw = hub.raw;
  const now = (ms: number) => hub.clock.fromPerf(ms);

  // Last accepted sample of the derivative chain (client px, engine s).
  let sx = 0;
  let sy = 0;
  let st = -Infinity;
  const mvx = [0, 0, 0];
  const mvy = [0, 0, 0];
  let mn = 0;
  let mi = 0;
  let v1x = 0;
  let v1y = 0;
  let hasV1 = false;
  let a1x = 0;
  let a1y = 0;
  let hasA1 = false;
  const vFast = new Ema(1);
  const vSlow = new Ema(20);
  const aFeat = new Ema(0.5);
  const jFeat = new Ema(0.8);

  // Current position only.
  let px = 0;
  let py = 0;
  let seen = false;
  let out = true;
  let pfx = 0.5;
  let pfy = 0.5;
  let psx = 0.5;
  let psy = 0.5;
  let ancX = 0;
  let ancY = 0;
  let stillSince = 0;

  // Straightness: per-tick displacements in diagonals, never positions.
  const dxr = new Float64Array(RING);
  const dyr = new Float64Array(RING);
  const dlr = new Float64Array(RING);
  let rn = 0;
  let ri = 0;
  let lastTx = 0;
  let lastTy = 0;
  let hasTick = false;
  let sigma = 0.5;

  // Hover: when each element was last counted (weakly keyed), and a ring of count times.
  let entered = new WeakMap<Element, number>();
  const hr = new Float64Array(HOVER_RING);
  let hn = 0;
  let hi = 0;

  // Clicks.
  const cFast = new Leaky(4);
  const cSlow = new Leaky(45);
  const ici = new Float64Array(8);
  let icn = 0;
  let icw = 0;
  let lastClick = -Infinity;
  let reg = 0.5;

  // Touch taps.
  let downId = -1;
  let downT = 0;
  let downX = 0;
  let downY = 0;
  let lastTouchUp = -Infinity;

  function resetChain(): void {
    st = -Infinity;
    mn = 0;
    mi = 0;
    hasV1 = false;
    hasA1 = false;
  }

  function leave(): void {
    resetChain();
    rn = 0;
    ri = 0;
    hasTick = false;
    out = true;
    f.inside = null;
  }

  function sample(x: number, y: number, t: number): void {
    px = x;
    py = y;
    seen = true;
    out = false;
    if (Math.hypot(x - ancX, y - ancY) > 2) {
      ancX = x;
      ancY = y;
      stillSince = t;
      hub.input(t);
    }
    const gap = t - st;
    if (!(gap <= 0.1)) {
      // first sample, or a stroke break: restart the derivative chain here
      resetChain();
      sx = x;
      sy = y;
      st = t;
      return;
    }
    if (gap < 0.002) return; // merged into the next sample
    const d = hub.diag * gap;
    let vx = (x - sx) / d;
    let vy = (y - sy) / d;
    sx = x;
    sy = y;
    st = t;
    const sp = Math.hypot(vx, vy);
    if (sp > 8) {
      vx *= 8 / sp;
      vy *= 8 / sp;
    }
    mvx[mi] = vx;
    mvy[mi] = vy;
    mi = (mi + 1) % 3;
    if (mn < 3) mn++;
    if (mn === 3) {
      vx = median3(mvx[0], mvx[1], mvx[2]);
      vy = median3(mvy[0], mvy[1], mvy[2]);
    }
    if (!hasV1) {
      v1x = vx;
      v1y = vy;
      hasV1 = true;
    } else {
      const k = alpha(gap, 0.12);
      const nx = v1x + k * (vx - v1x);
      const ny = v1y + k * (vy - v1y);
      let ax = (nx - v1x) / gap;
      let ay = (ny - v1y) / gap;
      v1x = nx;
      v1y = ny;
      let am = Math.hypot(ax, ay);
      if (am > 400) {
        ax *= 400 / am;
        ay *= 400 / am;
        am = 400;
      }
      aFeat.push(am, t);
      if (!hasA1) {
        a1x = ax;
        a1y = ay;
        hasA1 = true;
      } else {
        const bx = a1x + k * (ax - a1x);
        const by = a1y + k * (ay - a1y);
        const jm = Math.min(20000, Math.hypot(bx - a1x, by - a1y) / gap);
        a1x = bx;
        a1y = by;
        jFeat.push(jm, t);
      }
    }
    const s = Math.hypot(v1x, v1y);
    vFast.push(s, t);
    if (import.meta.env.DEV) vSlow.push(s, t);
  }

  function countClick(t: number): void {
    const gap = t - lastClick;
    if (gap < 0.08) {
      lastClick = t; // bounce: one click
      return;
    }
    if (gap > 30) {
      icn = 0;
      icw = 0;
      reg = 0.5; // undefined again until there are 4 intervals
    } else {
      ici[icw] = gap;
      icw = (icw + 1) % 8;
      if (icn < 8) icn++;
    }
    lastClick = t;
    cFast.hit(t);
    cSlow.hit(t);
    if (icn >= 4) {
      let m = 0;
      for (let i = 0; i < icn; i++) m += ici[i];
      m /= icn;
      let v = 0;
      for (let i = 0; i < icn; i++) v += (ici[i] - m) * (ici[i] - m);
      reg = 1 - Math.min(1, Math.sqrt(v / icn) / m);
    }
    hub.emit({ type: 'click', t });
  }

  return {
    start(signal) {
      const o = { passive: true, signal };
      const oc = { passive: true, capture: true, signal };
      stillSince = hub.clock.now();
      vFast.t = vSlow.t = aFeat.t = jFeat.t = stillSince;

      window.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') {
          f.fine = false;
          if (e.pointerId === downId && Math.hypot(e.clientX - downX, e.clientY - downY) > 2) hub.input(now(e.timeStamp));
          return;
        }
        f.fine = true;
        const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
        if (list && list.length > 0) {
          for (let i = 0; i < list.length; i++) sample(list[i].clientX, list[i].clientY, now(list[i].timeStamp));
        } else {
          sample(e.clientX, e.clientY, now(e.timeStamp));
        }
      }, o);

      window.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch') {
          f.fine = true;
          return;
        }
        const t = now(e.timeStamp);
        f.fine = false;
        downId = e.pointerId;
        downT = t;
        downX = e.clientX;
        downY = e.clientY;
        hub.input(t);
      }, o);

      window.addEventListener('pointerup', (e) => {
        if (e.pointerType !== 'touch' || e.pointerId !== downId) return;
        const t = now(e.timeStamp);
        if (t - downT <= 0.25 && Math.hypot(e.clientX - downX, e.clientY - downY) <= 10) countClick(t);
        downId = -1;
        lastTouchUp = t;
      }, o);

      window.addEventListener('pointercancel', (e) => {
        if (e.pointerId === downId) downId = -1;
      }, o);

      window.addEventListener('click', (e) => {
        // a key in a field can fire a click (arrows on a radio, Enter submitting a form): typing, not a click
        if (e.detail === 0 && isTypingTarget(document.activeElement)) return;
        const t = now(e.timeStamp);
        hub.input(t);
        // a tap was already counted from the pointer events
        if (e.detail !== 0 && ((e as PointerEvent).pointerType === 'touch' || t - lastTouchUp < 0.8)) return;
        countClick(t);
      }, oc);

      window.addEventListener('pointerover', (e) => {
        if (e.pointerType === 'touch' || !(e.target instanceof Element)) return;
        const el = e.target.closest(HOVER_SEL);
        if (!el) return;
        const t = now(e.timeStamp);
        const prev = entered.get(el);
        if (prev !== undefined && t - prev < 60) return;
        entered.set(el, t);
        hr[hi] = t;
        hi = (hi + 1) % HOVER_RING;
        if (hn < HOVER_RING) hn++;
      }, oc);

      window.addEventListener('pointerout', (e) => {
        if (e.relatedTarget === null && e.pointerType !== 'touch') leave();
      }, o);
      window.addEventListener('blur', leave, o);
      document.addEventListener('pointerlockchange', leave, o);
    },

    stop() {
      entered = new WeakMap();
    },

    tick(t, dt) {
      if (t - st > 0.1) {
        // no samples: the stroke has ended, so speeds relax toward zero
        vFast.push(0, t);
        if (import.meta.env.DEV) vSlow.push(0, t);
        aFeat.push(0, t);
        jFeat.push(0, t);
      }
      const rx = seen ? clamp01(px / hub.vw) : 0.5;
      const ry = seen ? clamp01(py / hub.vh) : 0.5;
      pfx = ema(pfx, rx, dt, 0.25);
      pfy = ema(pfy, ry, dt, 0.25);
      if (import.meta.env.DEV) {
        psx = ema(psx, rx, dt, 8);
        psy = ema(psy, ry, dt, 8);
      }

      const present = f.fine && seen && !out;
      if (present) {
        const cx = px / hub.diag;
        const cy = py / hub.diag;
        if (hasTick) {
          const dx = cx - lastTx;
          const dy = cy - lastTy;
          dxr[ri] = dx;
          dyr[ri] = dy;
          dlr[ri] = Math.hypot(dx, dy);
          ri = (ri + 1) % RING;
          if (rn < RING) rn++;
        }
        lastTx = cx;
        lastTy = cy;
        hasTick = true;
        let ex = 0;
        let ey = 0;
        let len = 0;
        for (let i = 0; i < rn; i++) {
          ex += dxr[i];
          ey += dyr[i];
          len += dlr[i];
        }
        if (len > 0.01) sigma = ema(sigma, Math.min(1, Math.hypot(ex, ey) / len), dt, 2);
      }

      let hov = 0;
      for (let i = 0; i < hn; i++) if (t - hr[i] < 60) hov++;

      f.x = pfx;
      f.y = pfy;
      f.speed = nlog(vFast.y, 0.02, 3);
      f.accel = nlog(aFeat.y, 0.5, 50);
      f.jerk = nlog(jFeat.y, 10, 2000);
      f.straightness = sigma;
      f.hover = nsat(hov, 6);
      f.still = Math.max(0, t - stillSince);
      f.inside = present && hub.inside ? hub.inside(px, py) : null;

      const rf = cFast.rate(t);
      const rs = cSlow.rate(t);
      fc.fast = nsat(rf, 0.5);
      fc.slow = nsat(rs, 0.08);
      fc.regularity = reg;

      if (import.meta.env.DEV) {
        raw.vFast = vFast.y;
        raw.vSlow = vSlow.y;
        raw.accel = aFeat.y;
        raw.jerk = jFeat.y;
        raw.pSlowX = psx;
        raw.pSlowY = psy;
        raw.hoverPerMin = hov;
        raw.clickRate = rf;
        raw.clickRateSlow = rs;
      }
    },
  };
}
