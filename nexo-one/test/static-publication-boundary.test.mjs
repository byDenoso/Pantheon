import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, access, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { APPROVED_PUBLIC_DATA, assertPublicDataPublicationAllowed, assertStaticPublication, sealStaticPublication } from '../scripts/static-publication.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const script = name => join(project, 'scripts', name);
const historicalPaths = ['system.json', 'science-projection-v1.json', 'world-public.ndjson',
  'tower-projection/projection.json', 'tower-projection/manifest.json', 'tower-projection/publication.json',
  'galaxy/latest.json', 'galaxy/index.json', 'galaxy/snapshots/galaxy-old.json', 'mcp/topology.json',
  'build-meta.json', 'data/current/manifest.json', 'unknown/private.txt', 'assets/private.json', 'assets/app.js.map'];

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'nexo-publication-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'dist', 'assets'), { recursive: true });
  await writeFile(join(root, 'dist', 'index.html'), '<html>application</html>');
  await writeFile(join(root, 'dist', 'assets', 'application-a1.js'), 'export const shell = true;');
  for (const relative of historicalPaths) {
    const file = join(root, 'dist', relative);
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, 'UNAPPROVED_RESEARCH_SENTINEL');
  }
  await mkdir(join(root, 'data'), { recursive: true });
  await writeFile(join(root, 'data', 'private.json'), 'PRESERVE_PRIVATE_INPUT');
  return root;
}

test('public content allowlist is empty and flags cannot authorize publication', () => {
  assert.deepEqual(APPROVED_PUBLIC_DATA, []);
  assert.throws(() => assertPublicDataPublicationAllowed({ approved: true }), /PUBLIC_DATA_PUBLICATION_DISABLED/);
});

test('static sealing removes every data/history artifact and preserves private inputs', async t => {
  const root = await fixture(t);
  await assert.rejects(assertStaticPublication(join(root, 'dist')), /UNAPPROVED_STATIC_PUBLICATION/);
  await symlink(join(root, 'data', 'private.json'), join(root, 'dist', 'assets', 'private.js'));
  const result = await sealStaticPublication(join(root, 'dist'));
  assert.equal(result.publicDataCount, 0);
  for (const relative of [...historicalPaths, 'assets/private.js']) {
    await assert.rejects(access(join(root, 'dist', relative)), { code: 'ENOENT' });
  }
  assert.equal(await readFile(join(root, 'data', 'private.json'), 'utf8'), 'PRESERVE_PRIVATE_INPUT');
  assert.match(await readFile(join(root, 'dist', 'assets', 'application-a1.js'), 'utf8'), /shell/);
  await assertStaticPublication(join(root, 'dist'));
  await assert.rejects(sealStaticPublication(join(root, 'data')), /REQUIRES_DIST_OUTPUT/);
});

test('Pages CLI never reads source projections, even when paths or approval flags are provided', async t => {
  const root = await fixture(t);
  const outcome = spawnSync(process.execPath, [script('build-pages-system.mjs')], {
    cwd: root, encoding: 'utf8', env: { ...process.env,
      NEXO_PUBLIC_PROJECTION: '/must-not-be-read/missing.json', NEXO_PUBLIC_PUBLICATION_APPROVED: 'true' },
  });
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.match(outcome.stdout, /PUBLIC_SHELL_ONLY/);
  await assertStaticPublication(join(root, 'dist'));
});

test('standalone galaxy and topology public builders stop before reading private data', () => {
  for (const name of ['build-galaxy-snapshot.mjs', 'build-mcp-topology.mjs']) {
    const outcome = spawnSync(process.execPath, [script(name)], { cwd: tmpdir(), encoding: 'utf8' });
    assert.notEqual(outcome.status, 0);
    assert.match(outcome.stderr, /PUBLIC_DATA_PUBLICATION_DISABLED/);
    assert.doesNotMatch(outcome.stderr, /ENOENT/);
  }
});

test('Pages workflow never retrieves private Tower inputs or old public history', async () => {
  const workflow = await readFile(join(project, '..', '.github/workflows/nexo-one-pages.yml'), 'utf8');
  assert.doesNotMatch(workflow, /NEXO_(?:VAULT_READ_TOKEN|DRIVE_READER_JSON)|_vault|build_public_projection|build-galaxy-snapshot|build-mcp-topology|Hydrate previous/);
  assert.match(workflow, /scripts\/static-publication\.mjs --check/);
  assert.match(workflow, /path: nexo-one\/dist/);
});


test('otherwise allowed scripts and HTML fail closed on private research family markers', async t => {
  const root = await fixture(t);
  await sealStaticPublication(join(root, 'dist'));
  for (const marker of ['PEER-DETECTION', 'peer.detection', 'Peer Detection']) {
    await writeFile(join(root, 'dist/assets/application-a1.js'), `export const research = ${JSON.stringify(marker)};`);
    await assert.rejects(assertStaticPublication(join(root, 'dist')), /PRIVATE_RESEARCH_MARKER/);
    await assert.rejects(sealStaticPublication(join(root, 'dist')), /PRIVATE_RESEARCH_MARKER/);
  }
  await writeFile(join(root, 'dist/assets/application-a1.js'), 'export const shell = true;');
  await writeFile(join(root, 'dist/index.html'), '<main>Peer Detection</main>');
  await assert.rejects(assertStaticPublication(join(root, 'dist')), /PRIVATE_RESEARCH_MARKER/);
});


test('release packaging rejects unapproved output before altering an existing release', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'release'), { recursive: true });
  await writeFile(join(root, 'release', 'keep.txt'), 'PREVIOUS_RELEASE');
  const outcome = spawnSync(process.execPath, [script('package-release.mjs')], { cwd: root, encoding: 'utf8' });
  assert.notEqual(outcome.status, 0);
  assert.match(outcome.stderr, /UNAPPROVED_STATIC_PUBLICATION/);
  assert.equal(await readFile(join(root, 'release', 'keep.txt'), 'utf8'), 'PREVIOUS_RELEASE');
});
