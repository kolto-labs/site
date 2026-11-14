/**
 * Tiny pixel-font -> CP437 half-block renderer.
 *
 * Departure Mono cells are 7x14 "pixel units", so a half-block (▀ ▄ █) gives
 * perfectly square pixels. We draw letters as bitmaps and pack two pixel rows
 * into each text row. Output is plain text: crisp at any DPR, selectable,
 * and identical on the server and the client.
 */

type Glyph = string[];

/* 10px-tall display face. Stems are 3px, bowls are chamfered.
   A 1px "slice" at row 6 is carved out below to give the classic cut-logo look. */
const BIG: Record<string, Glyph> = {
  K: [
    '###...###',
    '###..###.',
    '###.###..',
    '######...',
    '#####....',
    '######...',
    '###.###..',
    '###..###.',
    '###...###',
    '###...###',
  ],
  O: [
    '.#######.',
    '###...###',
    '###...###',
    '###...###',
    '###...###',
    '###...###',
    '###...###',
    '###...###',
    '###...###',
    '.#######.',
  ],
  L: [
    '###......',
    '###......',
    '###......',
    '###......',
    '###......',
    '###......',
    '###......',
    '###......',
    '#########',
    '#########',
  ],
  T: [
    '#########',
    '#########',
    '...###...',
    '...###...',
    '...###...',
    '...###...',
    '...###...',
    '...###...',
    '...###...',
    '...###...',
  ],
};

/* 6px-tall companion face for the "LABS" tag. */
const SMALL: Record<string, Glyph> = {
  L: ['##...', '##...', '##...', '##...', '#####', '#####'],
  A: ['.###.', '##.##', '##.##', '#####', '##.##', '##.##'],
  B: ['####.', '##.##', '####.', '##.##', '##.##', '####.'],
  S: ['.####', '##...', '.###.', '...##', '...##', '####.'],
  ' ': ['..', '..', '..', '..', '..', '..'],
};

function bitmap(text: string, font: Record<string, Glyph>, gap: number, slices: number[] = []): boolean[][] {
  const glyphs = [...text].map((ch) => font[ch] ?? font[' '] ?? []);
  const height = glyphs[0]?.length ?? 0;
  const rows: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    const row: boolean[] = [];
    glyphs.forEach((g, i) => {
      for (const c of g[y]) row.push(c === '#' && !slices.includes(y));
      if (i < glyphs.length - 1) for (let k = 0; k < gap; k++) row.push(false);
    });
    rows.push(row);
  }
  return rows;
}

function toHalfBlocks(bits: boolean[][]): string[] {
  const out: string[] = [];
  for (let y = 0; y < bits.length; y += 2) {
    const top = bits[y];
    const bot = bits[y + 1] ?? [];
    let line = '';
    for (let x = 0; x < top.length; x++) {
      const t = top[x];
      const b = bot[x] ?? false;
      line += t && b ? '█' : t ? '▀' : b ? '▄' : ' ';
    }
    out.push(line);
  }
  return out;
}

/** Offset the bitmap by (dx, dy) pixels and keep only pixels not covered by the original: a hard drop shadow. */
function shadowOf(bits: boolean[][], dx: number, dy: number): boolean[][] {
  const h = bits.length + dy;
  const w = (bits[0]?.length ?? 0) + dx;
  const out: boolean[][] = [];
  for (let y = 0; y < h; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < w; x++) {
      const src = bits[y - dy]?.[x - dx] ?? false;
      const own = bits[y]?.[x] ?? false;
      row.push(src && !own);
    }
    out.push(row);
  }
  return out;
}

function pad(bits: boolean[][], w: number, h: number): boolean[][] {
  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => bits[y]?.[x] ?? false));
}

function placeRight(base: boolean[][], tag: boolean[][], topPad: number): boolean[][] {
  const w = base[0].length;
  const tagW = tag[0].length;
  const rows = base.map((r) => [...r]);
  for (let y = 0; y < topPad; y++) rows.push(Array(w).fill(false));
  for (const r of tag) rows.push([...Array(w - tagW).fill(false), ...r]);
  return rows;
}

export interface LogoArt {
  /** Lines of the main logo (CP437 half-blocks). */
  fill: string[];
  /** Same-size lines holding only the drop shadow. */
  shadow: string[];
  cols: number;
  /** Pixel-grid vector versions: one merged path each, so there are no seams between cells. */
  fillPath: string;
  shadowPath: string;
  /** Size of the pixel grid (one text row = two pixel rows). */
  w: number;
  h: number;
}

/** Merge horizontal runs of set pixels into a single SVG path. */
function toPath(bits: boolean[][]): string {
  let d = '';
  bits.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let e = x;
      while (e < row.length && row[e]) e++;
      d += `M${x} ${y}h${e - x}v1h${x - e}z`;
      x = e;
    }
  });
  return d;
}

/** Data URI of a path as a black-on-transparent SVG, for use as a CSS mask. */
export function maskUri(path: string, w: number, h: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' preserveAspectRatio='none'><path d='${path}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

let cached: LogoArt | null = null;

/** "KOLTO" in the big face, with "LABS" right-aligned underneath. */
export function koltoLogo(): LogoArt {
  if (cached) return cached;
  const big = bitmap('KOLTO', BIG, 2, [6]);
  const small = bitmap('LABS', SMALL, 1);
  let full = placeRight(big, small, 2);
  // ensure even row count for half-block packing
  if (full.length % 2) full.push(Array(full[0].length).fill(false));
  const w = full[0].length + 1;
  const h = full.length + 2;
  const fillBits = pad(full, w, h);
  const shadowBits = pad(shadowOf(full, 1, 1), w, h);
  cached = {
    fill: toHalfBlocks(fillBits),
    shadow: toHalfBlocks(shadowBits),
    cols: w,
    fillPath: toPath(fillBits),
    shadowPath: toPath(shadowBits),
    w,
    h,
  };
  return cached;
}

/** Pixel rects for the favicon "K" (x, y in pixels of the BIG face). */
export function glyphPixels(ch: keyof typeof BIG): [number, number][] {
  const out: [number, number][] = [];
  BIG[ch].forEach((row, y) => [...row].forEach((c, x) => c === '#' && out.push([x, y])));
  return out;
}
