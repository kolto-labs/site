# Kolto Labs website

Source for the [Kolto Labs website](https://koltolabs.bodecloud.workers.dev/).

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm.

```sh
cd site-live
npm ci
npm run dev
```

## Build

```sh
cd site-live
npm run build
npm run preview
```

The build writes static pages and assets to `site-live/dist/`. It uses the checked-in GitHub repository snapshot when refreshing public repository data fails.

## Source layout

- `site-live/src/`: React pages, styles, animation, and audio integration.
- `site-live/public/`: images, icons, and font licences.
- `site-live/scripts/`: build and prerender scripts.
- `content/site-content.json`: site copy and metadata.
- `packages/adaptive-music/`: audio dependency used by the site.

Keep these directories together: the Vite and TypeScript configurations resolve the content and audio package through relative paths. More build details are in [site-live/README.md](site-live/README.md).

## Cloudflare

`site-live/wrangler.jsonc` configures the `koltolabs` Worker to serve the built static assets. After building, an authenticated operator can deploy with `npm run deploy` from `site-live/`.

## Import provenance

Imported on 2026-11-14 from the current local site source, including its existing uncommitted site changes. The source baseline was local commit `b0e65db`. The deployed website currently serves an older restored bundle with the suffix `r20261013-restore`; this import is not claimed to reproduce that deployment byte for byte. Importing this repository does not deploy the website.

The production UI and audio source captured in local commit `00a8fdb` was subsequently restored to retain the deployed settings dialog, audio routing, and scene integration. The newer Play route and current content are retained. Source integration fixes are included; the original local archive and history are unchanged.
