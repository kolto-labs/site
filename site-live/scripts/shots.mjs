// Screenshot key routes at desktop and mobile sizes, collect console errors,
// and check for page-level horizontal overflow. Expects `vite preview` on :4173.
// Usage: node scripts/shots.mjs [outDir] [--full] [--reduced]
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) ?? '../shots';
const full = args.includes('--full');
const reduced = args.includes('--reduced');
const base = process.env.BASE ?? 'http://localhost:4173';
const routes = (process.env.ROUTES ?? '/,/projects/,/roadmap/,/about/').split(',');
const sizes = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844, mobile: true },
];
if (process.env.EXTRA_360) sizes.push({ name: 'm360', width: 360, height: 740, mobile: true });

mkdirSync(out, { recursive: true });

/** Playwright's own Chromium first, then a system install (same order as scripts/og.mjs). */
async function launch() {
  const candidates = [undefined, process.env.CHROMIUM_PATH, '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  let lastErr;
  for (const executablePath of candidates) {
    if (executablePath !== undefined && (!executablePath || !existsSync(executablePath))) continue;
    try {
      return await chromium.launch(executablePath ? { executablePath } : {});
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('no Chromium found');
}

const browser = await launch();
let problems = 0;
for (const s of sizes) {
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: s.mobile ? 2 : 1,
    isMobile: !!s.mobile,
    hasTouch: !!s.mobile,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  for (const r of routes) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(base + r, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    // scroll through so reveals fire, then back to top
    if (full) {
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 500) {
          window.scrollTo({ top: y, behavior: 'instant' });
          await new Promise((res) => setTimeout(res, 120));
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
      await page.waitForTimeout(900);
    }
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      vw: window.innerWidth,
      offenders: [...document.querySelectorAll('body *')]
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return b.right > window.innerWidth + 1 && getComputedStyle(el).position !== 'fixed';
        })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`),
    }));
    const slug = r.replace(/\//g, '') || 'home';
    const file = `${out}/${slug}-${s.name}${reduced ? '-reduced' : ''}.png`;
    await page.screenshot({ path: file, fullPage: full });
    const ovf = overflow.doc > overflow.vw;
    if (ovf || errors.length) problems++;
    console.log(`${file}  overflow=${ovf ? `YES (${overflow.doc}>${overflow.vw}) ${overflow.offenders.join(' ')}` : 'no'}  console=${errors.length ? errors.join(' | ') : 'clean'}`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();
process.exit(problems ? 1 : 0);
