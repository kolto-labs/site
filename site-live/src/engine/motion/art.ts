import { C, glowSprite, sprite, sprites } from '../../hero/sprites';
import type { Sprite } from '../../hero/sprites';
import { mulberry32 } from '../core/rng';
import type { WorldStateId } from '../core/types';
import { COL, cl } from './kit';
import { L } from './layout';

export interface Xf {
  W: number;
  H: number;
  ox: number;
  y0: number;
  extra: number;
  crop: number;
  Y(y: number): number;
  iy(y: number): number;
}

export function xf(W: number, H: number, crop: number): Xf {
  const y0 = crop === 2 ? L.wl - 2 : 0;
  const h = crop === 1 ? L.wl + 16 : L.H - y0;
  const extra = H - h;
  const Y =
    crop === 1
      ? (y: number): number => y + extra
      : (y: number): number => y - y0 + (y > L.wl ? extra * cl((y - L.wl) / (L.fl - L.wl), 0, 1) : 0);
  const iy = (v: number): number => {
    if (crop === 1) return v - extra;
    let lo = 0;
    let hi: number = L.H;
    for (let i = 0; i < 12; i++) {
      const m = (lo + hi) / 2;
      if (Y(m) < v) lo = m;
      else hi = m;
    }
    return lo;
  };
  return { W, H, ox: Math.floor((W - L.W) / 2), y0, extra, crop, Y, iy };
}

const rows = (r: string[], p: Record<string, string>): Sprite => sprite(r, p);

const HULL = { K: '#0a171d', S: '#3d5560', D: '#22323a', H: '#7d97a1', W: COL.cyan, N: '#cfe9f2', M: COL.mag };
const HULLM = { ...HULL, W: COL.mag, N: COL.mag };
const DARK = { K: '#020304', S: '#161f26', D: '#0c1317', H: '#2a3a44', W: COL.mag, N: COL.mag, M: COL.mag };

export interface Art {
  s: ReturnType<typeof sprites>;
  ships: Sprite[];
  shipsM: Sprite[];
  dark: Sprite;
  speeder: Sprite;
  racer: Sprite;
  droid: Sprite;
  cloak: Sprite;
  glowT: HTMLCanvasElement;
  glowA: HTMLCanvasElement;
  glowW: HTMLCanvasElement;
  tmp: HTMLCanvasElement;
  tmp2: HTMLCanvasElement;
}

let ART: Art | null = null;

export function art(): Art {
  if (ART) return ART;
  const ship0 = [
    '..........KKKKKKKK............',
    '........KKSSSSSSSSKK..........',
    '.....KKKSSSSSSSSSSSSKKK.......',
    '..KKKSSSSSSSSSSSSSSSSSSKKK....',
    '.KSSSSSSSSSSSSSSSSSSSSSSSSKK..',
    'KSSSSHHSSSSSSSSSSSSSSWWSSSSSK.',
    'KDSSSSSSSSSSSSSSSSSSSSSSSSSDKN',
    '.KDDDDDDDDDDDDDDDDDDDDDDDDDK..',
    '..KKKKKKKKKKKKKKKKKKKKKKKKK...',
    '....K.K..............K.K.....',
    '....K.K..............K.K.....',
  ];
  const ship1 = [
    '......KKKKKK........',
    '....KKSSSSSSKK......',
    '..KKSSSSHHSSSSKK....',
    '.KSSSSSSSSSSSSWWK...',
    'KDSSSSSSSSSSSSSSSKN.',
    '.KDDDDDDDDDDDDDDK...',
    '..KKKKKKKKKKKKKK....',
    '....K..K....K..K....',
  ];
  const ship2 = [
    '....KKKKKK....',
    '..KKSSSHSSKK..',
    '.KSSSSSSSSWWK.',
    'KDSSSSSSSSSSDK',
    '.KKKKKKKKKKKK.',
    '...K......K...',
  ];
  const ship1d = ship1.map((r, i) => (i === 4 ? r.replace(/S/g, 'M') : r));
  const tmp = document.createElement('canvas');
  tmp.width = 160;
  tmp.height = 64;
  const tmp2 = document.createElement('canvas');
  const s = sprites();
  ART = {
    s,
    ships: [rows(ship0, HULL), rows(ship1, HULL), rows(ship2, HULL)],
    shipsM: [rows(ship0, HULLM), rows(ship1, HULLM), rows(ship2, HULLM)],
    dark: rows(ship1d, DARK),
    speeder: rows(
      ['......KKKKKK....', '..KKKKSSSSSSKK..', 'KSSSSSSSSSSSSSMK', '.KDDDDDDDDDDDDK.', '..KKKKKKKKKKKK..'],
      HULL,
    ),
    racer: rows(['.KSSK.', 'KSSSWK', '.KKKK.'], HULL),
    droid: rows(
      ['...KKK...', '..KSSSK..', '.KSHSSSK.', '.KSSWSSK.', '.KSSSSDK.', '..KDDDK..', '...KKK...', '..K.K.K..'],
      { K: '#0a171d', S: '#3d5560', D: '#22323a', H: '#7d97a1', W: COL.amber },
    ),
    cloak: rows(
      [
        '...kkkk..', '..kKKKKk.', '..kKKKKk.', '..kKKKKk.', '..kKKKKk.', '.kKKKKKKk', '.kKKKKKKk', 'kKKKKMKKk',
        'kKKKKKKKk', 'kKKKKKKKk', 'kKKKKKKKk', 'kKKKKKKKk', '.kKKKKKk.', '.kk...kk.',
      ],
      { K: '#0b0f14', k: '#1c2831', M: COL.mag },
    ),
    glowT: glowSprite(48, '25,227,193', 0.5),
    glowA: glowSprite(40, '255,176,0', 0.5),
    glowW: glowSprite(40, '232,251,255', 0.6),
    tmp,
    tmp2,
  };
  return ART;
}

const px = (g: CanvasRenderingContext2D, col: string, x: number, y: number, w: number, h: number): void => {
  g.fillStyle = col;
  g.fillRect(Math.round(x), Math.round(y), w, h);
};

export const WIN: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = [];
  const add = (x0: number, y0: number, nx: number, ny: number, dx: number, dy: number, c: number): void => {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out.push([x0 + i * dx, y0 + j * dy, c]);
  };
  add(68, L.deck - 20, 4, 2, 7, 9, 0);
  add(102, L.deck - 17, 1, 1, 0, 0, 1);
  add(114, L.deck - 17, 3, 1, 5, 0, 0);
  add(156, L.deck - 22, 4, 2, 11, 8, 0);
  add(204, L.deck - 9, 1, 1, 0, 0, 1);
  return out;
})();

export const CAM: readonly number[] = [226, 246, 266, 286, 300];

function murk(f: Xf): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = f.W;
  c.height = f.H;
  const g = c.getContext('2d')!;
  const top = Math.max(0, f.Y(L.wl) - 1);
  const x0 = f.ox + 6;
  const x1 = f.ox + 314;
  const gl = g.createLinearGradient(x0 - 40, 0, x0 + 18, 0);
  gl.addColorStop(0, 'rgba(3,19,28,1)');
  gl.addColorStop(1, 'rgba(3,19,28,0)');
  g.fillStyle = gl;
  g.fillRect(0, top, x0 + 18, f.H - top);
  const gr = g.createLinearGradient(x1 - 18, 0, x1 + 40, 0);
  gr.addColorStop(0, 'rgba(3,19,28,0)');
  gr.addColorStop(1, 'rgba(3,19,28,1)');
  g.fillStyle = gr;
  g.fillRect(x1 - 18, top, f.W - x1 + 18, f.H - top);
  return c;
}

export interface Bg {
  base: HTMLCanvasElement;
  murk: HTMLCanvasElement;
  f: Xf;
}

export function buildBg(f: Xf, state: WorldStateId): Bg {
  const c = document.createElement('canvas');
  c.width = f.W;
  c.height = f.H;
  const g = c.getContext('2d')!;
  const Y = f.Y;
  const X = (x: number): number => f.ox + x;
  const { deck, wl, fl } = L;
  const sky = g.createLinearGradient(0, 0, 0, Y(deck));
  sky.addColorStop(0, '#04111b');
  sky.addColorStop(1, '#0d3a52');
  g.fillStyle = sky;
  g.fillRect(0, 0, f.W, Y(wl) + 1);
  const rs = mulberry32(7);
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rs() * f.W);
    const y = Math.floor(rs() * Math.max(1, Y(deck) - 14));
    px(g, rs() < 0.3 ? '#9ff0ff' : '#3d6f84', x, y, 1, 1);
  }
  const w = g.createLinearGradient(0, Y(wl), 0, f.H);
  w.addColorStop(0, C.waterTop);
  w.addColorStop(0.35, C.waterMid);
  w.addColorStop(0.8, C.waterLow);
  w.addColorStop(1, C.abyss);
  g.fillStyle = w;
  g.fillRect(0, Y(wl), f.W, f.H - Y(wl));
  const rr = mulberry32(11);
  g.globalAlpha = 0.07;
  for (let i = 0; i < 6; i++) {
    const x = rr() * f.W;
    const k = 6 + rr() * 10;
    g.fillStyle = COL.cyan;
    g.beginPath();
    g.moveTo(x, Y(wl));
    g.lineTo(x + k, Y(wl));
    g.lineTo(x + k * 3 - 20, Y(fl));
    g.lineTo(x + k * 2 - 28, Y(fl));
    g.fill();
  }
  g.globalAlpha = 1;
  const rf = mulberry32(5);
  for (let x = 0; x < f.W; x += 3) {
    const h1 = 8 + 8 * Math.sin(x * 0.03) + rf() * 3;
    px(g, C.ridgeFar, x, Y(fl) - h1 - 10, 3, h1 + 12);
    const h2 = 4 + 5 * Math.sin(x * 0.07 + 2) + rf() * 2;
    px(g, C.ridgeNear, x, Y(fl) - h2, 3, h2 + 2);
  }
  px(g, C.sediment, 0, Y(fl), f.W, f.H - Y(fl));
  const sp = mulberry32(13);
  for (let i = 0; i < 90; i++) {
    px(g, sp() < 0.5 ? C.sedimentHi : C.sedimentLo, sp() * f.W, Y(fl) + 1 + sp() * Math.max(1, f.H - Y(fl)), 1 + (sp() < 0.3 ? 1 : 0), 1);
  }
  const cx = X(L.vx);
  g.fillStyle = COL.void;
  g.beginPath();
  g.moveTo(cx - 26, Y(fl) + 3);
  g.lineTo(cx + 26, Y(fl) + 3);
  g.lineTo(cx + 46, f.H);
  g.lineTo(cx - 46, f.H);
  g.fill();
  px(g, C.sedimentHi, cx - 28, Y(fl) + 2, 6, 1);
  px(g, C.sedimentHi, cx + 22, Y(fl) + 2, 6, 1);
  px(g, '#0c3a47', cx - 1, Y(fl) - 1, 3, 5);
  const fd = g.createLinearGradient(0, Y(fl), 0, f.H);
  fd.addColorStop(0, 'rgba(3,19,28,0)');
  fd.addColorStop(1, 'rgba(3,19,28,0.85)');
  g.fillStyle = fd;
  g.fillRect(0, Y(fl), f.W, f.H - Y(fl));

  const d = Y(deck);
  const wy = Y(wl);
  px(g, C.metalLo, 0, d, f.W, 4);
  px(g, C.metal, 0, d, f.W, 1);
  px(g, '#0c2733', 0, d + 4, f.W, wy - d + 10);
  for (let x = 0; x < f.W; x += 9) px(g, '#10303d', x, d + 5, 1, wy - d + 8);
  px(g, '#07151d', 0, wy + 10, f.W, 1);
  const hr = mulberry32(21);
  for (let x = -f.ox - 20; x < 340 + f.ox + 20; x += 1) {
    if (x >= 0 && x < 320) continue;
    if (hr() < 0.045) {
      const bw = 12 + Math.floor(hr() * 16);
      const bh = 14 + Math.floor(hr() * 22);
      px(g, '#0a2231', X(x), d - bh, bw, bh);
      px(g, '#10303d', X(x), d - bh, bw, 1);
      for (let k = 0; k < 4; k++) if (hr() < 0.6) px(g, '#c9a24a', X(x) + 2 + hr() * (bw - 4), d - bh + 3 + Math.floor(hr() * (bh - 6)), 1, 2);
      x += bw;
    }
  }
  const B = (x: number, w2: number, h: number, col = '#102f3e'): void => {
    px(g, col, X(x), d - h, w2, h);
    px(g, C.metal, X(x), d - h, w2, 1);
    px(g, C.metalLo, X(x), d - 1, w2, 1);
  };
  B(4, 54, 34, '#12384a');
  px(g, '#0a2231', X(2), d - 38, 58, 4);
  px(g, C.metal, X(2), d - 38, 58, 1);
  for (let i = 0; i < 6; i++) px(g, '#1d4a5c', X(8 + i * 9), d - 34, 3, 34);
  px(g, '#07151d', X(7), d - 21, 48, 14);
  B(64, 30, 24);
  B(98, 30, 20);
  px(g, COL.void, X(103), d - 11, 7, 11);
  px(g, '#5a3a10', X(102), d - 12, 9, 1);
  B(152, 48, 26);
  px(g, COL.void, X(180), d - 17, 16, 17);
  px(g, C.metal, X(179), d - 18, 18, 1);
  B(202, 8, 12, '#0f2a37');
  px(g, '#1d4a5c', X(205), d - 30, 1, 18);
  const crateAt = (x: number, y: number): void => {
    px(g, '#6f8791', X(x), y, 6, 7);
    px(g, '#3f5a66', X(x), y + 2, 6, 1);
    px(g, '#3f5a66', X(x), y + 5, 6, 1);
    px(g, '#9bb3bc', X(x), y, 6, 1);
    px(g, '#0c171c', X(x), y + 7, 6, 1);
  };
  for (const [cxx, r] of [[132, 0], [139, 0], [146, 0], [132, 1], [139, 1], [146, 1]]) crateAt(cxx, d - 7 * (r + 1));
  for (const bx of L.bay.slice(0, 3)) {
    px(g, C.metalHi, X(bx - 9), d - 1, 18, 2);
    px(g, '#7a8f99', X(bx - 9), d - 1, 18, 1);
    px(g, C.metal, X(bx - 10), d - 14, 2, 14);
    px(g, C.metal, X(bx - 10), d - 14, 6, 1);
  }
  const hb = L.bay[3];
  px(g, '#0a1a22', X(hb - 14), d - 20, 28, 20);
  px(g, C.metal, X(hb - 14), d - 20, 28, 1);
  px(g, COL.void, X(hb - 10), d - 14, 20, 14);
  px(g, C.metalHi, X(hb - 11), d - 1, 22, 2);
  px(g, COL.mag, X(hb - 1), d - 23, 3, 2);
  for (const x of CAM) {
    px(g, C.metal, X(x), d - 9, 1, 9);
    px(g, '#7d97a1', X(x - 1), d - 10, 3, 2);
  }
  px(g, C.metal, X(L.con - 2), d - 5, 5, 5);
  px(g, '#0a1a22', X(L.con - 1), d - 5, 3, 2);
  px(g, C.metalHi, X(L.sbx - 5), wy - 1, 11, 6);
  px(g, COL.void, X(L.sbx - 4), wy, 9, 4);
  px(g, '#5a3a10', X(L.sbx - 5), wy - 1, 11, 1);
  px(g, C.metal, X(155), wy + 8, 2, 12);
  px(g, '#7d97a1', X(154), wy + 19, 4, 2);

  if (state[0] !== 'T') {
    const st = L.st;
    for (let i = 0; i < 3; i++) {
      const x = st[i];
      px(g, '#12384a', X(x - 11), Y(fl) - 16, 22, 17);
      px(g, C.metalHi, X(x - 11), Y(fl) - 16, 22, 1);
      px(g, C.metal, X(x - 11), Y(fl) - 15, 1, 16);
      px(g, '#0a2231', X(x - 11), Y(fl) - 3, 22, 4);
      px(g, C.sedimentHi, X(x - 12), Y(fl) - 1, 24, 2);
    }
    px(g, '#07151d', X(L.hatch - 6), Y(fl) - 12, 7, 9);
    px(g, C.metalHi, X(L.hatch - 7), Y(fl) - 13, 9, 1);
    px(g, C.metal, X(L.st[1] - 6), Y(fl) - 14, 12, 8);
    px(g, '#07151d', X(L.st[1] - 5), Y(fl) - 13, 10, 6);
  }
  return { base: c, murk: murk(f), f };
}

export function drawHarvester(g: CanvasRenderingContext2D, x: number, y: number, big: boolean, glow: number, wreck: number, lit: boolean): void {
  g.save();
  g.translate(x, y);
  const w = 1 - wreck;
  g.globalAlpha = Math.max(w, 0);
  if (w > 0) {
    px(g, '#1d4a5c', -14, -9, 28, 9);
    px(g, C.metalHi, -14, -9, 28, 1);
    px(g, C.metal, -14, -8, 1, 8);
    px(g, '#0a2231', -14, -2, 28, 3);
    px(g, C.metalLo, -12, 1, 6, 2);
    px(g, C.metalLo, 6, 1, 6, 2);
    px(g, '#174459', -9, -16, 14, 7);
    px(g, C.metalHi, -9, -16, 14, 1);
    px(g, C.glass, -7, -14, 6, 3);
    px(g, '#2a5566', 5, -12, 8, 2);
    px(g, '#2a5566', 11, -12, 2, 8);
    px(g, '#0b2533', 11, -5, 3, 3);
    const pw = big ? 6 : 4;
    const ph = big ? 8 : 5;
    const pod = lit ? 0.45 + 0.4 * glow : 0.12;
    px(g, '#3a2a10', -13, -9 - ph, pw, ph);
    g.globalAlpha = Math.max(w, 0) * pod;
    px(g, COL.amber, -13, -9 - ph, pw, ph);
    g.globalAlpha = Math.max(w, 0);
    px(g, '#7d97a1', -13, -9 - ph, pw, 1);
  }
  g.globalAlpha = wreck;
  if (wreck > 0) {
    const dy = (1 - wreck) * 3;
    g.translate(0, dy);
    g.rotate(-0.16);
    px(g, '#102f3e', -14, -7, 28, 7);
    px(g, '#1d4a5c', -14, -7, 28, 1);
    px(g, '#0a2231', -10, -12, 9, 5);
    g.rotate(0.16);
    px(g, '#174459', 8, -5, 6, 4);
    px(g, '#0b2533', -18, -2, 5, 2);
    px(g, '#0b2533', 15, -3, 4, 3);
    px(g, '#3a2a10', 2, -10, 4, 3);
    px(g, '#102f3e', -4, -4, 7, 3);
    px(g, COL.void, -2, -1, 5, 2);
  }
  g.restore();
}
