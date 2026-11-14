# kolto-labs.org

The Kolto Labs website. Vite + React + TypeScript, every route prerendered to static HTML, served as Cloudflare Workers static assets.

## Quick start

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # repo snapshot, typecheck, client build, SSR build, prerender, OG image + icons -> dist/
npm run preview    # serve dist/ at http://localhost:4173
npm run deploy     # wrangler deploy (needs a Cloudflare login or CLOUDFLARE_API_TOKEN)
```

Node 20 or newer.

## Content

All copy lives in one file outside this folder: `../content/site-content.json`. `src/content/types.ts` describes its shape.

`src/content/index.ts` imports it through the `@site-content` alias. `vite.config.ts` and the `paths` entry in `tsconfig.json` point that alias at `../content/site-content.json`. When that file is missing, they fall back to `src/content/placeholder.json`, so the build never breaks. The build log says which file it used.

Markdown fields (`description`, `body`, `a`, `rePolicy`, `conduct`, `nameUsage`, …) go through `marked`. Raw HTML is escaped. Links are limited to `http(s):`, `mailto:`, relative paths and `#anchors`.

Links that are still placeholders live in `LINKS` in `src/content/index.ts`:
- the contact email

The site URL comes from `siteUrl` in the content file. The default is `https://kolto-labs.org`.

## Turning the Join page on or off

`src/flags.ts` has `PAGES.join`. It is `false` now, so the Join page is off for the time being. To turn it back on, set it to `true` and rebuild. One flag controls:
- the route, nav item, [J] hotkey and footer link
- the sitemap, llms.txt and page meta
- the `/join` 302 redirect to home, which `scripts/prerender.mjs` appends to `_redirects`
- the FAQ and About text that points at GitHub or `/#re-policy` while the page is off

`Join.tsx` and the `join` content stay in place.

## Projects from GitHub

The project list comes from the public, non-archived repos of the `kolto-labs` org, minus the repos listed in `EXCLUDED_HASHES` in `src/content/repo-filter.mjs`. It stores FNV-1a hashes of lowercase names. To exclude a repo, add its hash: `node -e "import('./src/content/repo-filter.mjs').then(m=>console.log(m.fnv('repo-name')))"`. Forks stay.

- `scripts/fetch-repos.mjs` runs first in `build` and `build:fast`. It writes `src/content/github-aggregate.json`: per repo, the release, stats, topics, crates, README features and which other projects it depends on. If the fetch fails, the old snapshot stays and the build goes on. `GITHUB_TOKEN` is optional and only raises the rate limit. Each unauthenticated run makes 1 + 3N requests to api.github.com (10 today, for 3 repos) out of the 60 per hour.
- In the browser, `src/lib/useProjects.ts` renders the snapshot first, then swaps in live data. Home and the install generator ask for releases only (1 + N API requests). `/projects` also asks for contributors and commit activity (1 + 3N). Results are cached in `localStorage` for 15 minutes. After a failed or partial run the page shows `live: false` and waits 15 minutes before it tries again. File reads come from `raw.githubusercontent.com`, which has no limit. Only files recorded in the snapshot's `files` list are read, plus files of repos newer than the snapshot.
- Entries in `projects` of the content file add a tagline, features and install commands to a repo with the same name. GitHub wins where it has an answer (description, language, licence, version, README features, install commands from release assets). The curated entry fills the rest. A repo with no entry still shows what GitHub has.
- Entries with no public repo show under "Watch the lab: not public yet". Set their `repo` to `null`.

## How it is built

| Step | What happens |
| --- | --- |
| `vite build` | Client bundle into `dist/`. Each route is its own chunk, and the hero effect and audio code are lazy chunks. |
| `vite build --ssr src/entry-server.tsx` | Server renderer into `.ssr/`. |
| `scripts/prerender.mjs` | Writes the files listed below. |
| `scripts/og.mjs` | Renders `og-image.png` (1200×630, NFO style), `apple-touch-icon.png`, `icon-192/512.png` and `favicon-32.png` with headless Chromium through `playwright-core`. Copies go to `public/` too, as a fallback for machines without Chromium. It never downloads a browser; point `PLAYWRIGHT_BROWSERS_PATH` at an existing install. |

`scripts/prerender.mjs` writes:
- `dist/<route>/index.html` for each route, and `dist/404.html`, each with its own title, description, canonical, Open Graph and Twitter tags, and JSON-LD:
  - Organization and WebSite on the home page
  - SoftwareSourceCode for each project
  - FAQPage on `/faq`
  - BreadcrumbList on inner pages
- `sitemap.xml`, `robots.txt` and `llms.txt`
- `favicon.svg`
- `_redirects`: 301s the retired `/press` URLs to `/`
- `_headers`: security headers, plus a CSP that hashes the one inline boot script

Hydration is guarded. The browser hydrates only when the HTML was prerendered for the current page (`data-page` on `#root`). Otherwise it renders from scratch.

## Cloudflare

`wrangler.jsonc` configures a static-assets-only Worker named `koltolabs`:
- `assets.directory: ./dist`
- `not_found_handling: 404-page`, which serves `404.html` with a 404 status
- `html_handling: auto-trailing-slash`, so `/about` becomes `/about/`, which matches the canonical URLs

`dist/_headers` sets CSP, HSTS, `nosniff`, frame denial and a Permissions-Policy. It also sets `Cache-Control: immutable` for the hashed files in `/assets/*`.

Deploy with `npm run build && npm run deploy`.

## Design notes

- **Direction:** a Copperlist hero (a cracktro) above a calm, text-mode NFO body.
- **Hero:** `src/components/Hero.tsx` renders the logo, headline and CTAs as real DOM. `src/hero/effect.ts` adds the canvas on top: a starfield, rotating copper bars, and a sine scroller with a kolto-tank reflection. The canvas:
  - is loaded when the browser is idle
  - respects devicePixelRatio (capped at 2)
  - pauses when the hero is offscreen or the tab is hidden
  - draws one still frame under `prefers-reduced-motion`
- **Logo:** a pixel face in `src/lib/blockfont.ts`. It is exported three ways: CP437 half-block text, one merged SVG path (used as a CSS mask, so there are no seams), and the favicon K. Palette cycling is a gradient that scrolls behind the mask.
- **Sound:** `src/lib/audio.ts` is a procedural 4-channel chiptune plus UI blips, all WebAudio with no audio files. It defaults to on for new visitors and is toggled with `M` or the Sound button. A one-year preference cookie and localStorage remember explicit changes. Browser autoplay policies may delay playback until the first interaction. Blips play only while sound is on.
- **Hotkeys:** `src/lib/hotkeys.ts` gives one single key per menu item (J too when the Join page is on), H for home, M for sound and C for CRT. They are ignored while typing in a field, while a modal is open, or when a modifier key is held.
- **CRT overlay:** scanlines and a vignette. Off by default; the choice is saved in `localStorage`.
- **Fonts:** Departure Mono (SIL OFL 1.1, vendored in `src/assets/fonts/`) for chrome, the NFO and headings. IBM Plex Sans and Plex Mono (SIL OFL 1.1, from `@fontsource`, latin subsets only) for prose and code. Credits are on `/credits#credits`.

## Checks

```sh
npm run build
npm run preview &
node scripts/shots.mjs ../shots          # viewport shots; add --full for full-page, --reduced for reduced motion
EXTRA_360=1 ROUTES=/,/faq/ node scripts/shots.mjs /tmp/shots --full
```

`shots.mjs` prints any console errors and any page-level horizontal overflow for each route and viewport, and exits non-zero if it finds either.
