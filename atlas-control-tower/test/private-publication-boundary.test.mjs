import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { withPrivateApiBoundary } from '../lib/private-api-boundary.mjs';
import { assertPrivateProjectionOutput } from '../lib/publication-policy.mjs';
import { assertShellOnly } from '../scripts/assert-publication.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const endpoints = ['atlas.js', 'projection.js', 'universal-projection.js', 'runner.js', 'science.js',
  'observatory-questions.js', 'runtime-drive.js', 'runtime-github.js', 'runtime-semantic.js',
  'runtime-v2.js', 'runtime.js', 'runtime-orphans.js', 'mcp.js', 'live/activity.mjs',
  'private/index.mjs', 'private/cockpit.mjs', 'private/activity.mjs', 'private/research.mjs',
  'private/entity.mjs', 'private/learner.mjs', 'private/sync.mjs', 'private/semantic.mjs',
  'private/control.mjs', 'private/drive-bootstrap.mjs'];
function response() {
  return { statusCode: 200, headers: {}, body: '',
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    end(body) { this.body = body; } };
}

test('retired boundary never invokes a reader even with cookies, API keys, or OIDC', async () => {
  let calls = 0;
  const handler = withPrivateApiBoundary(() => { calls++; throw new Error('private reader reached'); });
  for (const headers of [{}, { cookie: 'nexo_session=old; __Host-atlas_session=old',
    authorization: 'Bearer old-machine-key', 'x-vercel-oidc-token': 'deployment-token' }]) {
    const res = response();
    await handler({ method: 'GET', headers }, res);
    assert.equal(res.statusCode, 410);
    assert.equal(res.headers['cache-control'], 'private, no-store');
    assert.deepEqual(JSON.parse(res.body), { error: 'LEGACY_ATLAS_DATA_API_RETIRED' });
  }
  assert.equal(calls, 0);
});

test('every legacy data entrypoint denies unauthenticated or conflicting identities before network reads', async () => {
  const previousFetch = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async () => { reads++; throw new Error('UNEXPECTED_NETWORK_READ'); };
  try {
    for (const endpoint of endpoints) {
      const { default: handler } = await import(new URL(`../api/${endpoint}`, import.meta.url));
      for (const method of ['GET', 'POST', 'OPTIONS']) {
        const res = response();
        await handler({ method, url: '/api/state?route=state', query: { route: 'research' },
          headers: { cookie: 'nexo_session=old', authorization: 'Bearer old-key', 'x-vercel-oidc-token': 'oidc' },
          body: { method: 'tools/list' } }, res);
        const machineOnly = ['mcp.js', 'runtime.js', 'runtime-v2.js', 'runtime-semantic.js', 'universal-projection.js'].includes(endpoint);
        assert.equal(res.statusCode, machineOnly ? 401 : 410, `${endpoint} ${method}`);
        assert.deepEqual(JSON.parse(res.body), { error: machineOnly ? 'UNAUTHORIZED' : 'LEGACY_ATLAS_DATA_API_RETIRED' }, endpoint);
      }
    }
    assert.equal(reads, 0);
  } finally { globalThis.fetch = previousFetch; }
});

test('private compiler outputs cannot target served data or follow symlinks into it', async t => {
  for (const relative of ['public', 'public/data', 'public/data/v3', 'dist', 'dist/research']) {
    assert.throws(() => assertPrivateProjectionOutput(join(root, relative)), /PUBLIC_DATA_PUBLICATION_DISABLED/);
  }
  const temp = await mkdtemp(join(tmpdir(), 'atlas-private-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  assert.doesNotThrow(() => assertPrivateProjectionOutput(join(temp, 'private-input')));
  await symlink(join(root, 'public'), join(temp, 'via-symlink'));
  assert.throws(() => assertPrivateProjectionOutput(join(temp, 'via-symlink', 'nested')), /PUBLIC_DATA_PUBLICATION_DISABLED/);
});

test('legacy public generators reject before deleting tracked historical sources', async () => {
  const historical = join(root, 'public/data/v3/current/manifest.json');
  const before = await readFile(historical, 'utf8');
  for (const args of [
    ['scripts/generate-static-state.mjs', 'public/data'],
    ['scripts/generate-atlas-v3-state.mjs', '--input', 'v3/tower-source.json', '--out', 'public/data/v3'],
  ]) {
    const outcome = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    assert.notEqual(outcome.status, 0);
    assert.match(outcome.stderr, /PUBLIC_DATA_PUBLICATION_DISABLED/);
  }
  assert.equal(await readFile(historical, 'utf8'), before);
});

test('legacy build uses no public directory or automatic source regeneration', async () => {
  const vite = await readFile(join(root, 'vite.config.ts'), 'utf8');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.match(vite, /publicDir:\s*false/);
  for (const name of ['prebuild', 'pretest', 'predev', 'prestart']) assert.equal(pkg.scripts[name], undefined);
  assert.match(pkg.scripts.postbuild, /assert-publication\.mjs/);
});

test('build artifact verifier rejects historical JSON, unknown files, and symlinks', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'atlas-shell-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await mkdir(join(temp, 'assets'), { recursive: true });
  await writeFile(join(temp, 'index.html'), '<html>shell</html>');
  await writeFile(join(temp, 'assets', 'main-a1.js'), 'export const shell = true;');
  await assertShellOnly(temp);
  await writeFile(join(temp, 'system.json'), '{"private":true}');
  await assert.rejects(assertShellOnly(temp), /UNAPPROVED_STATIC_PUBLICATION/);
  await rm(join(temp, 'system.json'));
  await symlink(join(root, 'data/nexo-drive-projection.json'), join(temp, 'assets', 'snapshot.js'));
  await assert.rejects(assertShellOnly(temp), /UNAPPROVED_STATIC_PUBLICATION/);
});

test('legacy compiled labels are private even when no JSON data file exists',async t=>{
 const temp=await mkdtemp(join(tmpdir(),'atlas-label-boundary-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 await mkdir(join(temp,'assets'));await writeFile(join(temp,'index.html'),'<html>shell</html>');
 // Existing domain taxonomy is private data too, not only numeric research results.
 for(const marker of ['OLYMPUS','Olympus','PEER','TOWER_V06']){
  await writeFile(join(temp,'assets','main.js'),JSON.stringify({label:marker}));
  await assert.rejects(assertShellOnly(temp),/PRIVATE_RESEARCH_MARKER/);
 }
});
