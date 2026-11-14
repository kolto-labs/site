// Prerender every route to static HTML, then write sitemap/robots/llms.txt,
// _headers (with the CSP hash of our one inline script), _redirects and the favicon.
// Runs after `vite build` (client -> dist/) and `vite build --ssr` (-> .ssr/).
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const ssrEntry = ['entry-server.js', 'entry-server.mjs'].map((f) => join(root, '.ssr', f)).find(existsSync);
if (!ssrEntry) throw new Error('SSR bundle missing: run `vite build --ssr src/entry-server.tsx --outDir .ssr` first');

const ssr = await import(pathToFileURL(ssrEntry).href);
const { render, pageKeyFor, headFor, headHtml, hrefFor, ROUTES, content, SITE_URL, snapshotAggregate, K_PATH, plain, PAGES } = ssr;

const template = readFileSync(join(dist, 'index.html'), 'utf8');
if (!template.includes('<!--app-->') || !template.includes('<!--head-->')) throw new Error('index.html is missing <!--app--> or <!--head--> markers');

// ---- font preloads (hashed names) ----
const assets = readdirSync(join(dist, 'assets'));
const preloadFonts = [
  assets.find((f) => /^DepartureMono-Regular.*\.woff2$/.test(f)),
  assets.find((f) => /^ibm-plex-sans-latin-400-normal.*\.woff2$/.test(f)),
].filter(Boolean);
const preloads = preloadFonts.map((f) => `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin>`).join('\n    ');

function page(route, url) {
  const app = render(url);
  const head = headHtml(headFor(route));
  const key = route === '/404' ? 'NotFound' : pageKeyFor(url);
  return template
    .replace('<!--head-->', `${head}\n    ${preloads}`)
    .replace('<div id="root"><!--app--></div>', `<div id="root" data-page="${key}">${app}</div>`);
}

function write(rel, data) {
  const file = join(dist, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  return file;
}

const written = [];
for (const route of ROUTES) {
  const url = hrefFor(route);
  const out = route === '/' ? 'index.html' : join(route.slice(1), 'index.html');
  written.push(write(out, page(route, url)));
}
written.push(write('404.html', page('/404', '/__kolto_not_found__/')));

// ---- sitemap / robots / llms.txt ----
const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ROUTES.map((r) => `  <url><loc>${SITE_URL}${hrefFor(r)}</loc><lastmod>${today}</lastmod><changefreq>${r === '/' || r === '/roadmap' ? 'weekly' : 'monthly'}</changefreq><priority>${r === '/' ? '1.0' : r === '/projects' ? '0.9' : '0.7'}</priority></url>`).join('\n')}
</urlset>
`;
write('sitemap.xml', sitemap);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

const statusWord = { released: 'released', 'in-development': 'in development', planned: 'planned', public: 'public repository' };
const projectLine = (p) =>
  `- ${p.repo ? `[${p.name}](${p.repo})` : p.name} (${statusWord[p.status]}; ${p.lang}; ${p.license}${p.version ? `; v${p.version}` : ''}):${p.tagline ? ` ${p.tagline.replace(/[^.!?:]$/, '$&.')}` : ''}${p.description && p.description !== p.tagline ? ` ${plain(p.description)}` : ''}`;
const llms = `# Kolto Labs

> ${content.press.boilerplateShort} Life support for the Odyssey engine.

${plain(content.press.boilerplateLong)}

## Pages

${ROUTES.map((r) => `- [${(content.meta[r]?.title ?? r).split(/\s[—|·|-]\s/)[0]}](${SITE_URL}${hrefFor(r)}): ${content.meta[r]?.description ?? ''}`).join('\n')}

## Projects

${snapshotAggregate.listed.map(projectLine).join('\n')}
${snapshotAggregate.lab.length ? `\n## Watch the lab: not public yet\n\n${snapshotAggregate.lab.map(projectLine).join('\n')}\n` : ''}
## Notes

- ${plain(content.disclaimer)}
- Source: https://github.com/kolto-labs
`;
write('llms.txt', llms);

// ---- favicon from the same pixel grid as the hero logo ----
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3.5 -3 16 16" shape-rendering="crispEdges"><title>Kolto Labs</title><rect x="-3.5" y="-3" width="16" height="16" fill="#072130"/><path fill="#4fe3ee" d="${K_PATH}"/></svg>\n`;
write('favicon.svg', mark);

// ---- _redirects: the old /press kit is gone; send its URLs to the home page.
// /greets was renamed /credits; the browser keeps any #hash across the 301. ----
// /404 would otherwise serve 404.html with a 200; send it home instead.
write('_redirects', '/press / 301\n/press/ / 301\n/press/* / 301\n/greets /credits/ 301\n/greets/ /credits/ 301\n/404 / 302\n/404/ / 302\n/404.html / 302\n');
// PAGES.join is off: /join is a temporary (302) redirect to home. The browser keeps #fragments across it.
if (!PAGES.join) appendFileSync(join(dist, '_redirects'), '/join / 302\n/join/ / 302\n/join/* / 302\n');

// ---- _headers: security + caching; CSP hashes the inline boot script ----
const inline = [...template.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
const csp = [
  "default-src 'self'",
  `script-src 'self' ${inline.join(' ')}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://api.github.com https://raw.githubusercontent.com",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');
const headers = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.png
  Cache-Control: public, max-age=86400

/*.svg
  Cache-Control: public, max-age=86400

/manifest.webmanifest
  Content-Type: application/manifest+json
  Cache-Control: public, max-age=86400

/llms.txt
  Content-Type: text/plain; charset=utf-8
`;
write('_headers', headers);

console.log(`[prerender] ${written.length} pages, sitemap, robots, llms.txt, _headers, _redirects, favicon -> dist/`);
