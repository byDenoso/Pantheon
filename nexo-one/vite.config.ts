import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { sealStaticPublication } from './scripts/static-publication.mjs';

const pagesBase = process.env.GITHUB_PAGES ? '/Pantheon/' : '/';

export default defineConfig(({command}) => ({
  resolve: command === 'build' ? {alias: [{find: /(?:\.\.\/|\.\/)+(?:data\/)?fixtures\/scenarios\.ts$/, replacement: fileURLToPath(new URL('./src/data/fixtures/production-empty.ts', import.meta.url))}]} : undefined,
  plugins: [(() => { let output = ''; return {name: 'atlas-public-shell-only', apply: 'build' as const, configResolved(config: {root: string; build: {outDir: string}}) {output = resolve(config.root, config.build.outDir);}, async closeBundle() {await sealStaticPublication(output);}}; })()],
  base: pagesBase,
  build: {
    target: 'es2022',
    sourcemap: false,
    // The legacy entries remain in the build until their public redirects have
    // been verified. Their HTML payloads are now minimal bridge documents.
    rollupOptions: {
      input: {
        main: 'index.html',
        mcp: 'mcp/index.html',
        atlas3d: 'atlas3d/index.html',
      },
    },
  },
  server: { host: '127.0.0.1' },
}));
