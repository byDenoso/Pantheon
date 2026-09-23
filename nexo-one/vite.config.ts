import { defineConfig } from 'vite';

const pagesBase = process.env.GITHUB_PAGES ? '/Pantheon/' : '/';

export default defineConfig({
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
});
