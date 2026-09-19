import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { scenarioById } from '../src/data/fixtures/scenarios.ts';

const run = promisify(execFile);
const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('build-galaxy-snapshot.mjs compiles dist/system.json into a versioned dist/galaxy snapshot', async () => {
  const cwd = new URL('../', import.meta.url).pathname;
  const workdir = await mkdtemp(join(tmpdir(), 'galaxy-build-'));
  try {
    await mkdir(join(workdir, 'dist'), { recursive: true });
    const system = scenarioById('all-live').build();
    await writeFile(join(workdir, 'dist', 'system.json'), JSON.stringify(system), 'utf8');

    const { stdout } = await run(process.execPath, [join(cwd, 'scripts/build-galaxy-snapshot.mjs')], { cwd: workdir });
    const summary = JSON.parse(stdout.trim());
    assert.equal(summary.contract, 'NEXO_ONE_GALAXY_V1');
    assert.ok(summary.snapshot_id.startsWith('galaxy-'));
    assert.equal(summary.tower_revision, system.bus.fingerprint);

    const latest = JSON.parse(await readFile(join(workdir, 'dist', 'galaxy', 'latest.json'), 'utf8'));
    assert.equal(latest.contract, 'NEXO_ONE_GALAXY_V1');
    assert.equal(latest.snapshot_id, summary.snapshot_id);
    assert.deepEqual(latest.changes, []);

    const versioned = JSON.parse(await readFile(join(workdir, 'dist', 'galaxy', 'snapshots', `${summary.snapshot_id}.json`), 'utf8'));
    assert.deepEqual(versioned, latest);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
});

test('GitHub Pages workflow compiles and reads back the galaxy snapshot from the same sanctioned Tower projection', async () => {
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');
  assert.match(workflow, /node scripts\/build-galaxy-snapshot\.mjs/);
  assert.match(workflow, /test -s dist\/galaxy\/latest\.json/);
  assert.match(workflow, /curl -fsSL "\$\{base\}\/galaxy\/latest\.json"/);
  assert.match(workflow, /GALAXY_CONTRACT_INVALID/);
  assert.match(workflow, /GALAXY_NOT_BOUND_TO_TOWER_PROJECTION/);
  assert.match(workflow, /PAGES_GALAXY_READBACK_OK/);
  // The galaxy build runs after build-pages-system.mjs, which is what produces dist/system.json.
  const systemIndex = workflow.indexOf('node scripts/build-pages-system.mjs');
  const galaxyIndex = workflow.indexOf('node scripts/build-galaxy-snapshot.mjs');
  assert.ok(systemIndex > -1 && galaxyIndex > systemIndex);
});
