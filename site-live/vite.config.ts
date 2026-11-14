import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// The copywriter's file is the source of truth. When it is absent (early in the
// project) we fall back to the bundled placeholder so the build never breaks.
const realContent = resolve(here, '../content/site-content.json');
const placeholder = resolve(here, 'src/content/placeholder.json');
export const contentPath = existsSync(realContent) ? realContent : placeholder;

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'kolto:content-source',
      configResolved() {
        console.log(`[kolto] content source: ${contentPath === realContent ? 'content/site-content.json' : 'src/content/placeholder.json (fallback)'}`);
      },
    },
  ],
  resolve: {
    alias: [
      { find: '@site-content', replacement: contentPath },
      { find: /^@kolto\/adaptive-music$/, replacement: resolve(here, '../packages/adaptive-music/src/index.ts') },
      { find: /^@kolto\/adaptive-music\//, replacement: resolve(here, '../packages/adaptive-music/src') + '/' },
    ],
  },
  server: {
    fs: { allow: [resolve(here, '..')] },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          if (id.includes('node_modules/marked')) return 'marked';
          return undefined;
        },
      },
    },
  },
  ssr: {
    noExternal: ['@fontsource/ibm-plex-sans', '@fontsource/ibm-plex-mono'],
  },
});
