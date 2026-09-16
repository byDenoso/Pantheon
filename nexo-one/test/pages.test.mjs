import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('GitHub Pages build uses repository base and configurable SystemState endpoint', async () => {
  const vite = await text('vite.config.ts');
  const remote = await text('src/data/adapters/remote.ts');

  assert.match(vite, /GITHUB_PAGES/);
  assert.match(vite, /Pantheon/);
  assert.match(remote, /VITE_SYSTEM_ENDPOINT/);
  assert.match(remote, /\/api\/system/);
});

test('GitHub Pages compiles public SystemState locally and deploys official Pages artifact', async () => {
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');

  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /VITE_SYSTEM_ENDPOINT:\s*\.\/system\.json/);
  assert.match(workflow, /node scripts\/build-pages-system\.mjs/);
  assert.doesNotMatch(workflow, /nexo-one-two\.vercel\.app\/api\/system/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
});
