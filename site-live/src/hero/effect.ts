/**
 * The Hrakert kolto plant: a pixel-art seabed scene under Manaan. Kolto tanks fill and
 * drain through floor pipes and pumps, suited Republic workers come and go to draw kolto
 * from seeps in the sediment, a Selkath overseer checks in, cargo canisters ride the lift
 * shaft to the surface, and now and then a submersible or a firaxa shark passes far off.
 *
 * Rendering: the scene is drawn into a low-resolution "art" buffer (one art pixel is 2-3 CSS
 * pixels) and scaled up by a whole number of device pixels with smoothing off, so it stays
 * crisp and cheap. The greets scroller is drawn on top at full resolution.
 * DPR-aware (capped at 2), paused when offscreen or the tab is hidden, a single still frame
 * under prefers-reduced-motion. Loaded lazily after first paint; the DOM logo and text never
 * depend on it.
 */

import { C, caustics, glowSprite, mulberry, sprites } from './sprites';

interface Options {
  canvas: HTMLCanvasElement;
  host: HTMLElement;
  logo: HTMLElement | null;
  text: string;
  reduced: boolean;
  onLive?: () => void;
}

const FONT = '"Departure Mono", ui-monospace, monospace';
const BEAMS_NARROW = [0.2, 0.7];
const BEAMS_WIDE = [0.12, 0.34, 0.58, 0.83];

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

/* ---------------------------------------------------------------- scene types */

interface Tank {
  x: number;
  w: number;
  top: number;
  level: number;
}
interface Pump {
  x: number;
  phase: number;
  press: number;
}
interface Seep {
  x: number;
  amount: number; // 0..1 how much kolto is pooled
  busy: boolean;
}
interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  ph: number;
  ceil: number; // pops when it reaches this y
}
interface Mote {
  x: number;
  y: number;
  v: number;
  ph: number;
  a: number;
}
interface Worker {
  kind: 'worker';
  x: number;
  dir: 1 | -1;
  state: 'arrive' | 'work' | 'carry' | 'load' | 'leave';
  t: number;
  seep: Seep;
  goal: number;
  fill: number;
  exit: 1 | -1;
  speed: number;
  done: boolean;
}
interface Selkath {
  kind: 'selkath';
  x: number;
  dir: 1 | -1;
  state: 'arrive' | 'inspect' | 'leave';
  t: number;
  goal: number;
  exit: 1 | -1;
  done: boolean;
}
interface Swimmer {
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
}
interface Lift {
  y: number; // platform height above the dock, 0 = docked
  state: 'docked' | 'up' | 'down';
  cargo: number;
  wait: number; // seconds until departure once loaded
}
interface Transfer {
  from: number; // tank index, or -1 for the seabed intake at a pump
  to: number;
  pump: number;
  left: number; // level still to move
}

/* ---------------------------------------------------------------- effect */

export function startHero(opts: Options): () => void {
  const { canvas, host, logo, reduced } = opts;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return () => {};
  const S = sprites();

  const art = document.createElement('canvas');
  const ac = art.getContext('2d')!;
  const bg = document.createElement('canvas');
  const caus = document.createElement('canvas');
  const cc = caus.getContext('2d')!;
  const [tileA, tileB] = caustics();
  const patA = cc.createPattern(tileA, 'repeat')!;
  const patB = cc.createPattern(tileB, 'repeat')!;
  const glowK = glowSprite(48, '79,227,238', 0.55);
  const glowL = glowSprite(24, '255,210,122', 0.6);
  const matA = new DOMMatrix();
  const matB = new DOMMatrix();

  let W = 0;
  let H = 0;
  let dpr = 1;
  let Pd = 3; // device pixels per art pixel
  let P = 3; // CSS pixels per art pixel
  let AW = 0;
  let AH = 0;
  let floorY = 0;
  let narrow = false;
  let fontPx = 33;
  let scrollerBase = 0;
  let bandTop = 0; // art-pixel y of the scroller band's top edge; floor bubbles stop below it
  let started = false;
  let raf = 0;
  let visible = true;
  let pageVisible = !document.hidden;
  let last = performance.now();
  let t = 0;
  let scrollX = 0;
  let destroyed = false;
  let prevBoost = 0;
  let causticMask: CanvasGradient | null = null;
  let rayGrad: CanvasGradient | null = null;
  let scrollGrad: CanvasGradient | string = '#c9fbff';
  let coneR: CanvasGradient | null = null;
  let coneL: CanvasGradient | null = null;
  const text = `${opts.text.trim()}          `;

  let tanks: Tank[] = [];
  let pumps: Pump[] = [];
  let seeps: Seep[] = [];
  let liftX = 0;
  const lift: Lift = { y: 0, state: 'docked', cargo: 1, wait: 0 };
  let transfer: Transfer | null = null;
  let transferWait = 1.5;
  const bubbles: Bubble[] = [];
  let motes: Mote[] = [];
  let actors: (Worker | Selkath)[] = [];
  let sub: Swimmer | null = null;
  let shark: Swimmer | null = null;
  // Director clocks: seconds until each kind of visitor may next appear. Each clock restarts
  // when the previous visitor leaves, so the gaps below are real empty time, not spawn rates.
  // The first worker is scripted so a fresh visit always opens with someone arriving.
  const GAP = { worker: [25, 50], selkath: [75, 150], sub: [60, 120], shark: [150, 300], lift: [50, 90] } as const;
  const gap = (k: keyof typeof GAP) => rand(GAP[k][0], GAP[k][1]);
  const next = { worker: 0.8, selkath: rand(30, 50), sub: rand(9, 14), shark: rand(60, 110), lift: rand(14, 20) };

  function measure() {
    const r = host.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    // tiers follow hero.css (max-width 1199px / 999px / 559px); innerWidth is what media queries measure
    const vw = window.innerWidth || W;
    Pd = Math.max(1, Math.round((vw >= 1200 ? 4 : vw >= 1000 ? 3 : 2) * dpr));
    P = Pd / dpr;
    AW = Math.ceil(canvas.width / Pd);
    AH = Math.ceil(canvas.height / Pd);
    art.width = AW;
    art.height = AH;
    ac.imageSmoothingEnabled = false;
    floorY = AH - Math.ceil(30 / P);

    let logoLeft = AW * 0.2;
    if (logo) logoLeft = (logo.getBoundingClientRect().left - r.left) / P;
    narrow = logoLeft < 40 || AW < 300;

    fontPx = vw < 560 ? 22 : 33;
    scrollerBase = H - 30 - 18 * P - 14;
    const band = parseFloat(getComputedStyle(host).getPropertyValue('--scroller-band')) || 150;
    bandTop = Math.ceil((H - band) / P);

    layout();
    buildBackground();

    const ch = Math.round(AH * 0.75);
    caus.width = AW;
    caus.height = ch;
    cc.imageSmoothingEnabled = false;
    causticMask = cc.createLinearGradient(0, 0, 0, ch);
    causticMask.addColorStop(0, 'rgba(0,0,0,1)');
    causticMask.addColorStop(0.5, 'rgba(0,0,0,0.3)');
    causticMask.addColorStop(1, 'rgba(0,0,0,0)');
    rayGrad = ac.createLinearGradient(0, 0, 0, AH * 0.85);
    rayGrad.addColorStop(0, 'rgba(140,230,240,0.13)');
    rayGrad.addColorStop(1, 'rgba(140,230,240,0)');
    coneR = ac.createLinearGradient(0, 0, 70, 0);
    coneR.addColorStop(0, 'rgba(255,240,190,0.22)');
    coneR.addColorStop(1, 'rgba(255,240,190,0)');
    coneL = ac.createLinearGradient(0, 0, -70, 0);
    coneL.addColorStop(0, 'rgba(255,240,190,0.22)');
    coneL.addColorStop(1, 'rgba(255,240,190,0)');

    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.imageSmoothingEnabled = false;
    applyFont();
    const amp = fontPx * 0.12;
    const sg = ctx!.createLinearGradient(0, scrollerBase - fontPx - amp, 0, scrollerBase + amp);
    sg.addColorStop(0, '#ffffff');
    sg.addColorStop(0.45, '#c9fbff');
    sg.addColorStop(0.75, '#4fe3ee');
    sg.addColorStop(1, '#1a8394');
    scrollGrad = sg;

    const n = Math.round((AW * AH) / 1100);
    const mr = reduced ? mulberry(3) : Math.random; // the still frame must match on every load
    motes = Array.from({ length: n }, () => ({ x: mr() * AW, y: mr() * floorY, v: 1.2 + mr() * 2.8, ph: mr() * 6.3, a: 0.18 + mr() * 0.32 }));
  }

  /** Assigning canvas.width resets context state, so this runs after every measure(). */
  function applyFont() {
    ctx!.font = `${fontPx}px ${FONT}`;
    ctx!.textBaseline = 'alphabetic';
  }

  function layout() {
    const levels = tanks.map((k) => k.level);
    const tb = floorY - 4;
    if (narrow) {
      const top = Math.max(Math.round(AH * 0.7), tb - 90);
      tanks = [{ x: 4, w: 12, top, level: 0.6 }];
      pumps = [{ x: 22, phase: 0, press: 0.4 }];
      liftX = AW - 12;
      seeps = [0.34, 0.66].map((f) => ({ x: Math.round(AW * f), amount: 0.9, busy: false }));
    } else {
      const top = Math.max(Math.round(AH * 0.56), tb - 140);
      tanks = [
        { x: 6, w: 17, top, level: 0.7 },
        { x: 29, w: 16, top: top + 10, level: 0.45 },
        { x: 51, w: 12, top: top + 34, level: 0.25 },
        { x: AW - 68, w: 17, top: top + 18, level: 0.55 },
        { x: AW - 45, w: 13, top: top + 36, level: 0.8 },
      ];
      pumps = [
        { x: 66, phase: 0, press: 0.4 },
        { x: AW - 82, phase: 1.2, press: 0.5 },
      ];
      liftX = AW - 24;
      const sr = reduced ? mulberry(5) : Math.random;
      seeps = [104, Math.round(AW * 0.42), Math.round(AW * 0.6), AW - 110].map((x) => ({ x, amount: 0.6 + sr() * 0.4, busy: false }));
    }
    tanks.forEach((k, i) => {
      if (levels[i] !== undefined) k.level = levels[i];
    });
    // the floor moved: anyone mid-task heads home
    for (const a of actors) {
      if (a.kind === 'worker') {
        a.seep = seeps[0];
        a.state = 'leave';
        a.goal = a.dir === 1 ? AW + 14 : -14;
      } else {
        a.state = 'leave';
        a.goal = a.exit === 1 ? AW + 18 : -18;
      }
    }
    transfer = null;
  }

  /* ---------- static background: water, rift ridges, seabed, pipes, shaft ---------- */

  function px(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) {
    g.fillStyle = col;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function hpipe(g: CanvasRenderingContext2D, x0: number, x1: number, y: number) {
    px(g, x0, y, x1 - x0, 1, C.pipeHi);
    px(g, x0, y + 1, x1 - x0, 1, C.pipe);
    px(g, x0, y + 2, x1 - x0, 1, C.pipeLo);
  }
  function vpipe(g: CanvasRenderingContext2D, x: number, y0: number, y1: number) {
    px(g, x, y0, 1, y1 - y0, C.pipeHi);
    px(g, x + 1, y0, 1, y1 - y0, C.pipe);
    px(g, x + 2, y0, 1, y1 - y0, C.pipeLo);
  }

  function buildBackground() {
    bg.width = AW;
    bg.height = AH;
    const g = bg.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, AH);
    grad.addColorStop(0, C.waterTop);
    grad.addColorStop(0.35, C.waterMid);
    grad.addColorStop(0.75, C.waterLow);
    grad.addColorStop(1, C.abyss);
    g.fillStyle = grad;
    g.fillRect(0, 0, AW, AH);
    // banded water, like a palette-limited sky
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgba(0,10,16,${i * 0.012})`;
      g.fillRect(0, Math.round((i / 8) * floorY), AW, Math.ceil(floorY / 8));
    }

    // the Hrakert Rift: a far ridge and a near ridge, both dipping toward the trench in the middle
    const ridge = (base: number, amp: number, col: string, step: number, seed: number) => {
      g.fillStyle = col;
      for (let x = 0; x < AW; x += step) {
        const c = Math.abs(x / AW - 0.5) * 2;
        const h = base - amp * (0.35 + 0.65 * c) - (Math.sin(x * 0.07 + seed) + Math.sin(x * 0.023 + seed * 2)) * amp * 0.18;
        g.fillRect(x, Math.round(h), step, AH - Math.round(h));
      }
    };
    ridge(floorY - 18, narrow ? 40 : 70, C.ridgeFar, 3, 1.3);
    ridge(floorY - 6, narrow ? 20 : 34, C.ridgeNear, 2, 4.1);

    // distant station modules on the far ridge, with lit ports and a mast beacon
    const station = (sx: number, sy: number) => {
      g.fillStyle = '#062a3a';
      g.fillRect(sx, sy, 22, 7);
      g.fillRect(sx + 4, sy - 4, 12, 4);
      g.fillRect(sx + 7, sy - 6, 6, 2);
      g.fillRect(sx + 9, sy - 16, 1, 10);
      g.fillStyle = 'rgba(255,210,122,0.55)';
      for (let i = 0; i < 4; i++) g.fillRect(sx + 3 + i * 5, sy + 2, 1, 1);
      g.fillStyle = 'rgba(79,227,238,0.7)';
      g.fillRect(sx + 9, sy - 16, 1, 1);
    };
    if (!narrow) {
      station(Math.round(AW * 0.25), floorY - 60);
      station(Math.round(AW * 0.68), floorY - 54);
    }

    // seabed with speckle and a few rocks
    px(g, 0, floorY, AW, AH - floorY, C.sediment);
    px(g, 0, floorY, AW, 1, C.sedimentHi);
    const rnd = mulberry(7);
    for (let i = 0; i < AW * 1.2; i++) {
      const x = Math.floor(rnd() * AW);
      const y = floorY + 1 + Math.floor(rnd() * (AH - floorY));
      g.fillStyle = rnd() > 0.5 ? C.sedimentLo : '#0f3442';
      g.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < AW / 40; i++) {
      const x = Math.floor(rnd() * AW);
      const w = 3 + Math.floor(rnd() * 5);
      px(g, x, floorY - 1, w, 2, '#0d2f3c');
      px(g, x + 1, floorY - 2, w - 2, 1, '#123b4a');
    }
    const fade = g.createLinearGradient(0, floorY, 0, AH);
    fade.addColorStop(0, 'rgba(2,10,15,0)');
    fade.addColorStop(1, 'rgba(2,10,15,0.75)');
    g.fillStyle = fade;
    g.fillRect(0, floorY, AW, AH - floorY);

    // seep pockets: dark rims in the sediment (the gel itself is drawn live)
    for (const s of seeps) {
      px(g, s.x - 4, floorY, 9, 1, '#06212b');
      px(g, s.x - 3, floorY + 1, 7, 1, '#041820');
    }

    // lift shaft up to the surface: twin rails with cross braces
    px(g, liftX - 1, 0, 1, floorY, '#0e3140');
    px(g, liftX + 9, 0, 1, floorY, '#0e3140');
    px(g, liftX, 0, 1, floorY, C.metalLo);
    px(g, liftX + 8, 0, 1, floorY, C.metalLo);
    g.fillStyle = 'rgba(42,85,102,0.5)';
    for (let y = floorY - 8; y > 0; y -= 9) g.fillRect(liftX + 1, y, 7, 1);

    // floor transfer pipe, end to end, with flanges
    hpipe(g, 0, AW, floorY - 3);
    for (let x = 6; x < AW; x += 24) {
      px(g, x, floorY - 4, 1, 5, C.metalHi);
      px(g, x + 1, floorY - 4, 1, 5, C.metalLo);
    }
    // lift dock
    px(g, liftX - 3, floorY - 2, 15, 2, C.metal);
    px(g, liftX - 3, floorY - 2, 15, 1, C.metalHi);

    // tank plinths, and a header pipe across each farm's tops running down to its pump
    for (const k of tanks) {
      px(g, k.x - 2, floorY - 4, k.w + 4, 1, C.metalHi);
      px(g, k.x - 2, floorY - 3, k.w + 4, 3, C.metalLo);
    }
    const header = (list: Tank[], toX: number) => {
      if (!list.length) return;
      const y = Math.min(...list.map((k) => k.top)) - 9;
      const xs = list.map((k) => k.x + Math.floor(k.w / 2) - 1);
      const x0 = Math.min(...xs, toX);
      const x1 = Math.max(...xs, toX) + 3;
      hpipe(g, x0, x1, y);
      for (const k of list) vpipe(g, k.x + Math.floor(k.w / 2) - 1, y + 2, k.top - 2);
      vpipe(g, toX, y + 2, floorY - 12);
      px(g, toX - 1, y + 10, 5, 1, C.metalHi);
      px(g, toX - 1, y + 11, 5, 1, C.metalLo);
    };
    const leftTanks = tanks.filter((k) => k.x < AW / 2);
    const rightTanks = tanks.filter((k) => k.x >= AW / 2);
    if (pumps[0]) header(leftTanks, pumps[0].x + 2);
    if (pumps[1]) header(rightTanks, pumps[1].x + 2);
  }

  /* ---------- light ---------- */

  function drawRays(time: number) {
    if (!rayGrad) return;
    ac.globalCompositeOperation = 'lighter';
    ac.fillStyle = rayGrad;
    const beams = narrow ? BEAMS_NARROW : BEAMS_WIDE;
    const len = AH * 0.85;
    beams.forEach((f, i) => {
      ac.globalAlpha = 0.55 + 0.45 * Math.sin(time * 0.31 + i * 1.9);
      const x = Math.round(f * AW + Math.sin(time * 0.07 + i) * 6);
      const tw = 10 + i * 3;
      const bw = 34 + i * 6;
      ac.beginPath();
      ac.moveTo(x, 0);
      ac.lineTo(x + tw, 0);
      ac.lineTo(x + tw + len * 0.28 + bw / 2, len);
      ac.lineTo(x + len * 0.28 - bw / 2, len);
      ac.closePath();
      ac.fill();
    });
    ac.globalAlpha = 1;
    ac.globalCompositeOperation = 'source-over';
  }

  function drawCaustics(time: number) {
    const ch = caus.height;
    cc.globalCompositeOperation = 'copy';
    matA.e = Math.round(time * 3.1);
    matA.f = Math.round(time * 1.7);
    patA.setTransform(matA);
    cc.fillStyle = patA;
    cc.globalAlpha = 0.55;
    cc.fillRect(0, 0, AW, ch);
    cc.globalCompositeOperation = 'lighter';
    matB.e = Math.round(-time * 2.3);
    matB.f = Math.round(time * 2.6);
    patB.setTransform(matB);
    cc.fillStyle = patB;
    cc.fillRect(0, 0, AW, ch);
    cc.globalAlpha = 1;
    cc.globalCompositeOperation = 'destination-in';
    cc.fillStyle = causticMask!;
    cc.fillRect(0, 0, AW, ch);
    cc.globalCompositeOperation = 'source-over';
    ac.globalCompositeOperation = 'lighter';
    ac.globalAlpha = 0.15;
    ac.drawImage(caus, 0, 0);
    // a faint ripple on the seabed
    ac.globalAlpha = 0.08;
    ac.drawImage(caus, 0, 0, AW, 6, 0, floorY, AW, 6);
    ac.globalAlpha = 1;
    ac.globalCompositeOperation = 'source-over';
  }

  function drawMotes(dt: number, time: number) {
    ac.fillStyle = '#9fd8e0';
    for (const m of motes) {
      m.y += m.v * dt;
      m.x += Math.sin(time * 0.6 + m.ph) * 0.6 * dt;
      if (m.y > floorY) {
        m.y = -1;
        m.x = Math.random() * AW;
      }
      ac.globalAlpha = m.a;
      ac.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
    }
    ac.globalAlpha = 1;
  }

  // Bubbles from the floor dissolve in the lower water: the rise is set in CSS pixels (so it does not
  // grow with the art scale) and never passes the top of the scroller band, below the hero copy.
  function addBubble(x: number, y: number, r = 0, ceil?: number, rng: () => number = Math.random) {
    if (bubbles.length > 220) return;
    const top = ceil ?? Math.max(bandTop, floorY - ((narrow ? 40 : 60) + rng() * (narrow ? 80 : 100)) / P);
    bubbles.push({ x, y, r, vy: 9 + rng() * 7 + r * 3, ph: rng() * 6.3, ceil: top });
  }

  function drawBubbles(dt: number, time: number) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.y -= b.vy * dt;
      if (b.y <= b.ceil) {
        bubbles.splice(i, 1);
        continue;
      }
      const x = Math.round(b.x + Math.sin(time * 3 + b.ph) * 0.9);
      const y = Math.round(b.y);
      if (b.r === 0) {
        px(ac, x, y, 1, 1, 'rgba(201,251,255,0.7)');
      } else if (b.r === 1) {
        px(ac, x, y, 2, 2, 'rgba(120,220,235,0.45)');
        px(ac, x, y, 1, 1, 'rgba(230,255,255,0.9)');
      } else {
        ac.fillStyle = 'rgba(160,235,245,0.6)';
        ac.fillRect(x + 1, y, 1, 1);
        ac.fillRect(x, y + 1, 1, 1);
        ac.fillRect(x + 2, y + 1, 1, 1);
        ac.fillRect(x + 1, y + 2, 1, 1);
      }
    }
  }

  /* ---------- plant: tanks, pumps, flow, seeps, lift ---------- */

  function glow(img: HTMLCanvasElement, x: number, y: number, size: number, alpha: number) {
    ac.globalCompositeOperation = 'lighter';
    ac.globalAlpha = Math.max(0, Math.min(1, alpha));
    ac.drawImage(img, Math.round(x - size / 2), Math.round(y - size / 2), size, size);
    ac.globalAlpha = 1;
    ac.globalCompositeOperation = 'source-over';
  }

  function drawTank(k: Tank, idx: number, time: number, boost: number, still: boolean) {
    const bot = floorY - 4;
    const h = bot - k.top;
    px(ac, k.x - 1, k.top - 3, k.w + 2, 1, C.metalHi);
    px(ac, k.x - 1, k.top - 2, k.w + 2, 2, C.metal);
    px(ac, k.x - 1, bot - 2, k.w + 2, 2, C.metal);
    px(ac, k.x, k.top, k.w, h - 2, C.glass);
    const lh = Math.round((h - 3) * k.level);
    const ly = bot - 2 - lh;
    if (lh > 0) {
      px(ac, k.x, ly, k.w, lh, C.koltoMid);
      px(ac, k.x, ly, 2, lh, C.koltoDeep);
      px(ac, k.x + k.w - 2, ly, 2, lh, C.koltoDeep);
      px(ac, k.x + Math.floor(k.w * 0.62), ly, 1, lh, '#58e6ef');
      for (let x = 0; x < k.w; x++) {
        const up = Math.sin(time * 2.4 + x * 0.9 + idx) > 0.3 ? 1 : 0;
        px(ac, k.x + x, ly - up, 1, 1, C.koltoFoam);
      }
      // gel streaks drifting up inside
      for (let s = 0; s < 3; s++) {
        const sy = bot - 4 - Math.floor((time * (5 + s * 2) + s * 37 + idx * 11) % Math.max(1, lh - 2));
        px(ac, k.x + 3 + ((s * 4 + idx) % Math.max(1, k.w - 6)), sy, 1, 2, 'rgba(201,251,255,0.5)');
      }
      if (!still && Math.random() < 0.05 + boost * 0.2) addBubble(k.x + 2 + Math.random() * (k.w - 4), bot - 3, Math.random() < 0.3 ? 1 : 0, ly + 1);
      glow(glowK, k.x + k.w / 2, ly + lh / 2, Math.max(k.w * 3.4, 40), 0.22 + boost * 0.35 + 0.05 * Math.sin(time * 1.3 + idx));
    }
    px(ac, k.x, k.top, 1, h - 2, C.metal);
    px(ac, k.x + k.w - 1, k.top, 1, h - 2, C.metalLo);
    ac.fillStyle = 'rgba(220,250,255,0.22)';
    ac.fillRect(k.x + 2, k.top + 1, 1, h - 4);
    for (let y = k.top + 14; y < bot - 6; y += 18) px(ac, k.x, y, k.w, 1, 'rgba(42,85,102,0.85)');
    for (let y = k.top + 4; y < bot - 3; y += 6) px(ac, k.x - 2, y, 1, 1, '#2a5566');
  }

  function drawPump(p: Pump, dt: number, boost: number, active: boolean, still: boolean) {
    const y = floorY - 3;
    p.phase += dt * (active ? 7 : 1.5);
    p.press += ((active ? 0.85 : 0.3) - p.press) * Math.min(1, dt * 0.8);
    const stroke = Math.round((Math.sin(p.phase) * 0.5 + 0.5) * 3 + boost * 2);
    px(ac, p.x - 2, y - 9, 12, 9, C.metal);
    px(ac, p.x - 2, y - 9, 12, 1, C.metalHi);
    px(ac, p.x - 2, y - 1, 12, 1, C.metalLo);
    px(ac, p.x + 8, y - 8, 2, 7, C.metalLo);
    px(ac, p.x + 5, y - 13 - stroke, 4, 2, C.metalHi);
    px(ac, p.x + 6, y - 11 - stroke, 2, 2 + stroke, '#7d97a1');
    // pressure gauge, amber needle
    const gx = p.x - 1;
    const gy = y - 7;
    px(ac, gx, gy, 5, 5, '#0a1e27');
    const ang = Math.PI * (0.85 + p.press * 1.3) + Math.sin(p.phase * 3) * 0.08;
    px(ac, gx + 2, gy + 2, 1, 1, C.gauge);
    px(ac, gx + 2 + Math.round(Math.cos(ang) * 2), gy + 2 + Math.round(Math.sin(ang) * 2), 1, 1, C.gauge);
    px(ac, p.x + 5, y - 6, 1, 1, active ? C.kolto : '#1d4a5c');
    if (!still && active && Math.random() < dt * 3) addBubble(p.x + 7, y - 14 - stroke, 0);
  }

  function drawFlow(time: number) {
    if (!transfer) return;
    const src = transfer.from < 0 ? pumps[transfer.pump].x + 3 : tanks[transfer.from].x + tanks[transfer.from].w / 2;
    const k = tanks[transfer.to];
    const dst = k.x + k.w / 2;
    const dir = dst > src ? 1 : -1;
    const len = Math.abs(dst - src);
    const y = floorY - 2;
    for (let d = (time * 22) % 6; d < len; d += 6) px(ac, src + dir * d, y, 2, 1, C.kolto);
    glow(glowK, dst, y, 14, 0.4);
  }

  function updateTransfer(dt: number) {
    if (transfer) {
      const step = Math.min(transfer.left, dt * 0.045);
      transfer.left -= step;
      if (transfer.from >= 0) tanks[transfer.from].level = Math.max(0.04, tanks[transfer.from].level - step);
      tanks[transfer.to].level = Math.min(0.96, tanks[transfer.to].level + step);
      if (transfer.left <= 0 || tanks[transfer.to].level >= 0.96 || (transfer.from >= 0 && tanks[transfer.from].level <= 0.05)) {
        transfer = null;
        transferWait = rand(3, 7);
      }
      return;
    }
    transferWait -= dt;
    if (transferWait > 0 || !tanks.length) return;
    const lowest = tanks.reduce((m, k, i) => (k.level < tanks[m].level ? i : m), 0);
    const fullest = tanks.reduce((m, k, i) => (k.level > tanks[m].level ? i : m), 0);
    const pump = tanks[lowest].x < AW / 2 || pumps.length < 2 ? 0 : 1;
    if (tanks[lowest].level < 0.4 || Math.random() < 0.4 || tanks.length < 2) {
      transfer = { from: -1, to: lowest, pump, left: rand(0.2, 0.4) };
    } else {
      transfer = { from: fullest, to: lowest, pump, left: rand(0.15, 0.3) };
    }
  }

  function drawSeeps(dt: number, time: number, boost: number, still: boolean) {
    for (const s of seeps) {
      s.amount = Math.min(1, s.amount + dt * 0.012);
      const a = s.amount;
      const w = Math.max(1, Math.round(7 * a));
      px(ac, s.x - Math.floor(w / 2), floorY, w, 1, a > 0.3 ? C.kolto : C.koltoDeep);
      if (a > 0.5) px(ac, s.x - 1, floorY - 1, 3, 1, 'rgba(201,251,255,0.8)');
      glow(glowK, s.x, floorY, 24, (0.22 + (0.5 + 0.5 * Math.sin(time * 1.7 + s.x)) * 0.12 + boost * 0.2) * a);
      if (!still && Math.random() < dt * (0.25 + a * 0.5)) addBubble(s.x - 1 + Math.random() * 3, floorY - 1, Math.random() < 0.2 ? 1 : 0);
    }
  }

  function updateLift(dt: number) {
    if (lift.state === 'docked') {
      if (lift.cargo > 0) {
        lift.wait -= dt;
        if (lift.wait <= 0) lift.state = 'up';
      }
    } else if (lift.state === 'up') {
      lift.y += dt * 12;
      if (lift.y > floorY + 12) {
        lift.state = 'down';
        lift.cargo = 0;
      }
    } else {
      lift.y -= dt * 30;
      if (lift.y <= 0) {
        lift.y = 0;
        lift.state = 'docked';
        if (next.lift === Infinity) next.lift = gap('lift');
      }
    }
  }

  function drawLift(time: number) {
    const py = floorY - 3 - Math.round(lift.y);
    if (py > 10) px(ac, liftX + 4, 0, 1, py - 10, 'rgba(93,143,163,0.45)');
    for (let i = 0; i < lift.cargo; i++) ac.drawImage(S.can.r, liftX + i * 5, py - 8);
    px(ac, liftX, py - 1, 9, 2, C.metalHi);
    px(ac, liftX + 1, py + 1, 7, 1, C.metalLo);
    px(ac, liftX + 2, py - 11, 5, 1, C.metal);
    if (lift.state === 'up') px(ac, liftX + 4, py - 12, 1, 1, Math.floor(time * 3) % 2 ? C.gauge : '#5a3d1e');
  }

  /* ---------- NPCs ---------- */

  function spawnWorker(first: boolean) {
    const free = seeps.filter((s) => !s.busy && s.amount > 0.45);
    if (!free.length) return;
    const seep = first && !seeps[0].busy ? seeps[0] : free[Math.floor(Math.random() * free.length)];
    const fromLeft = first ? true : seep.x < AW / 2 ? Math.random() < 0.75 : Math.random() < 0.25;
    seep.busy = true;
    actors.push({
      kind: 'worker',
      x: fromLeft ? -12 : AW + 1,
      dir: fromLeft ? 1 : -1,
      state: 'arrive',
      t: 0,
      seep,
      goal: seep.x - (fromLeft ? 12 : -1),
      fill: 0,
      exit: seep.x > AW / 2 ? 1 : -1,
      speed: rand(10, 12.5),
      done: false,
    });
  }

  function spawnSelkath() {
    const fromLeft = Math.random() < 0.5;
    const side = tanks.filter((k) => (fromLeft ? k.x < AW / 2 : k.x >= AW / 2));
    const k = fromLeft ? side[side.length - 1] : side[0];
    const goal = k ? (fromLeft ? k.x + k.w + 18 : k.x - 30) : AW / 2;
    actors.push({ kind: 'selkath', x: fromLeft ? -16 : AW + 2, dir: fromLeft ? 1 : -1, state: 'arrive', t: 0, goal, exit: fromLeft ? -1 : 1, done: false });
  }

  function walk(a: { x: number; dir: 1 | -1 }, goal: number, speed: number, dt: number): boolean {
    const d = goal - a.x;
    a.dir = d >= 0 ? 1 : -1;
    const step = speed * dt;
    if (Math.abs(d) <= step) {
      a.x = goal;
      return true;
    }
    a.x += a.dir * step;
    return false;
  }

  function updateWorker(w: Worker, dt: number) {
    w.t += dt;
    const dock = liftX - 11;
    switch (w.state) {
      case 'arrive':
        if (walk(w, w.goal, w.speed, dt)) {
          w.state = 'work';
          w.t = 0;
          w.dir = w.seep.x > w.x ? 1 : -1;
        }
        break;
      case 'work':
        w.seep.amount = Math.max(0, w.seep.amount - dt * 0.09);
        w.fill = Math.min(1, w.fill + dt * 0.12);
        if (w.t > 8.5 || w.fill >= 1) {
          w.state = 'carry';
          w.t = 0;
          w.seep.busy = false;
          const toLift = w.exit === 1 && lift.state === 'docked' && lift.cargo < 2;
          w.goal = toLift ? dock : w.exit === 1 ? AW + 14 : -14;
        }
        break;
      case 'carry':
        if (walk(w, w.goal, w.speed * 0.85, dt)) {
          if (w.goal === dock && lift.state === 'docked' && lift.cargo < 2) {
            w.state = 'load';
            w.t = 0;
          } else if (w.goal === dock) {
            w.goal = AW + 14;
          } else {
            w.done = true;
          }
        }
        break;
      case 'load':
        w.dir = 1;
        if (w.t > 1.2) {
          lift.cargo += 1;
          lift.wait = 1.6;
          w.fill = 0;
          w.state = 'leave';
          w.goal = AW + 14;
        }
        break;
      case 'leave':
        if (walk(w, w.goal, w.speed, dt)) w.done = true;
        break;
    }
  }

  function drawWorker(w: Worker, time: number, still: boolean) {
    const y0 = floorY - 18;
    const x = Math.round(w.x);
    if (w.state === 'work' || w.state === 'load') {
      const bob = still ? 0 : Math.round(Math.sin(time * 5) * 0.5 + 0.5);
      ac.drawImage(w.dir === 1 ? S.kneel.r : S.kneel.l, x, y0 + 1 + bob);
      if (w.state === 'work') {
        // extractor lance from the hands down into the seep
        const hx = w.dir === 1 ? x + 10 : x + 1;
        const hy = y0 + 10 + bob;
        const tipX = w.seep.x;
        const steps = Math.max(1, Math.abs(tipX - hx), floorY - hy);
        ac.fillStyle = '#c9d3d6';
        for (let i = 0; i <= steps; i++) ac.fillRect(Math.round(hx + ((tipX - hx) * i) / steps), Math.round(hy + ((floorY - 1 - hy) * i) / steps), 1, 1);
        px(ac, tipX, floorY - 1, 1, 1, Math.sin(time * 9) > 0 || still ? '#ffffff' : C.kolto);
        glow(glowK, tipX, floorY - 1, 18, 0.5);
        if (!still && Math.random() < 0.12) addBubble(tipX, floorY - 2, Math.random() < 0.4 ? 1 : 0);
      }
      // the canister beside them, filling
      const cx = w.dir === 1 ? x - 4 : x + 12;
      ac.drawImage(S.canEmpty.r, cx, floorY - 7);
      const fh = Math.round(w.fill * 4);
      if (fh > 0) px(ac, cx + 1, floorY - 3 - fh, 2, fh, C.kolto);
    } else {
      const stride = !still && Math.floor(time * 3.4) % 2 === 0;
      const spr = stride ? S.walkB : S.walkA;
      ac.drawImage(w.dir === 1 ? spr.r : spr.l, x, y0);
      if (w.state === 'carry') ac.drawImage(S.can.r, w.dir === 1 ? x + 9 : x - 1, floorY - 10);
    }
    const lx = w.dir === 1 ? x + 10 : x + 1;
    glow(glowL, lx, y0 + 3, 12, 0.55);
    if (!still && Math.random() < 0.025) addBubble(x + 6, y0 - 1, 0);
  }

  function updateSelkath(s: Selkath, dt: number) {
    s.t += dt;
    if (s.state === 'arrive') {
      if (walk(s, s.goal, 7, dt)) {
        s.state = 'inspect';
        s.t = 0;
      }
    } else if (s.state === 'inspect') {
      // looks over the tanks, then glances back across the floor
      const towardTanks: 1 | -1 = s.exit === -1 ? -1 : 1;
      s.dir = s.t % 4 < 2.8 ? towardTanks : (-towardTanks as 1 | -1);
      if (s.t > 7) {
        s.state = 'leave';
        s.goal = s.exit === 1 ? AW + 18 : -18;
      }
    } else if (walk(s, s.goal, 7, dt)) {
      s.done = true;
    }
  }

  function drawSelkath(s: Selkath, time: number) {
    const moving = s.state !== 'inspect';
    const frame = moving && Math.floor(time * 2.6) % 2 === 0 ? S.selB : S.selA;
    const y0 = floorY - frame.h;
    const x = Math.round(s.x);
    ac.drawImage(s.dir === 1 ? frame.r : frame.l, x, y0);
    if (!moving) {
      const dx = s.dir === 1 ? x + 11 : x + 1;
      px(ac, dx, y0 + 13, 2, 2, C.kolto);
      glow(glowK, dx + 1, y0 + 14, 14, 0.4);
    }
  }

  function drawSub(time: number) {
    if (!sub) return;
    const spr = S.sub;
    const x = Math.round(sub.x);
    const y = Math.round(sub.y + Math.sin(time * 0.8) * 1.5);
    const lx = sub.dir === 1 ? x + spr.w - 2 : x + 1;
    const ly = y + 6;
    ac.globalCompositeOperation = 'lighter';
    ac.save();
    ac.translate(lx, 0);
    ac.fillStyle = sub.dir === 1 ? coneR! : coneL!;
    ac.beginPath();
    ac.moveTo(0, ly - 1);
    ac.lineTo(sub.dir * 70, ly - 9);
    ac.lineTo(sub.dir * 70, ly + 16);
    ac.lineTo(0, ly + 1);
    ac.closePath();
    ac.fill();
    ac.restore();
    ac.globalCompositeOperation = 'source-over';
    glow(glowL, lx, ly, 16, 0.7);
    ac.globalAlpha = 0.85;
    ac.drawImage(sub.dir === 1 ? spr.r : spr.l, x, y);
    ac.globalAlpha = 1;
    if (Math.floor(time * 1.5) % 2 === 0) px(ac, sub.dir === 1 ? x + 11 : x + spr.w - 12, y, 1, 1, '#ff8080');
    if (Math.random() < 0.15) addBubble(sub.dir === 1 ? x - 1 : x + spr.w, y + 5, 0, y - 6);
  }

  function drawShark(time: number) {
    if (!shark) return;
    const frame = Math.floor(time * 1.6) % 2 === 0 ? S.sharkA : S.sharkB;
    ac.globalAlpha = 0.5;
    ac.drawImage(shark.dir === 1 ? frame.r : frame.l, Math.round(shark.x), Math.round(shark.y + Math.sin(time * 0.5) * 3));
    ac.globalAlpha = 1;
  }

  /* ---------- director: who turns up, and when ---------- */

  function direct(dt: number, workers: number) {
    next.worker -= dt;
    next.selkath -= dt;
    next.sub -= dt;
    next.shark -= dt;
    next.lift -= dt;
    if (next.worker <= 0 && workers === 0) {
      spawnWorker(t < 2);
      // now and then a second worker follows partway through the first one's shift
      next.worker = !narrow && Math.random() < 0.2 ? rand(8, 16) : Infinity;
    } else if (next.worker <= 0 && workers === 1 && !narrow) {
      spawnWorker(false);
      next.worker = Infinity;
    }
    if (next.selkath <= 0 && !actors.some((a) => a.kind === 'selkath')) {
      spawnSelkath();
      next.selkath = Infinity;
    }
    if (next.sub <= 0 && !sub) {
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      sub = { x: dir === 1 ? -40 : AW + 40, y: rand(AH * 0.12, AH * 0.38), dir, speed: rand(14, 20) };
      next.sub = Infinity;
    }
    if (next.shark <= 0 && !shark) {
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      shark = { x: dir === 1 ? -40 : AW + 40, y: rand(AH * 0.06, AH * 0.3), dir, speed: rand(13, 18) };
      next.shark = Infinity;
    }
    if (next.lift <= 0) {
      // the plant ships canisters on its own too, drawn from the fullest right-hand tank
      if (lift.state === 'docked' && lift.cargo === 0) {
        lift.cargo = 2;
        lift.wait = 2;
        const right = tanks.filter((k) => k.x >= AW / 2).sort((a, b) => b.level - a.level);
        if (right[0]) right[0].level = Math.max(0.1, right[0].level - 0.12);
      }
      next.lift = Infinity;
    }
  }

  /** A visitor left: start that kind's empty-time clock. */
  function departed(kind: 'worker' | 'selkath' | 'sub' | 'shark') {
    if (kind === 'worker' && actors.some((a) => a.kind === 'worker' && !a.done)) return;
    next[kind] = gap(kind);
  }

  function moveSwimmers(dt: number) {
    if (sub) {
      sub.x += sub.dir * sub.speed * dt;
      if (sub.x < -60 || sub.x > AW + 60) {
        sub = null;
        departed('sub');
      }
    }
    if (shark) {
      shark.x += shark.dir * shark.speed * dt;
      if (shark.x < -60 || shark.x > AW + 60) {
        shark = null;
        departed('shark');
      }
    }
  }

  /* ---------- scroller: the station's LED ticker ---------- */

  function drawScroller(time: number, dt: number) {
    const c = ctx!;
    const adv = fontPx * (350 / 550);
    const total = text.length * adv;
    scrollX = (scrollX + dt * (fontPx * 2.6)) % total;
    const amp = fontPx * 0.12;
    const first = Math.floor(scrollX / adv);
    const offset = -(scrollX % adv);
    const count = Math.ceil(W / adv) + 2;
    const sh = Math.max(2, Math.round(fontPx / 11));
    for (let pass = 0; pass < 2; pass++) {
      c.fillStyle = pass === 0 ? 'rgba(1,10,15,0.85)' : scrollGrad;
      for (let k = 0; k < count; k++) {
        const ch = text[(first + k) % text.length];
        if (ch === ' ') continue;
        const x = offset + k * adv;
        const y = Math.round(scrollerBase + Math.sin(x * 0.009 + time * 1.6) * amp);
        if (pass === 0) c.fillText(ch, x + sh, y + sh);
        else c.fillText(ch, x, y);
      }
    }
  }

  /* ---------- frame ---------- */

  function frame(now: number, still = false) {
    // rAF timestamps can trail a performance.now() taken by a resize redraw, so clamp at 0
    const dt = still ? 0 : Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    t += dt;
    const pulseFn = (globalThis as { __koltoPulse?: () => number }).__koltoPulse;
    const boost = still || !pulseFn ? 0 : Math.max(0, Math.min(1, pulseFn()));
    if (!still && boost > 0.55 && boost - prevBoost > 0.15) {
      // a kick: the pumps thump and the seeps let go a burst of bubbles
      for (const p of pumps) for (let i = 0; i < 3; i++) addBubble(p.x + 5 + Math.random() * 4, floorY - 16, Math.random() < 0.5 ? 1 : 2);
      for (const s of seeps) addBubble(s.x, floorY - 1, 1);
    }
    prevBoost = boost;

    if (!still) {
      updateTransfer(dt);
      updateLift(dt);
      moveSwimmers(dt);
      let workers = 0;
      let anyDone = false;
      for (const a of actors) {
        if (a.kind === 'worker') updateWorker(a, dt);
        else updateSelkath(a, dt);
        if (a.done) anyDone = true;
        else if (a.kind === 'worker') workers++;
      }
      if (anyDone) {
        const gone = actors.filter((a) => a.done);
        actors = actors.filter((a) => !a.done);
        for (const a of gone) departed(a.kind);
      }
      direct(dt, workers);
    }

    ac.globalCompositeOperation = 'source-over';
    ac.globalAlpha = 1;
    ac.drawImage(bg, 0, 0);
    drawRays(t);
    drawShark(t);
    drawCaustics(t);
    drawSub(t);
    drawMotes(dt, t);
    drawFlow(t);
    tanks.forEach((k, i) => drawTank(k, i, t, boost, still));
    pumps.forEach((p, i) => drawPump(p, dt, boost, !!transfer && transfer.pump === i, still));
    drawLift(t);
    drawSeeps(dt, t, boost, still);
    for (const a of actors) {
      if (a.kind === 'worker') drawWorker(a, t, still);
      else drawSelkath(a, t);
    }
    drawBubbles(dt, t);

    const c = ctx!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    c.drawImage(art, 0, 0, AW * Pd, AH * Pd);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!still) drawScroller(t, dt);
  }

  function loop(now: number) {
    if (destroyed) return;
    frame(now);
    raf = requestAnimationFrame(loop);
  }

  function sync() {
    const run = visible && pageVisible && !reduced;
    cancelAnimationFrame(raf);
    if (run) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }

  function drawStill() {
    // one composed moment: a worker drawing kolto at a seep, canisters waiting at the lift
    t = 4.2;
    const seep = seeps[0];
    actors = [{ kind: 'worker', x: seep.x - 12, dir: 1, state: 'work', t: 3, seep, goal: seep.x - 12, fill: 0.6, exit: -1, speed: 0, done: false }];
    transfer = tanks.length > 1 ? { from: -1, to: 1, pump: 0, left: 0.2 } : null;
    lift.cargo = 2;
    lift.state = 'docked';
    lift.y = 0;
    bubbles.length = 0;
    const br = mulberry(9);
    for (let i = 0; i < 26; i++) addBubble(br() * AW, floorY - 28 + br() * 24, br() < 0.3 ? 1 : 0, floorY - 30, br);
    frame(performance.now(), true);
  }

  /** Re-measure only when the size or pixel ratio really changed; resizing the canvas blanks it. */
  function remeasure() {
    const r = host.getBoundingClientRect();
    const nd = Math.min(window.devicePixelRatio || 1, 2);
    if (Math.round(r.width) === W && Math.round(r.height) === H && nd === dpr) return;
    measure();
    if (!started) return;
    if (reduced) drawStill();
    else frame(performance.now());
  }

  measure();
  const ro = new ResizeObserver(remeasure);
  ro.observe(host);
  // a pixel-ratio change (zoom, moving to another screen) may not change the CSS size
  let dprQuery: MediaQueryList | null = null;
  const onDpr = () => {
    remeasure();
    watchDpr();
  };
  function watchDpr() {
    dprQuery?.removeEventListener('change', onDpr);
    dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    dprQuery.addEventListener('change', onDpr);
  }
  watchDpr();
  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    sync();
  });
  io.observe(host);
  const onVis = () => {
    pageVisible = !document.hidden;
    sync();
  };
  document.addEventListener('visibilitychange', onVis);

  const fontReady = document.fonts?.load ? document.fonts.load(`${fontPx}px "Departure Mono"`).catch(() => undefined) : Promise.resolve();
  void fontReady.then(() => {
    if (destroyed) return;
    started = true;
    applyFont();
    if (reduced) drawStill();
    else sync();
    opts.onLive?.();
  });

  return () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    dprQuery?.removeEventListener('change', onDpr);
    document.removeEventListener('visibilitychange', onVis);
  };
}
