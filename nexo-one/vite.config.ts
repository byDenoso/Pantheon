import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const pagesBase = process.env.GITHUB_PAGES ? '/Pantheon/' : '/';

export default defineConfig({
  base: pagesBase,
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        mcp: resolve(process.cwd(), 'mcp/index.html'),
        atlas3d: resolve(process.cwd(), 'atlas3d/index.html'),
      },
    },
  },
  server: { host: '127.0.0.1' },
});
