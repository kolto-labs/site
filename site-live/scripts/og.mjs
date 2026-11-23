// Render the 1200x630 social card and the PNG icons with headless Chromium.
// Uses playwright-core with the browsers in $PLAYWRIGHT_BROWSERS_PATH (never downloads), or a system
// Chromium ($CHROMIUM_PATH, /usr/bin/chromium-browser, /usr/bin/chromium) when that is missing.
// If no Chromium launches, the committed copies in public/ are used instead.
import { readFileSync, writeFileSync, rmSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.env.KOLTO_OUT ? resolve(process.env.KOLTO_OUT) : join(root, 'dist');
const pub = join(root, 'public');
const ssrEntry = ['entry-server.js', 'entry-server.mjs'].map((f) => join(root, '.ssr', f)).find(existsSync);
const { snapshotAggregate, koltoLogo, K_PATH, SITE_URL } = await import(pathToFileURL(ssrEntry).href);

const font = readFileSync(join(root, 'src/assets/fonts/DepartureMono-Regular.woff2')).toString('base64');
const logo = koltoLogo();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const released = snapshotAggregate.listed.filter((p) => p.status === 'released').map((p) => p.name);
const building = snapshotAggregate.lab.filter((p) => p.status === 'in-development').map((p) => p.name);
const host = SITE_URL.replace(/^https?:\/\//, '');

// 1200x630 at 11px-multiple sizes. Frame is 80 cols x 22 rows of 15px x 28.636px? No: we size the font so 80 cols = 1120px.
const ogHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:D;src:url(data:font/woff2;base64,${font}) format('woff2')}
*{margin:0;box-sizing:border-box}
html,body{width:1200px;height:630px;background:#03131c;overflow:hidden}
body{font-family:D;color:#cfe6ec;position:relative}
.bars{position:absolute;inset:0;background:
 linear-gradient(180deg,transparent 0 21%,#1a8394 21%,#4fe3ee 22.6%,#e8feff 23.4%,#4fe3ee 24.2%,#1a8394 25.8%,transparent 25.8%),
 linear-gradient(180deg,transparent 0 33%,#0e4f5e 33%,#1fa3b5 34.6%,#c9fbff 35.4%,#1fa3b5 36.2%,#0e4f5e 37.8%,transparent 37.8%),
 linear-gradient(180deg,transparent 0 45%,#0a3a46 45%,#13798a 46.6%,#8ff3f8 47.4%,#13798a 48.2%,#0a3a46 49.8%,transparent 49.8%),
 linear-gradient(180deg,#0b3244,#072130 45%,#03131c);opacity:.5}
.stars{position:absolute;inset:0;background-image:radial-gradient(1.5px 1.5px at 10% 12%,#c9fbff 50%,transparent 51%),radial-gradient(1px 1px at 22% 70%,#9fd8e0 50%,transparent 51%),radial-gradient(2px 2px at 83% 18%,#fff 50%,transparent 51%),radial-gradient(1px 1px at 64% 83%,#86a8b5 50%,transparent 51%),radial-gradient(1.5px 1.5px at 91% 62%,#c9fbff 50%,transparent 51%),radial-gradient(1px 1px at 38% 8%,#9fd8e0 50%,transparent 51%),radial-gradient(1px 1px at 5% 88%,#9fd8e0 50%,transparent 51%),radial-gradient(1.5px 1.5px at 72% 40%,#eefbfd 50%,transparent 51%)}
.frame{position:absolute;inset:24px 36px;font-size:22px;line-height:1.27273;white-space:pre;color:#1a8394}
.logo{position:absolute;left:0;right:0;top:78px;display:flex;justify-content:center}
.logo svg{width:${logo.w * 14}px;height:${logo.h * 14}px;display:block;filter:drop-shadow(0 0 18px rgba(3,19,28,.8))}
.tag{position:absolute;left:0;right:0;top:376px;text-align:center;font-size:44px;line-height:1;color:#eefbfd;text-shadow:0 3px 0 #010a0f}
.info{position:absolute;left:96px;right:96px;top:440px;font-size:22px;line-height:1.45;white-space:pre;color:#cfe6ec}
.info b{font-weight:400;color:#4fe3ee}.info i{font-style:normal;color:#3d6f84}.info .ok{color:#6ff5b0}
.url{position:absolute;right:84px;top:26px;background:#03131c;padding:0 10px;font-size:22px;color:#4fe3ee}
.k{position:absolute;left:84px;bottom:40px;width:44px;height:44px}
</style></head><body>
<div class="bars"></div><div class="stars"></div>
<div class="frame">${esc(frame())}</div>
<div class="logo"><svg viewBox="0 0 ${logo.w} ${logo.h}" shape-rendering="crispEdges"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".2" stop-color="#e8feff"/><stop offset=".45" stop-color="#8ff3f8"/><stop offset=".7" stop-color="#4fe3ee"/><stop offset="1" stop-color="#23a9bb"/></linearGradient></defs><path d="${logo.shadowPath}" fill="#1a8394"/><path d="${logo.fillPath}" fill="url(#g)"/></svg></div>
<div class="tag">Life support for the Odyssey engine.</div>
<div class="info"><b>RELEASED</b> <i>.....</i> ${esc(released.join(' / '))}
<b>BUILDING</b> <i>.....</i> ${esc(building.join(' / '))}
<b>PROTECTION</b> <i>...</i> <span class="ok">None.</span></div>
<div class="url">${esc(host)}</div>
</body></html>`;

function frame() {
  // 1128px / 14px per col = 80 cols; 582px / 28px per row = 20 rows
  const cols = 80;
  const rows = 20;
  const label = '[ KOLTO LABS ]';
  const top = `╔══${label}${'═'.repeat(cols - 4 - label.length)}═╗`;
  const mid = `║${' '.repeat(cols - 2)}║`;
  const bot = `╚${'═'.repeat(cols - 2)}╝`;
  return [top, ...Array(rows - 2).fill(mid), bot].join('\n');
}

const iconHtml = (size, pad) => `<!doctype html><html><head><style>*{margin:0}html,body{width:${size}px;height:${size}px;background:#072130;overflow:hidden}
svg{display:block;width:${size}px;height:${size}px}</style></head><body>
<svg viewBox="${-3.5 - pad} ${-3 - pad} ${16 + pad * 2} ${16 + pad * 2}" shape-rendering="crispEdges"><rect x="${-3.5 - pad}" y="${-3 - pad}" width="${16 + pad * 2}" height="${16 + pad * 2}" fill="#072130"/><path fill="#4fe3ee" d="${K_PATH}"/></svg></body></html>`;

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  chromium = null;
}

const outputs = [
  { file: 'og-image.png', html: ogHtml, w: 1200, h: 630 },
  { file: 'apple-touch-icon.png', html: iconHtml(180, 1.5), w: 180, h: 180 },
  { file: 'icon-192.png', html: iconHtml(192, 1.5), w: 192, h: 192 },
  { file: 'icon-512.png', html: iconHtml(512, 1.5), w: 512, h: 512 },
  { file: 'favicon-32.png', html: iconHtml(32, 0), w: 32, h: 32 },
];

/** Playwright's own Chromium first, then a system install. Returns the browser and what launched it. */
async function launch() {
  const candidates = [undefined, process.env.CHROMIUM_PATH, '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  let lastErr;
  for (const executablePath of candidates) {
    if (executablePath !== undefined && (!executablePath || !existsSync(executablePath))) continue;
    try {
      const b = await chromium.launch(executablePath ? { executablePath } : {});
      return { b, via: executablePath ?? 'playwright-managed chromium' };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('no Chromium found');
}

let browser = null;
try {
  if (!chromium) throw new Error('playwright-core not installed');
  const launched = await launch();
  browser = launched.b;
  console.log(`[og] rendering with ${launched.via} ${browser.version()}`);
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  mkdirSync(pub, { recursive: true });
  for (const o of outputs) {
    await page.setViewportSize({ width: o.w, height: o.h });
    await page.setContent(o.html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: o.w, height: o.h } });
    writeFileSync(join(dist, o.file), png);
    writeFileSync(join(pub, o.file), png); // committed fallback for builds without Chromium
  }
  console.log(`[og] rendered ${outputs.map((o) => o.file).join(', ')}`);
} catch (err) {
  console.warn(`[og] Chromium unavailable (${err.message.split('\n')[0]}); using committed PNGs from public/.`);
  for (const o of outputs) if (existsSync(join(pub, o.file)) && !existsSync(join(dist, o.file))) copyFileSync(join(pub, o.file), join(dist, o.file));
} finally {
  await browser?.close();
  rmSync(join(root, '.ssr'), { recursive: true, force: true });
}
