/** Wordless K1 economy overlay. Scene timing and canvas composition stay in effect.ts. */
import { C } from './sprites';

export const ECONOMY_FRACTIONS = [0.09, 0.23, 0.38, 0.53, 0.7, 0.82, 0.93];
// Each highlighted stage is an edge, so the marker and route share one geometry.
export const ECONOMY_STEPS = [
  { from: 0, to: 1 }, { from: 1, to: 2 }, { from: 2, to: 3 },
  { from: 3, to: 4 }, { from: 3, to: 5 }, { from: 4, to: 6 }, { from: 5, to: 6 },
] as const;
export type EconomyStep = (typeof ECONOMY_STEPS)[number];

export interface EconomyMapContext {
  ac: CanvasRenderingContext2D;
  bounds: { aw: number; ah: number; floorY: number; narrow: boolean };
  chainXs: number[];
  chainVeil: CanvasGradient;
  scenario: { incidentIndex: number; sunryVerdict: boolean };
  motion: {
    time: number;
    activeStep: EconomyStep;
    activeRouteAllowed: boolean;
    chainFlow: number;
    markerProgress: number;
    boost: number;
  };
  sprites: { glow: HTMLCanvasElement; selkath: HTMLCanvasElement };
}

function px(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) {
  g.fillStyle = col;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function glow(g: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, size: number, alpha: number) {
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.max(0, Math.min(1, alpha));
  g.drawImage(img, Math.round(x - size / 2), Math.round(y - size / 2), size, size);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

export function drawEconomyMap(context: EconomyMapContext): void {
  const { ac, chainXs: xs, chainVeil } = context;
  const { aw: AW, ah: AH, floorY, narrow } = context.bounds;
  const { incidentIndex, sunryVerdict } = context.scenario;
  const { time: t, activeStep, activeRouteAllowed, chainFlow, markerProgress, boost } = context.motion;
  const { glow: glowSprite, selkath: selkathSprite } = context.sprites;
  function drawEconomyNodes(
    xs: number[],
    nodeY: (index: number) => number,
    step: (typeof ECONOMY_STEPS)[number],
    flowAllowed: boolean,
    state: number,
    time: number,
  ) {
    for (let i = 0; i < xs.length; i++) {
      if (state === 4 && i === 1) continue;
      const x = xs[i];
      const y = nodeY(i);
      const active = flowAllowed && (i === step.from || i === step.to);
      const halo = active ? 'rgba(79,227,238,0.82)' : 'rgba(93,143,163,0.55)';
      px(ac, x - 6, y - 7, 12, 1, halo);
      px(ac, x - 6, y + 7, 12, 1, 'rgba(42,85,102,0.75)');
      px(ac, x - 6, y - 6, 1, 12, 'rgba(42,85,102,0.75)');
      px(ac, x + 5, y - 6, 1, 12, 'rgba(42,85,102,0.75)');

      if (i === 0) {
        // Rift fissure and rising drops. Poison is the sole black kolto state.
        px(ac, x - 5, y + 2, 10, 1, state === 2 ? '#202528' : '#24566a');
        px(ac, x - 2, y + 1, 1, 2, '#0a2430');
        px(ac, x, y, 1, 3, '#0a2430');
        px(ac, x + 2, y + 1, 1, 2, '#0a2430');
        const liquid = state === 2 ? '#17191b' : C.kolto;
        px(ac, x - 3, y - 3, 1, 1, liquid);
        px(ac, x + 2, y - 4, 1, 1, liquid);
        px(ac, x, y - 2 - (Math.floor(time * 2) % 2), 1, 1, liquid);
        if (state === 2) px(ac, x - 4, y + 3, 8, 1, '#090d10');
      } else if (i === 1) {
        // Poison has no harvest activity; station incident is local to Hrakert.
        if (state !== 2 && state !== 3 && state !== 4) {
          // Fewer silhouettes express reduced harvest after a machine loss.
          const harvesters = state === 1 ? [-2, 3] : [-4, 0, 4];
          for (const dx of harvesters) {
            px(ac, x + dx, y - 3, 2, 2, '#86bcae');
            px(ac, x + dx - 1, y - 1, 4, 4, '#3e786f');
            px(ac, x + dx, y + 3, 1, 1, '#23514e');
          }
          px(ac, x - 6, y - 4, 12, 9, 'rgba(4,18,26,0.22)');
        }
      } else if (i === 2) {
        // Two equally treated permits and the governing seal.
        for (const dx of [-4, 2]) {
          px(ac, x + dx, y - 4, 3, 7, '#93b5b7');
          px(ac, x + dx + 1, y - 2, 1, 1, '#123b45');
          px(ac, x + dx + 1, y, 1, 1, '#7dff9a');
        }
        px(ac, x - 1, y - 1, 2, 2, '#d5b869');
      } else if (i === 3) {
        // Raw kolto crates are shown in the city packing step only.
        for (const [dx, dy] of [[-4, 1], [1, 1], [-2, -4]] as const) {
          px(ac, x + dx, y + dy, 4, 5, '#477987');
          px(ac, x + dx, y + dy, 4, 1, '#a9dce0');
          px(ac, x + dx + 1, y + dy + 3, 2, 1, '#1e5360');
        }
      } else if (i === 4 || i === 5) {
        // Separate freighter/loading-bay glyphs; no ship class or route claimed.
        const color = i === 4 ? '#b9d1d4' : '#c29acb';
        px(ac, x - 5, y + 1, 10, 2, color);
        px(ac, x - 2, y - 2, 6, 3, color);
        px(ac, x, y - 4, 2, 2, color);
        px(ac, x - 5, y + 4, 1, 1, '#ffd27a');
        px(ac, x + 4, y + 4, 1, 1, '#ffd27a');
        px(ac, x - 6, y - 5, 12, 1, i === 4 ? '#8bb1bd' : '#9b729e');
        px(ac, x - 6, y - 5, 1, 10, '#476a76');
        px(ac, x + 5, y - 5, 1, 10, '#476a76');
      } else {
        // Front-line treatment + generic users, kept off-scene geographically.
        px(ac, x - 5, y - 2, 4, 7, '#b1c8cc');
        px(ac, x - 4, y - 4, 2, 2, '#d7e5e6');
        px(ac, x - 4, y, 2, 2, state === 2 ? '#17191b' : C.kolto);
        px(ac, x + 2, y - 3, 3, 3, '#b1c8cc');
        px(ac, x + 3, y, 1, 3, '#8ca7ac');
        px(ac, x + 1, y + 4, 6, 1, '#6c939b');
      }
    }
  }

  function drawFacility(x: number, y: number, state: number) {
    const fy = y - 20;
    const left = x - 11;
    // Secret facility icon is linked only to the source. The machine shapes are
    // abstract because the game does not establish their exterior design.
    for (let py = fy + 11; py < y - 7; py += 2) px(ac, x, py, 1, 1, 'rgba(255,210,122,0.7)');
    px(ac, left, fy, 23, 10, 'rgba(7,22,30,0.88)');
    px(ac, left, fy, 23, 1, 'rgba(255,210,122,0.86)');
    px(ac, left, fy + 9, 23, 1, 'rgba(255,210,122,0.52)');
    for (const dx of [2, 8]) {
      const broken = state === 1 && dx === 2 || state === 3;
      px(ac, left + dx, fy + 3, 4, 4, broken ? '#523b34' : '#78959d');
      px(ac, left + dx + 1, fy + 2, 2, 1, '#ffd27a');
      if (broken) {
        px(ac, left + dx, fy + 3, 4, 1, '#ff9b75');
        px(ac, left + dx + 2, fy + 4, 1, 3, '#13252b');
      }
    }
    px(ac, left + 15, fy + 3, 5, 5, '#1b5960');
    px(ac, left + 16, fy + 4, 1, 1, '#7dff9a');
    px(ac, left + 18, fy + 4, 1, 1, '#7dff9a');
    px(ac, left + 16, fy + 6, 3, 1, '#93c0c2');
    // A shutter and broken line imply secrecy and treaty conflict without words.
    px(ac, left + 3, fy + 1, 7, 1, '#253d43');
    px(ac, left + 11, fy + 1, 2, 1, '#ff9b75');
  }

  function drawControlGlyph(x: number, y: number) {
    const cy = y + 12;
    // Constant watch + one intercepted unpermitted crate + locked export seal.
    px(ac, x - 10, cy, 5, 1, '#d6e5e6');
    px(ac, x - 9, cy - 1, 3, 1, '#d6e5e6');
    px(ac, x - 8, cy - 2, 1, 1, '#7dff9a');
    px(ac, x - 1, cy - 2, 4, 4, '#567580');
    px(ac, x, cy - 3, 2, 1, '#c8dadd');
    px(ac, x + 4, cy - 1, 3, 1, '#ff9b75');
    px(ac, x + 5, cy - 2, 1, 4, '#ff9b75');
    px(ac, x + 8, cy - 3, 3, 4, '#b49459');
    px(ac, x + 8, cy - 4, 3, 1, '#d5bf7c');
  }

  function drawBeliefGlyph(x: number, y: number) {
    // A shadowed giant and two broken possible links: source or guardian.
    // The ambiguity is visual; neither relation is presented as fact.
    if (AW < 36 || floorY < 34) return;
    const cx = Math.max(19, Math.min(AW - 17, x + 4));
    const gy = Math.max(13, Math.min(floorY - 15, y + 15));
    const kolto = incidentIndex === 2 ? '#283033' : 'rgba(79,227,238,0.42)';
    ac.drawImage(selkathSprite, cx - 17, gy - 3, 6, 11);
    px(ac, cx, gy, 7, 2, '#203e4b');
    px(ac, cx + 3, gy - 2, 6, 2, '#284b58');
    px(ac, cx + 7, gy - 1, 4, 1, '#203e4b');
    px(ac, cx + 6, gy - 2, 1, 1, '#8ec4cb');
    for (let d = 0; d < 4; d++) px(ac, cx - d * 2, gy + 3 + d, 1, 1, kolto);
    for (let d = 0; d < 4; d++) px(ac, cx + 10 + d * 2, gy + 3 + d, 1, 1, 'rgba(133,164,164,0.42)');
    // Alternative endpoints: a liquid drop and a protective arc, both faint.
    px(ac, cx - 8, gy + 7, 1, 3, incidentIndex === 2 ? '#17191b' : 'rgba(79,227,238,0.6)');
    px(ac, cx - 9, gy + 8, 3, 1, incidentIndex === 2 ? '#17191b' : 'rgba(79,227,238,0.6)');
    px(ac, cx + 13, gy + 7, 1, 3, 'rgba(133,164,164,0.6)');
    px(ac, cx + 11, gy + 9, 5, 1, 'rgba(133,164,164,0.6)');
  }

  function drawSunryGlyph(selkathX: number, selkathY: number, sithX: number, sithY: number) {
    // Only the unanimous verdict branch: Sith contribution ends at Selkath seller.
    const x = Math.round((selkathX + sithX) / 2);
    // Place the verdict mark above the retail row so the token never collides
    // with portable packs on compact canvases.
    const y = Math.max(10, Math.min(selkathY, sithY) - 18);
    for (let i = 0; i < 5; i++) {
      px(ac, x - 8 + i * 4, y - 4, 2, 2, '#86bcae');
      px(ac, x - 8 + i * 4, y - 2, 2, 3, '#4f7978');
    }
    px(ac, x - 11, y + 2, 22, 1, 'rgba(133,164,164,0.65)');
    px(ac, x + 4, y + 5, 3, 3, '#a77aaf');
    px(ac, x - 7, y + 5, 3, 3, '#8aaab3');
    // Dotted arrow points from Sith-side contribution left toward Selkath seller.
    for (let dx = -3; dx <= 4; dx += 2) px(ac, x + dx, y + 11, 1, 1, 'rgba(213,184,105,0.8)');
    px(ac, x - 4, y + 10, 1, 1, '#d5b869');
    px(ac, x - 4, y + 12, 1, 1, '#d5b869');
    px(ac, x - 3, y + 14, 1, 1, 'rgba(133,164,164,0.62)');
    px(ac, x, y + 14, 1, 1, 'rgba(133,164,164,0.62)');
    px(ac, x + 3, y + 14, 1, 1, 'rgba(133,164,164,0.62)');
    px(ac, x - 1, y + 5, 3, 3, '#ffd27a');
    // One closed orbit (one solar year), with a single partially filled token.
    px(ac, x - 1, y + 4, 3, 1, '#ffeab0');
    px(ac, x, y + 3, 1, 3, '#ffeab0');
    px(ac, x - 2, y + 3, 5, 1, 'rgba(255,210,122,0.68)');
    px(ac, x - 2, y + 8, 5, 1, 'rgba(255,210,122,0.68)');
    px(ac, x - 3, y + 4, 1, 4, 'rgba(255,210,122,0.68)');
    px(ac, x + 3, y + 4, 1, 4, 'rgba(255,210,122,0.68)');
  }

  function drawRetailGlyph(x: number, y: number, state: number) {
    // Personal-use store item and portable kolto packs are separate from bulk
    // freight. The tank item only appears in the poisoned branch.
    px(ac, x - 9, y, 8, 8, '#204d59');
    px(ac, x - 8, y - 2, 6, 2, '#71949b');
    const productColor = state === 2 ? '#181a1b' : C.kolto;
    px(ac, x - 6, y + 2, 2, 4, productColor);
    if (state === 2) {
      // A separate priced tank item is present only after the poisoning branch.
      px(ac, x - 15, y + 1, 3, 6, '#5b747a');
      px(ac, x - 14, y + 2, 1, 4, '#182328');
      px(ac, x - 16, y, 5, 1, '#9db8bc');
    }
    for (const dx of [3, 8]) {
      px(ac, x + dx, y + 1, 4, 6, '#91aeb1');
      px(ac, x + dx + 1, y + 2, 2, 1, productColor);
      px(ac, x + dx + 1, y + 4, 2, 1, productColor);
    }
    if (state === 2) {
      // Three crosses express tripled medical-item costs; no price is invented.
      for (let i = 0; i < 3; i++) {
        const cx = x + 15 + i * 4;
        px(ac, cx, y + 2, 1, 4, '#ff9b75');
        px(ac, cx - 1, y + 3, 3, 1, '#ff9b75');
      }
    }
  }

  function drawIncidentGlyphs(xs: number[], y: number, state: number) {
    if (state === 0 || state === 4) return;
    if (state === 1) {
      // Harvester loss: reduced open harvest; the city packing closure is temporary.
      const x = xs[0] + 10;
      px(ac, x - 2, y, 3, 2, '#8f6b53');
      px(ac, x + 2, y + 3, 3, 2, '#74564a');
      px(ac, x + 1, y - 2, 1, 7, '#ffd27a');
      px(ac, x - 2, y + 1, 7, 1, '#ff9b75');
      const dc = xs[3];
      const closed = Math.sin(t * 0.28) > -0.2;
      if (closed) px(ac, dc - 9, y + 5, 18, 1, '#ff9b75');
      for (const x of [xs[4], xs[5]]) {
        px(ac, x - 5, y + 4, 10, 1, closed ? '#607d86' : '#8bb1bd');
        px(ac, x - 2, y + 1, 1, 3, '#b9d1d4');
        px(ac, x + 2, y + 1, 1, 3, '#c29acb');
        if (closed) {
          px(ac, x - 4, y, 2, 2, '#d6e5e6');
          px(ac, x + 3, y, 2, 2, '#d6e5e6');
        }
      }
      return;
    }
    if (state === 3) {
      // Hrakert station incident is distinct from either Rift choice.
      const sx = xs[0] + 18;
      px(ac, sx - 5, y - 5, 11, 7, '#283c43');
      px(ac, sx - 4, y - 4, 9, 1, '#ff9b75');
      px(ac, sx - 3, y - 1, 7, 1, '#152a31');
      px(ac, sx + 7, y + 2, 3, 2, '#405b64'); // lost sub
      for (const dx of [-4, 0, 4]) px(ac, sx + dx, y + 5, 2, 2, '#8b5550'); // crew losses
      px(ac, sx + 10, y - 3, 2, 3, '#86bcae'); // survivor
      return;
    }
    // Poison branch: the harvester stays intact, but export leaves are locked,
    // the source is black, medical costs rise, and four market points dim.
    const gateY = y + 2;
    for (const x of [xs[4], xs[5]]) {
      px(ac, x - 5, gateY, 10, 1, '#ff9b75');
      px(ac, x - 3, gateY + 1, 1, 4, '#8a5350');
      px(ac, x + 2, gateY + 1, 1, 4, '#8a5350');
    }
    // Republic enclave's existing stockpile loads locally while normal supply is stopped.
    const stockX = xs[4];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3 - row; col++) {
        px(ac, stockX + col * 4 - 4, y - 4 - row * 3, 3, 2, '#607d86');
      }
    }
    // Independent local stock-to-hold motion; it does not connect to fresh supply.
    const loadPhase = (t * 0.25) % 1;
    const loadX = stockX + 4 + Math.round(loadPhase * 9);
    px(ac, stockX + 2, y + 7, 12, 1, '#536870');
    px(ac, loadX, y + 4, 3, 2, '#6c8790');
    px(ac, stockX + 13, y + 2, 3, 2, '#b9d1d4');
    const marketX = xs[6] - 10;
    for (let i = 0; i < 4; i++) {
      const x = marketX + (i % 2) * 4;
      const py = y + Math.floor(i / 2) * 4;
      px(ac, x, py, 2, 2, '#39474b');
      px(ac, x, py, 1, 1, '#77868a');
    }
    // Increased port charge is shown as a rising fee meter, without numerals.
    px(ac, xs[2] + 9, y + 2, 1, 6, '#6d5151');
    px(ac, xs[2] + 11, y, 1, 8, '#ff9b75');
    px(ac, xs[2] + 13, y - 2, 1, 10, '#ff9b75');
  }


    // Opaque field hides obsolete literal plant, pipe, lift and cargo art.
    ac.fillStyle = chainVeil;
    ac.fillRect(0, Math.floor(AH * 0.43), AW, AH - Math.floor(AH * 0.43));
    // Keep narrow/short embeds unclipped by omitting the schematic layer.
    if (AH < 76 || AW < 120) return;
    const y = Math.min(floorY - 18, Math.max(24, floorY - (narrow ? 42 : 46)));
    const offsets = [0, 0, -2, 0, -5, 5, 0];
    const nodeY = (i: number) => y + offsets[i];
    const destructionClosed = incidentIndex === 1 && Math.sin(t * 0.28) > -0.2;
    const dashOffset = incidentIndex === 2 ? 0 : Math.round(chainFlow * 4);
    for (let stepIndex = 0; stepIndex < ECONOMY_STEPS.length; stepIndex++) {
      const step = ECONOMY_STEPS[stepIndex];
      const routeAllowed = incidentIndex === 4
        ? stepIndex >= 2
        : incidentIndex === 2 ? false : !(incidentIndex === 1 && destructionClosed && stepIndex > 1);
      // Poison preserves the prior faint, static route trace; it carries no flow.
      if (!routeAllowed && incidentIndex !== 2) continue;
      const x0 = xs[step.from], y0 = nodeY(step.from);
      const x1 = xs[step.to], y1 = nodeY(step.to);
      const length = Math.hypot(x1 - x0, y1 - y0);
      const on = step.from === activeStep.from && step.to === activeStep.to;
      const color = incidentIndex === 2 ? 'rgba(83,91,94,0.18)'
        : on ? 'rgba(79,227,238,0.78)' : 'rgba(100,205,216,0.34)';
      for (let d = 0; d < length; d += 4) {
        if (incidentIndex === 2 && d % 8 !== 0) continue;
        const q = ((d + dashOffset) % Math.max(1, length)) / length;
        px(ac, Math.round(x0 + (x1 - x0) * q), Math.round(y0 + (y1 - y0) * q), 1, 1, color);
      }
    }
    if (activeRouteAllowed) {
      const x0 = xs[activeStep.from], y0 = nodeY(activeStep.from);
      const x1 = xs[activeStep.to], y1 = nodeY(activeStep.to);
      const pxX = Math.round(x0 + (x1 - x0) * markerProgress);
      const pxY = Math.round(y0 + (y1 - y0) * markerProgress);
      px(ac, pxX, pxY - 1, 2, 2, C.kolto);
      glow(ac, glowSprite, pxX, pxY, 13, 0.2 + boost * 0.24);
    }
    drawEconomyNodes(xs, nodeY, activeStep, activeRouteAllowed, incidentIndex, t);
    if (incidentIndex !== 4) drawFacility(xs[0], nodeY(0), incidentIndex);
    drawControlGlyph(xs[2], nodeY(2));
    if (sunryVerdict) {
      drawSunryGlyph(xs[2], nodeY(2), xs[5], nodeY(5));
      px(ac, xs[2] - 2, nodeY(2) + 5, 5, 4, '#d5b869');
      px(ac, xs[2] - 1, nodeY(2) + 4, 3, 1, '#ffeab0');
    }
    drawRetailGlyph(xs[3], y + 20, incidentIndex);
    drawIncidentGlyphs(xs, y + 30, incidentIndex);
    if (incidentIndex !== 4) drawBeliefGlyph(xs[0], nodeY(0));
  }
