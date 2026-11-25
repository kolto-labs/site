// Copies the Kolto Tank player (kolto-labs/kotor-wasm's web/ directory) into dist/, so the Play
// page can link to it on this same Worker. Runs last in `build`; does nothing unless
// KOTOR_WASM_WEB names that directory.
//
//   KOTOR_WASM_WEB=../../kotor-wasm/web VITE_PLAY_RUNTIME_URL=/tank/ npm run build
//
// What lands in dist/: the engine picker (/tank/), the engine pages (/original-game/, /sourceport/),
// their scripts (/js/), engines.json, and a staged source port build if one is present.
// Never copied: anything built from game files or staged for local use only (wine roots, runtime
// releases, runtime-local descriptors), the developer debugger, and kotor-wasm's own root page.
// An existing dist/ file is never overwritten: a clash stops the build.
//
// kotor-wasm's _headers rules are appended to dist/_headers. Each one first detaches the
// site-wide headers it replaces (Cloudflare's "! Name" lines), and the engine pages get a
// Content-Security-Policy that allows WebAssembly and workers in place of the site's stricter one.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.env.KOLTO_OUT ? resolve(process.env.KOLTO_OUT) : join(root, 'dist');

export const EXCLUDED = [
  /^index\.html$/,
  /^_headers$/,
  /^\.gitignore$/,
  /^debugger\//,
  /^original-game\/runtime-releases\//,
  /^original-game\/wine-roots\//,
  /^original-game\/runtime-local\.json$/,
  /^original-game\/\.runtime-local-[^/]*\.json$/,
];

// Paths that run an engine: they need WebAssembly, workers and same-origin framing.
export const ENGINE_PATHS = ['/original-game/*', '/sourceport/*'];
export const ENGINE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

export const isExcluded = (rel) => EXCLUDED.some((re) => re.test(rel));

// The subset of the _headers format both repositories use: a path line, then indented
// "Name: value" lines.
export function parseHeaders(text) {
  const rules = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) rules.push({ path: line.trim(), headers: [] });
    else if (rules.length) {
      const at = line.indexOf(':');
      rules[rules.length - 1].headers.push([line.slice(0, at).trim(), line.slice(at + 1).trim()]);
    }
  }
  return rules;
}

// Rules to append to the site's _headers. site: the site's parsed rules; runtime: kotor-wasm's.
export function engineHeaderRules(site, runtime) {
  const siteWide = new Set((site.find((r) => r.path === '/*')?.headers || []).map(([n]) => n.toLowerCase()));
  const byPath = new Map();
  const add = (path, name, value) => {
    if (!byPath.has(path)) byPath.set(path, []);
    byPath.get(path).push([name, value]);
  };
  for (const rule of runtime) for (const [name, value] of rule.headers) add(rule.path, name, value);
  for (const path of ENGINE_PATHS) {
    add(path, 'Content-Security-Policy', ENGINE_CSP);
    if (siteWide.has('x-frame-options')) add(path, 'X-Frame-Options', null);
  }
  let text = '\n# Kolto Tank player (staged from kotor-wasm by scripts/stage-play-runtime.mjs)\n';
  for (const [path, headers] of byPath) {
    text += `${path}\n`;
    const detached = new Set();
    for (const [name] of headers) {
      if (siteWide.has(name.toLowerCase()) && !detached.has(name.toLowerCase())) {
        text += `  ! ${name}\n`;
        detached.add(name.toLowerCase());
      }
    }
    for (const [name, value] of headers) if (value !== null) text += `  ${name}: ${value}\n`;
  }
  return text;
}

function main() {
  const source = process.env.KOTOR_WASM_WEB;
  if (!source) {
    console.log('stage-play-runtime: KOTOR_WASM_WEB not set, nothing staged');
    return;
  }
  const web = resolve(source);
  if (!existsSync(join(web, 'engines.json'))) throw new Error(`${web} is not kotor-wasm's web/ (no engines.json)`);

  const files = listFiles(web).filter((rel) => !isExcluded(rel));
  const clashes = files.filter((rel) => existsSync(join(dist, rel)));
  if (clashes.length) throw new Error(`would overwrite site files: ${clashes.join(', ')}`);
  for (const rel of files) {
    mkdirSync(dirname(join(dist, rel)), { recursive: true });
    copyFileSync(join(web, rel), join(dist, rel));
  }

  const siteHeaders = join(dist, '_headers');
  const site = existsSync(siteHeaders) ? parseHeaders(readFileSync(siteHeaders, 'utf8')) : [];
  const runtime = existsSync(join(web, '_headers')) ? parseHeaders(readFileSync(join(web, '_headers'), 'utf8')) : [];
  appendFileSync(siteHeaders, engineHeaderRules(site, runtime));

  const sourceport = files.includes('sourceport/build.json') ? 'with a source port build' : 'without a source port build';
  console.log(`stage-play-runtime: staged ${files.length} files from ${web} ${sourceport}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`stage-play-runtime: ${error.message}`);
    process.exit(1);
  }
}
