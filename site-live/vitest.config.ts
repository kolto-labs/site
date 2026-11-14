import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentPath } from './vite.config';

const here = dirname(fileURLToPath(import.meta.url));

// Tests run in node. A file that needs a DOM can opt in with `// @vitest-environment jsdom`.
export default defineConfig({
  resolve: {
    alias: [
      { find: '@site-content', replacement: contentPath },
      { find: /^@kolto\/adaptive-music$/, replacement: resolve(here, '../packages/adaptive-music/src/index.ts') },
      { find: /^@kolto\/adaptive-music\//, replacement: resolve(here, '../packages/adaptive-music/src') + '/' },
    ],
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
