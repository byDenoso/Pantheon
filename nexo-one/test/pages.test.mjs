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
  assert.match(remote, /cache:\s*'no-store'/);
  assert.match(remote, /endsWith\('\.json'\)/);
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

test('GitHub Pages personal plane reads the locally compiled public WorldState', async () => {
  const hook = await text('src/app/useWorld.ts');
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');
  const builder = await text('scripts/build-pages-system.mjs');

  assert.match(hook, /VITE_WORLD_ENDPOINT/);
  assert.doesNotMatch(hook, /fetch\('\/api\/world\?stream=1&refresh=1'/);
  assert.match(workflow, /VITE_WORLD_ENDPOINT:\s*\.\/world-public\.ndjson/);
  assert.match(workflow, /test -s dist\/world-public\.ndjson/);
  assert.match(builder, /world-public\.ndjson/);
  assert.match(builder, /buildPagesProjection/);
  assert.doesNotMatch(workflow, /VITE_WORLD_ENDPOINT:\s*https:\/\/nexo-one-two\.vercel\.app\/api\/world/);
});
