/** Pure data and helpers for the hero scene: palette, pixel sprites, glow and caustic tiles, seeded RNG. */

/* ---------------------------------------------------------------- palette */

export const C = {
  waterTop: '#0b3244',
  waterMid: '#072535',
  waterLow: '#041722',
  abyss: '#03131c',
  ridgeFar: '#062b3a',
  ridgeNear: '#04202c',
  sediment: '#0a2a36',
  sedimentHi: '#13404f',
  sedimentLo: '#051a23',
  pipeHi: '#3d6f84',
  pipe: '#174459',
  pipeLo: '#0b2533',
  metalHi: '#5d8fa3',
  metal: '#2a5566',
  metalLo: '#10303d',
  glass: '#05222f',
  kolto: '#4fe3ee',
  koltoMid: '#1fa3b5',
  koltoDeep: '#13798a',
  koltoFoam: '#c9fbff',
  gauge: '#ffab5c',
  lamp: '#ffd27a',
};

/* ---------------------------------------------------------------- sprites */

export interface Sprite {
  r: HTMLCanvasElement; // facing right
  l: HTMLCanvasElement; // facing left
  w: number;
  h: number;
}

export function sprite(rows: string[], pal: Record<string, string>): Sprite {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const r = document.createElement('canvas');
  r.width = w;
  r.height = h;
  const g = r.getContext('2d')!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  const l = document.createElement('canvas');
  l.width = w;
  l.height = h;
  const gl = l.getContext('2d')!;
  gl.translate(w, 0);
  gl.scale(-1, 1);
  gl.drawImage(r, 0, 0);
  return { r, l, w, h };
}

// Republic environment suit: domed helmet, amber helmet lamp, air pack on the back.
const SUIT = {
  K: '#0c171c',
  W: '#d3e0e3',
  S: '#8fa6ad',
  D: '#4c626b',
  V: '#0f3440',
  H: '#9ff0ff',
  L: '#ffd27a',
  T: '#5f7880',
  Y: '#c9a24a',
};
const SUIT_TOP = [
  '....KKKK....',
  '...KSWWWK...',
  '..KSWWVVVK..',
  '..KSWVHVVKL.',
  '..KSWVVVVK..',
  '...KSWWWK...',
  '.KKKDSSDDK..',
  'KTTKSWWWSK..',
  'KTTKSWWWSWK.',
  'KTTKSYWWSWK.',
  'KTTKSWWSSDK.',
  '.KKKDDDDDK..',
];
const LEGS_STAND = ['...KSW.SWK..', '...KSW.SWK..', '...KSW.SWK..', '...KSD.SDK..', '..KKKK.KKKK.', '..KKKK.KKKK.'];
const LEGS_STRIDE = ['...KSWSWK...', '..KSW..SWK..', '..KSW..SWK..', '.KSD....SDK.', '.KKK....KKKK', '.KKK....KKK.'];
const LEGS_KNEEL = ['...KSWWWWK..', '...KSWKSWK..', '..KSWK.SWK..', '..KSDK.SDK..', '.KKKK..KKKK.'];

// Selkath overseer: broad head with side-set eyes, mouth barbels, robe with a trimmed collar.
const SELKATH = {
  K: '#0d1a1e',
  A: '#86bcae',
  B: '#57938a',
  C: '#2f5d58',
  E: '#081215',
  e: '#d9fbff',
  R: '#5a5378',
  r: '#3a3552',
  G: '#b8954a',
};
const SELKATH_TOP = [
  '....KKKKK.....',
  '...KBAAAAK....',
  '..KBAAAAAAK...',
  '..KBAAAEEAK...',
  '..KBAAAEeAAK..',
  '..KCBAAAAAAK..',
  '...KCBBAAAAK..',
  '...KCBBBBBAK..',
  '....KCBCBCK...',
  '....KC.C.CK...',
  '...KGGGGGGK...',
  '..KRRRRRRRRK..',
  '..KrRRRRRRRK..',
  '..KrRRRRRRAK..',
  '..KrRRRRRRAK..',
  '..KrRRGRRRRK..',
  '..KrRRGRRRRK..',
  '..KrRRGRRRRK..',
  '..KrrRGRRRRK..',
  '..KrrRRRRRRK..',
  '...KrrRRRRK...',
];
const SELKATH_FEET_A = ['...KCC.CCK....', '...KKK.KKK....'];
const SELKATH_FEET_B = ['....KCCCC.....', '....KKKKK.....'];

const SUB_ROWS = [
  '.........KKKK...............',
  '.......KKSSSSKK.............',
  '..KKKKKSSSSSSSSKKKKKKK......',
  '.KSSSSSSSSSSSSSSSSSSSSKK....',
  'KSSSSSHSSSSSSSSSSSSWWWSSK...',
  'KDSSSSSSSSSSSSSSSSSWWWSSSK..',
  '.KDDDDSSSSSSSSSSSSSSSSSSSSL.',
  '..KKDDDDDDDDDDDDDDDDDDDDKK..',
  '....KK..KK..........KK......',
];

const FIRAXA_A = [
  '.....................F..............',
  '....................FFF.............',
  '...................FFFF.............',
  'F.........FFFFFFFFFFFFFFFFFF........',
  'FF.....FFFFFFFFFFFFFFFFFFFFFFFFF....',
  '.FFF.FFFFFFFFFFFFFFFFFFFFFFFFFFFFFF.',
  '..FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
  '.FFF..FFFFFFFFFFFFFFFFFFFFFFFFFFFF..',
  'FF.......FFFFFFFFF.FFFFFFFFFF.......',
  'F...............FF.......FF.........',
];
const FIRAXA_B = [
  '.....................F..............',
  '....................FFF.............',
  '...................FFFF.............',
  '..........FFFFFFFFFFFFFFFFFF........',
  '.......FFFFFFFFFFFFFFFFFFFFFFFFF....',
  'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF.',
  '.FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
  'FF....FFFFFFFFFFFFFFFFFFFFFFFFFFFF..',
  '.........FFFFFFFFF.FFFFFFFFFF.......',
  '................FF.......FF.........',
];

const CANISTER_ROWS = ['.KK.', 'KMMK', 'KccK', 'KccK', 'KMMK', 'KMMK', '.KK.'];
const CANISTER_PAL = { K: '#0c171c', M: '#7d97a1', c: C.kolto };

export interface Sprites {
  walkA: Sprite;
  walkB: Sprite;
  kneel: Sprite;
  selA: Sprite;
  selB: Sprite;
  sub: Sprite;
  sharkA: Sprite;
  sharkB: Sprite;
  can: Sprite;
  canEmpty: Sprite;
}

let SPRITES: Sprites | null = null;
export function sprites(): Sprites {
  if (SPRITES) return SPRITES;
  const shark = { F: '#021018' };
  SPRITES = {
    walkA: sprite([...SUIT_TOP, ...LEGS_STAND], SUIT),
    walkB: sprite([...SUIT_TOP, ...LEGS_STRIDE], SUIT),
    kneel: sprite([...SUIT_TOP, ...LEGS_KNEEL], SUIT),
    selA: sprite([...SELKATH_TOP, ...SELKATH_FEET_A], SELKATH),
    selB: sprite([...SELKATH_TOP, ...SELKATH_FEET_B], SELKATH),
    sub: sprite(SUB_ROWS, { K: '#0a171d', S: '#3d5560', D: '#22323a', W: C.lamp, H: '#7d97a1', L: '#fff4c0' }),
    sharkA: sprite(FIRAXA_A, shark),
    sharkB: sprite(FIRAXA_B, shark),
    can: sprite(CANISTER_ROWS, CANISTER_PAL),
    canEmpty: sprite(CANISTER_ROWS, { ...CANISTER_PAL, c: '#173a46' }),
  };
  return SPRITES;
}

export function glowSprite(size: number, rgb: string, a: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${rgb},${a})`);
  grad.addColorStop(0.45, `rgba(${rgb},${a * 0.35})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return cv;
}

/** A tileable caustic web: bright along the edges of a wrapped Voronoi pattern (F2 - F1). */
export function causticTile(n: number, cells: number, seed: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(n, n);
  const rnd = mulberry(seed);
  const cs = n / cells;
  const pts: number[] = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push((i + 0.15 + rnd() * 0.7) * cs, (j + 0.15 + rnd() * 0.7) * cs);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let f1 = 1e9;
      let f2 = 1e9;
      for (let p = 0; p < pts.length; p += 2) {
        let dx = Math.abs(x - pts[p]);
        let dy = Math.abs(y - pts[p + 1]);
        if (dx > n / 2) dx = n - dx;
        if (dy > n / 2) dy = n - dy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) f2 = d;
      }
      const edge = f2 - f1;
      // fade the web in and out along its length so it reads as light, not a net
      const k = (Math.PI * 2) / n;
      const vary = 0.5 + 0.5 * Math.sin(x * k * 2 + seed) * Math.sin(y * k * 3 + seed * 2);
      const lum = (edge < 1 ? 1 : edge < 2.2 ? 0.4 : 0) * Math.max(0, vary * 1.4 - 0.2);
      const i = (y * n + x) * 4;
      img.data[i] = 150;
      img.data[i + 1] = 245;
      img.data[i + 2] = 250;
      img.data[i + 3] = Math.round(lum * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

let CAUSTICS: [HTMLCanvasElement, HTMLCanvasElement] | null = null;
/** The two caustic tiles the scene layers, built once per page like SPRITES. */
export function caustics(): [HTMLCanvasElement, HTMLCanvasElement] {
  if (!CAUSTICS) CAUSTICS = [causticTile(96, 4, 11), causticTile(128, 4, 23)];
  return CAUSTICS;
}

/** Small seeded PRNG so the seabed speckle is the same on every resize. */
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
