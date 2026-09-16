import { defineConfig } from 'vite';

const pagesBase = process.env.GITHUB_PAGES ? '/Pantheon/' : '/';

export default defineConfig({
  base: pagesBase,
  build: { target: 'es2022', sourcemap: false },
  server: { host: '127.0.0.1' },
});
