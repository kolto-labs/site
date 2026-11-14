import { C } from '../../hero/sprites';
import type { Actor, Fx } from './kit';
import { COL, X, cl } from './kit';
import { L } from './layout';
import type { Sim } from './sim';
import type { Bg } from './art';
import { CAM, WIN, art, drawHarvester } from './art';

const hash = (n: number): number => {
  let a = Math.imul(n | 0, 0x9e3779b1) >>> 0;
  a ^= a >>> 15;
  a = Math.imul(a, 0x2c1b3c6d) >>> 0;
  return ((a ^ (a >>> 12)) >>> 0) / 4294967296;
};

const rect = (g: CanvasRenderingContext2D, col: string, x: number, y: number, w: number, h: number, a = 1): void => {
  g.globalAlpha = a;
  g.fillStyle = col;
  g.fillRect(Math.round(x), Math.round(y), w, h);
  g.globalAlpha = 1;
};

export function render(g: CanvasRenderingContext2D, S: Sim, bg: Bg, still: boolean): void {
  const f = bg.f;
  const A = art();
  const k = S.k;
  const st = S.env.state;
  const tm = still ? 0 : S.steps / 60;
  const X0 = (x: number): number => f.ox + x;
  const Y = f.Y;
  const { deck, wl, fl } = L;
  g.imageSmoothingEnabled = false;
  g.drawImage(bg.base, 0, 0);

  for (let x = -f.ox; x < f.W; x += 1) {
    const y = Y(wl) + Math.round(Math.sin(x * 0.11 + tm * 0.9) * 0.7);
    if ((x + f.ox) % 2 === 0) rect(g, COL.cyan, x + f.ox, y, 1, 1, 0.35);
  }

  WIN.forEach(([x, y, c], i) => {
    const on = still ? hash(i) > 0.35 : Math.sin(tm * 0.05 * (1 + (i % 5) * 0.2) + i * 1.7) > -0.4;
    if (on) rect(g, c ? COL.cyan : '#ffd27a', X0(x), Y(y), 3, 3, 0.85);
  });
  const hall = 0.2 + 0.7 * k.hall;
  const hc = k.vd === 1 ? COL.phos : k.vd === 2 ? COL.amber : '#d8b86a';
  rect(g, hc, X0(7), Y(deck - 21), 48, 14, hall);
  for (let i = 0; i < 6; i++) rect(g, '#1d4a5c', X0(7 + i * 9), Y(deck - 21), 1, 14);
  rect(g, '#12384a', X0(7), Y(deck - 8), 48, 2);
  const sh = k.door * 8;
  if (sh > 0) {
    rect(g, C.metal, X0(180), Y(deck - 17), sh, 17);
    rect(g, C.metal, X0(196) - sh, Y(deck - 17), sh, 17);
    rect(g, C.metalHi, X0(180) + sh - 1, Y(deck - 17), 1, 17);
    rect(g, C.metalHi, X0(196) - sh, Y(deck - 17), 1, 17);
  }
  rect(g, '#5a3a10', X0(103), Y(deck - 11), 7, 11, 0.9);
  rect(g, '#ffd27a', X0(104), Y(deck - 10), 5, 9, 0.18);
  const sel = A.s;
  const ov = k.port ? sel.selB : sel.selA;
  g.drawImage(ov.l, X0(L.ov) - 7, Y(deck) - ov.h);
  g.drawImage(sel.selA.r, X0(L.off) - 7 + 8, Y(deck) - sel.selA.h);
  if (k.fee) {
    g.globalAlpha = 0.5;
    g.drawImage(A.glowA, X0(205) - 8, Y(deck - 31) - 8, 16, 16);
    g.globalAlpha = 1;
  }
  rect(g, k.fee ? COL.amber : '#5a3a10', X0(204), Y(deck - 32), 3, 3);
  const mg = 0.55 + 0.45 * Math.sin(tm * 2);
  rect(g, COL.mag, X0(L.bay[3] - 1), Y(deck - 23), 3, 2, still ? 1 : mg);
  const cp = still ? 3 : (tm / (k.cam ? 0.9 : 4.2)) * 5;
  CAM.forEach((x, i) => {
    const on = ((cp - i * 0.7 * (k.cam ? 0.2 : 1)) % 5) + 5 < 5.35;
    const lit = still ? i % 2 === 0 : (Math.floor(cp - i) % 5 + 5) % 5 === 0;
    if (on || lit) rect(g, COL.phos, X0(x), Y(deck - 9), 1, 1, 0.9);
  });
  if (k.cons) rect(g, COL.phos, X0(L.con - 1), Y(deck - 5), 3, 2, 0.9);
  rect(g, k.mon ? COL.phos : '#2a5566', X0(154), Y(wl + 19), 4, 2);

  if (st[0] !== 'T') {
    const sx = k.shake > 0.3 ? (((S.steps >> 1) & 1) * 2 - 1) * k.shake * 1.5 : 0;
    g.save();
    g.translate(sx, 0);
    const pods = st === 'R3' ? false : true;
    for (let i = 0; i < 2; i++) {
      const hx = i ? L.h2 : L.h1;
      const wr = i && st === 'R2' ? k.wreck : 0;
      const gl = k.pod > 0 ? k.pod : st === 'R0' || st === 'R1' ? 0.5 + 0.5 * Math.sin(tm * 1.6 + i * 2) : 0.3;
      const lit = pods && !(st === 'R2' && i === 0 && S.open >= 1) && !(st === 'R2' && wr > 0.5);
      drawHarvester(g, X0(hx), Y(fl) + 1, i === 1, gl, wr, lit);
    }
    for (let i = 0; i < 3; i++) {
      const x = L.st[i];
      const kw = i === 0 ? k.w0 : i === 1 ? k.w1 : k.w2;
      const base = st === 'R1' ? (still ? 0 : 0.35 + 0.65 * (hash(Math.floor(tm * 7) * 3 + i) > 0.35 ? 1 : 0)) : st === 'R3' ? 0.6 : 1;
      const b = cl(base * kw, 0, 1.6);
      for (let j = 0; j < 3; j++) {
        if (i === 1 && j === 1) continue;
        rect(g, COL.cyan, X0(x - 8 + j * 6), Y(fl) - 12, 3, 3, Math.min(1, b) * 0.9);
        if (b > 1) rect(g, COL.white, X0(x - 8 + j * 6), Y(fl) - 12, 3, 3, b - 1);
      }
    }
    const pb = cl((st === 'R1' ? (still ? 0 : 0.5) : 1) * k.w1, 0, 1);
    rect(g, '#5a8aa0', X0(L.st[1] - 5), Y(fl) - 13, 10, 6, 0.65 * pb);
    if (k.ctl) {
      g.globalAlpha = 0.5;
      g.drawImage(A.glowW, X0(L.st[2] + 1) - 6, Y(fl) - 14, 12, 12);
      g.globalAlpha = 1;
      rect(g, COL.white, X0(L.st[2]) + 1, Y(fl) - 9, 2, 2);
    }
    rect(g, COL.amber, X0(L.hatch) - 3, Y(fl) - 15, 2, 2, still ? 1 : Math.floor(tm / 0.7) & 1 ? 1 : 0.35);
    const px0 = X0(L.panel);
    rect(g, C.metal, px0 - 4, Y(fl) - 6, 9, 6);
    rect(g, '#07151d', px0 - 3, Y(fl) - 5, 7, 3);
    rect(g, COL.phos, px0 - 2, Y(fl) - 5 + 3 - Math.round(k.ga * 3), 2, Math.max(0, Math.round(k.ga * 3)), 0.9);
    rect(g, COL.phos, px0 + 1, Y(fl) - 5 + 3 - Math.round(k.gb * 3), 2, Math.max(0, Math.round(k.gb * 3)), 0.9);
    g.restore();
  }
  if (k.dark < 0.5) {
    g.globalAlpha = 0.4;
    g.drawImage(A.glowT, X0(L.vx) - 18, Y(fl) - 20, 36, 36);
    g.globalAlpha = 1;
  }
  rect(g, k.dark > 0.5 ? COL.rim : COL.kolto, X0(L.vx), Y(fl) - 1, 1, 4);

  for (const b of S.parts) {
    const x = X0(b.x);
    const y = Y(b.y);
    if (b.col === 0) {
      g.globalAlpha = 0.85;
      g.fillStyle = COL.kolto;
      g.fillRect(Math.round(x), Math.round(y), b.r, b.r);
      if (b.r === 2) rect(g, '#c9fbff', x, y, 1, 1, 0.9);
      g.globalAlpha = 1;
    } else {
      rect(g, COL.rim, x - 1, y - 1, b.r + 2, b.r + 2, 0.9);
      rect(g, COL.void, x, y, b.r, b.r);
    }
  }

  for (let z = 0; z < 4; z++) {
    for (const a of S.actors) if (a.z === z && !a.dead && a.alpha > 0.01) actorDraw(g, a, S, bg);
  }

  for (let i = 0; i < S.nfx; i++) fxDraw(g, S.fx[i], bg);
  g.globalAlpha = 1;
  g.drawImage(bg.murk, 0, 0);

  if (k.tint > 0.02) {
    const t2 = A.tmp2;
    if (t2.width < f.W) t2.width = f.W;
    if (t2.height < f.H) t2.height = f.H;
    const c2 = t2.getContext('2d')!;
    c2.globalCompositeOperation = 'source-over';
    c2.clearRect(0, 0, f.W, f.H);
    c2.drawImage(g.canvas, 0, 0);
    c2.globalCompositeOperation = 'source-atop';
    c2.fillStyle = 'rgba(210,240,255,0.55)';
    c2.fillRect(0, 0, f.W, f.H);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.24 * k.tint;
    const o = Math.round(2 * k.tint);
    g.drawImage(t2, 0, 0, f.W, f.H, -o, 0, f.W, f.H);
    g.drawImage(t2, 0, 0, f.W, f.H, o, 0, f.W, f.H);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    rect(g, COL.white, 0, 0, f.W, f.H, 0.04 * k.tint);
  }
}

function actorDraw(g: CanvasRenderingContext2D, a: Actor, S: Sim, bg: Bg): void {
  const f = bg.f;
  const A = art();
  const x = f.ox + a.x;
  const y = f.Y(a.y);
  const s = A.s;
  g.globalAlpha = cl(a.alpha, 0, 1);
  switch (a.sp) {
    case 'shark': {
      const sp = a.fr ? s.sharkB : s.sharkA;
      g.drawImage(a.dir > 0 ? sp.r : sp.l, Math.round(x - (sp.w * a.sc) / 2), Math.round(y - (sp.h * a.sc) / 2), Math.round(sp.w * a.sc), Math.round(sp.h * a.sc));
      break;
    }
    case 'giant': {
      const sp = a.fr ? s.sharkB : s.sharkA;
      const w = Math.round(sp.w * a.sc);
      const h = Math.round(sp.h * a.sc);
      const t = A.tmp;
      const c2 = t.getContext('2d')!;
      c2.globalCompositeOperation = 'source-over';
      c2.clearRect(0, 0, t.width, t.height);
      c2.imageSmoothingEnabled = false;
      c2.drawImage(a.dir > 0 ? sp.r : sp.l, 0, 0, w, h);
      const m = Math.round(a.mask * w);
      c2.globalCompositeOperation = 'destination-out';
      c2.fillRect(a.dir > 0 ? 0 : w - m, 0, m, h);
      g.drawImage(t, 0, 0, w, h, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
      break;
    }
    case 'sel': {
      const sp = a.fr ? s.selB : s.selA;
      g.drawImage(a.dir > 0 ? sp.r : sp.l, Math.round(x - sp.w / 2), Math.round(y - sp.h));
      break;
    }
    case 'selw': {
      const sp = a.fr ? s.selB : s.selA;
      g.save();
      g.translate(Math.round(x), Math.round(y));
      g.rotate(a.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      g.drawImage(sp.r, -Math.round(sp.w / 2), -Math.round(sp.h / 2));
      g.restore();
      if (a.kind === 'harvester') {
        const len = sp.h;
        const ow = Math.round(len * 0.45);
        const ox = a.dir > 0 ? x - len / 2 : x + len * 0.05;
        for (let i = 0; i < 3; i++) rect(g, '#062433', ox + i * 2, y - 8 + i * 2, ow - i * 4, 16 - i * 4, 0.3 * (a.alpha / 0.5));
      }
      break;
    }
    case 'suit': {
      const sp = a.fr ? s.walkB : s.walkA;
      const ax = Math.round(x - 6);
      const ay = Math.round(y - 18);
      g.drawImage(a.dir > 0 ? sp.r : sp.l, ax, ay);
      if (a.acc) {
        g.fillStyle = a.acc;
        g.fillRect(ax + 5, ay + 8, 2, 1);
        g.fillRect(ax + (a.dir > 0 ? 9 : 2), ay + 3, 1, 1);
      }
      if (a.carry) crateAt(g, x + a.dir * 7 - 2, y - 13, 1, S.env.state !== 'R3');
      break;
    }
    case 'cloak': {
      const sp = A.cloak;
      g.drawImage(a.dir > 0 ? sp.r : sp.l, Math.round(x - sp.w / 2), Math.round(y - sp.h));
      break;
    }
    case 'sub': {
      const sp = s.sub;
      const sx = Math.round(x - sp.w / 2);
      const sy = Math.round(y - sp.h / 2);
      if (a.lit) {
        g.globalAlpha = 0.14 * a.alpha;
        g.fillStyle = '#ffd27a';
        g.beginPath();
        g.moveTo(x + a.dir * 14, y + 1);
        g.lineTo(x + a.dir * 44, y - 9);
        g.lineTo(x + a.dir * 44, y + 11);
        g.fill();
        g.globalAlpha = a.alpha;
      }
      g.drawImage(a.dir > 0 ? sp.r : sp.l, sx, sy);
      if (!a.lit) {
        g.fillStyle = '#22323a';
        g.fillRect(sx + (a.dir > 0 ? 19 : 6), sy + 4, 3, 2);
        g.fillRect(sx + (a.dir > 0 ? 26 : 1), sy + 6, 2, 1);
      }
      break;
    }
    case 'droid': {
      const sp = A.droid;
      g.drawImage(sp.r, Math.round(x - 4), Math.round(y - 4));
      if (S.k.spin) rect(g, COL.amber, x + Math.cos(S.k.spin) * 4, y - 5 + Math.sin(S.k.spin) * 3, 2, 1);
      break;
    }
    default: {
      const k = a.sp.charCodeAt(a.sp.length - 1) - 48;
      const sp =
        a.sp === 'ship1d' ? A.dark : a.sp === 'speeder' ? A.speeder : a.sp === 'racer' ? A.racer : a.sp[4] === 'm' ? A.shipsM[k] : A.ships[k];
      g.drawImage(a.dir > 0 ? sp.r : sp.l, Math.round(x - sp.w / 2), Math.round(f.Y(a.y)));
    }
  }
  g.globalAlpha = 1;
}

function crateAt(g: CanvasRenderingContext2D, x: number, y: number, a: number, lit: number | boolean): void {
  const px = Math.round(x);
  const py = Math.round(y);
  rect(g, '#6f8791', px, py, 6, 7, a);
  rect(g, '#9bb3bc', px, py, 6, 1, a);
  rect(g, '#3f5a66', px, py + 2, 6, 1, a);
  rect(g, '#3f5a66', px, py + 5, 6, 1, a);
  if (lit) rect(g, COL.kolto, px + 2, py + 3, 2, 2, a * 0.9);
}

function fxDraw(g: CanvasRenderingContext2D, q: Fx, bg: Bg): void {
  const f = bg.f;
  const A = art();
  const x = f.ox + q.x;
  const y = f.Y(q.y);
  switch (q.t) {
    case X.ring:
      g.globalAlpha = cl(q.b, 0, 1);
      g.strokeStyle = q.col;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, Math.max(0.5, q.a), 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
      break;
    case X.flash: {
      const r = Math.max(2, q.a);
      g.globalAlpha = cl(q.b, 0, 1);
      g.drawImage(q.col === COL.amber || q.col === '#ffd9a0' ? A.glowA : A.glowW, x - r, y - r, r * 2, r * 2);
      g.globalAlpha = 1;
      break;
    }
    case X.tick:
      for (const [dx, dy] of [[0, 3], [1, 4], [2, 3], [3, 2], [4, 1]]) rect(g, COL.phos, x + dx, y + dy, 1, 1, q.a);
      break;
    case X.card:
      rect(g, '#cfe9f2', x, y, 6, 4, q.a);
      rect(g, COL.phos, x, y + 3, 6, 1, q.a);
      break;
    case X.token:
      rect(g, COL.mag, x - 1, y - 1, 3, 3, q.a);
      if (q.b) rect(g, COL.white, x, y - 1, 1, 1, q.a);
      break;
    case X.lamp:
      g.globalAlpha = cl(q.a, 0, 1) * 0.3;
      g.fillStyle = q.col;
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 4, 4);
      rect(g, q.col, x, y, 2, 2, cl(q.a, 0, 1));
      break;
    case X.dust:
      g.globalAlpha = cl(q.a, 0, 1);
      g.fillStyle = q.col;
      g.beginPath();
      g.arc(x, y, Math.max(0.5, q.b), 0, Math.PI * 2);
      g.fill();
      if (q.col === COL.void) {
        g.strokeStyle = COL.rim;
        g.stroke();
      }
      g.globalAlpha = 1;
      break;
    case X.rect:
      rect(g, q.col, x, y, q.a, q.b, q.c);
      break;
    case X.crate:
      crateAt(g, x, y, q.a, q.b);
      break;
    case X.judge:
      rect(g, COL.void, x, y + 3, 5, 6, q.a);
      rect(g, '#0c171c', x + 1, y, 3, 3, q.a);
      break;
  }
}
