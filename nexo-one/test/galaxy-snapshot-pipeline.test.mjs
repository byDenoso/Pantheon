import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { scenarioById } from '../src/data/fixtures/scenarios.ts';

const run = promisify(execFile);
const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('build-galaxy-snapshot.mjs compiles dist/system.json into a versioned snapshot and index', async () => {
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
    assert.equal(summary.history_size, 1);

    const latest = JSON.parse(await readFile(join(workdir, 'dist', 'galaxy', 'latest.json'), 'utf8'));
    const index = JSON.parse(await readFile(join(workdir, 'dist', 'galaxy', 'index.json'), 'utf8'));
    assert.equal(latest.contract, 'NEXO_ONE_GALAXY_V1');
    assert.equal(latest.snapshot_id, summary.snapshot_id);
    assert.deepEqual(latest.changes, []);
    assert.equal(index.contract, 'NEXO_ONE_GALAXY_INDEX_V1');
    assert.equal(index.latest_snapshot_id, latest.snapshot_id);
    assert.equal(index.snapshots.length, 1);

    const versioned = JSON.parse(await readFile(join(workdir, 'dist', 'galaxy', 'snapshots', `${summary.snapshot_id}.json`), 'utf8'));
    assert.deepEqual(versioned, latest);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
});

test('a later build diffs the last valid snapshot and preserves bounded history', async () => {
  const cwd = new URL('../', import.meta.url).pathname;
  const workdir = await mkdtemp(join(tmpdir(), 'galaxy-history-'));
  try {
    await mkdir(join(workdir, 'dist'), { recursive: true });
    const first = scenarioById('all-live').build();
    await writeFile(join(workdir, 'dist', 'system.json'), JSON.stringify(first), 'utf8');
    await run(process.execPath, [join(cwd, 'scripts/build-galaxy-snapshot.mjs')], { cwd: workdir });

    const firstLatestPath = join(workdir, 'dist', 'galaxy', 'latest.json');
    const firstLatest = JSON.parse(await readFile(firstLatestPath, 'utf8'));
    await copyFile(firstLatestPath, join(workdir, 'dist', 'galaxy', 'previous.json'));

    const second = structuredClone(first);
    second.generated_at = '2026-09-19T18:00:00Z';
    second.bus.generated_at = second.generated_at;
    second.bus.fingerprint = 'sha256:' + 'b'.repeat(64);
    second.graph.nodes[0].state = second.graph.nodes[0].state === 'LIVE' ? 'STALE' : 'LIVE';
    await writeFile(join(workdir, 'dist', 'system.json'), JSON.stringify(second), 'utf8');

    const { stdout } = await run(process.execPath, [join(cwd, 'scripts/build-galaxy-snapshot.mjs')], {
      cwd: workdir,
      env: { ...process.env, NEXO_GALAXY_PREVIOUS: 'dist/galaxy/previous.json', NEXO_GALAXY_RETENTION: '2' },
    });
    const summary = JSON.parse(stdout.trim());
    const latest = JSON.parse(await readFile(join(workdir, 'dist', 'galaxy', 'latest.json'), 'utf8'));
    const index = JSON.parse(await readFile(join(workdir, 'dist', 'galaxy', 'index.json'), 'utf8'));

    assert.notEqual(latest.snapshot_id, firstLatest.snapshot_id);
    assert.ok(latest.changes.some(change => change.change_type === 'STATUS_CHANGED'));
    assert.equal(summary.previous_snapshot_id, firstLatest.snapshot_id);
    assert.equal(index.retention, 2);
    assert.equal(index.snapshots.length, 2);
    assert.ok(index.snapshots.some(item => item.snapshot_id === firstLatest.snapshot_id));
    assert.ok(index.snapshots.some(item => item.snapshot_id === latest.snapshot_id));
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
});

test('GitHub Pages refreshes every two hours, hydrates history and reads back the versioned galaxy', async () => {
  const workflow = await text('../.github/workflows/nexo-one-pages.yml');
  assert.match(workflow, /cron: '17 \*\/2 \* \* \*'/);
  assert.match(workflow, /Hydrate previous valid galaxy snapshot history/);
  assert.match(workflow, /NEXO_GALAXY_PREVIOUS: dist\/galaxy\/previous\.json/);
  assert.match(workflow, /NEXO_GALAXY_RETENTION: '168'/);
  assert.match(workflow, /node scripts\/build-galaxy-snapshot\.mjs/);
  assert.match(workflow, /test -s dist\/galaxy\/latest\.json/);
  assert.match(workflow, /test -s dist\/galaxy\/index\.json/);
  assert.match(workflow, /GALAXY_VERSIONED_SNAPSHOT_MISSING/);
  assert.match(workflow, /galaxy\/snapshots\/\$\{galaxy_id\}\.json/);
  assert.match(workflow, /GALAXY_VERSIONED_READBACK_MISMATCH/);
  assert.match(workflow, /PAGES_GALAXY_INDEX_READBACK_OK/);
  assert.match(workflow, /VITE_GALAXY_ENDPOINT: \.\/galaxy\/latest\.json/);
  const systemIndex = workflow.indexOf('node scripts/build-pages-system.mjs');
  const galaxyIndex = workflow.indexOf('node scripts/build-galaxy-snapshot.mjs');
  assert.ok(systemIndex > -1 && galaxyIndex > systemIndex);
});
