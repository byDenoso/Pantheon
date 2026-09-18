import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

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

test('GitHub Pages consumes only the sanctioned TOWER_V06 public projection', async () => {
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');
  const builder = await text('scripts/build-pages-system.mjs');

  assert.match(workflow, /NEXO_VAULT_READ_TOKEN/);
  assert.match(workflow, /byDenoso\/NEXO-Obsidian-Vault/);
  assert.match(workflow, /TOWER_V06\/projections\/public\/projection\.json/);
  assert.match(workflow, /TOWER_V06\/projections\/public\/manifest\.json/);
  assert.match(workflow, /verify_projection/);
  assert.match(workflow, /authority.*TOWER_V06/);
  assert.match(workflow, /projection_only/);
  assert.match(workflow, /writeback/);
  assert.match(workflow, /tower_commit/);
  assert.match(workflow, /event_cursor/);
  assert.match(workflow, /projection_fingerprint/);
  assert.doesNotMatch(workflow, /cp atlas-control-tower\/data\/nexo-drive-projection\.json/);
  assert.doesNotMatch(workflow, /truthgraph\.snapshot\.json/);

  assert.match(builder, /NEXO_PUBLIC_PROJECTION_V1/);
  assert.match(builder, /validateSanctionedProjection/);
  assert.match(builder, /Pantheon performs presentation shaping only/);
  assert.doesNotMatch(builder, /readProvider/);
  assert.doesNotMatch(builder, /public-system-input/);
  assert.doesNotMatch(builder, /nexo-drive-projection/);
  assert.doesNotMatch(builder, /truthgraph\.snapshot/);
});

test('GitHub Pages deploys official artifact and exposes projection readback', async () => {
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');

  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /VITE_SYSTEM_ENDPOINT:\s*\.\/system\.json/);
  assert.match(workflow, /VITE_WORLD_ENDPOINT:\s*\.\/world-public\.ndjson/);
  assert.match(workflow, /tower-projection\/manifest\.json/);
  assert.match(workflow, /PAGES_TOWER_PROJECTION_READBACK_OK/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
});

test('NEXO ONE is the only workflow allowed to publish the Pages root', async () => {
  const workflowsDir = new URL('../../.github/workflows/', import.meta.url);
  const files = (await readdir(workflowsDir)).filter(name => /\.ya?ml$/.test(name));
  const publishers = [];
  for (const file of files) {
    const body = await readFile(new URL(file, workflowsDir), 'utf8');
    if (/actions\/deploy-pages@v4/.test(body) || /pages:\s*write/.test(body)) publishers.push(file);
  }
  assert.deepEqual(publishers, ['nexo-one-pages.yml']);
});

test('GitHub Pages personal plane reads the locally compiled public WorldState', async () => {
  const hook = await text('src/app/useWorld.ts');
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');
  const builder = await text('scripts/build-pages-system.mjs');

  assert.match(hook, /VITE_WORLD_ENDPOINT/);
  assert.match(hook, /cache:'no-store'/);
  assert.match(hook, /endsWith\('\.ndjson'\)/);
  assert.doesNotMatch(hook, /fetch\('\/api\/world\?stream=1&refresh=1'/);
  assert.match(workflow, /VITE_WORLD_ENDPOINT:\s*\.\/world-public\.ndjson/);
  assert.match(workflow, /test -s dist\/world-public\.ndjson/);
  assert.match(builder, /world-public\.ndjson/);
  assert.match(builder, /buildPagesProjection/);
  assert.doesNotMatch(workflow, /VITE_WORLD_ENDPOINT:\s*https:\/\/nexo-one-two\.vercel\.app\/api\/world/);
});
