import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCockpitSources, readMetadata, mergeRunSources, activeOperations, freshnessLabel } from '../src/core/cockpit-sources.ts';

const api = (overrides = {}) => ({
  health: async () => ({ contract: 'github-canonical-live-v1', dataSource: { source: 'github', freshness: 'LIVE', sourceVersion: 'main', fingerprint: 'sha256:published' } }),
  ops: async () => ({ actions: [], runs: [] }),
  automationRuns: async () => [],
  audit: async () => ({ issues: [] }),
  ...overrides
});

test('failed reads remain unavailable while valid empty collections remain empty', async () => {
  const result = await loadCockpitSources(api({ ops: async () => { throw Error('HTTP 503'); }, audit: async () => ({ error: 'UNAVAILABLE' }) }));
  assert.equal(result.ops.state, 'ERROR');
  assert.equal(result.ops.data, null);
  assert.equal(result.audit.state, 'ERROR');
  assert.deepEqual(result.runs.data, []);
  assert.equal(result.runs.state, 'READY');
});

test('independent run responses merge regardless of completion order', async () => {
  let finishOps;
  const ops = new Promise(resolve => { finishOps = resolve; });
  const loading = loadCockpitSources(api({ ops: () => ops, automationRuns: async () => [{ id: 'run:b', status: 'RUNNING' }] }));
  finishOps({ actions: [], runs: [{ id: 'run:a', status: 'RUNNING' }] });
  const result = mergeRunSources(await loading);
  assert.deepEqual(result.data.map(row => row.id).sort(), ['run:a', 'run:b']);
  assert.equal(result.state, 'READY');
});

test('partial run reads preserve records and never prove a complete zero', async () => {
  const result = mergeRunSources(await loadCockpitSources(api({ automationRuns: async () => { throw Error('HTTP 401'); } })));
  assert.equal(result.state, 'PARTIAL');
  assert.deepEqual(result.data, []);
});

test('missing or malformed collections are not accepted as zero', async () => {
  const result = await loadCockpitSources(api({ ops: async () => ({}), automationRuns: async () => [{ status: 'RUNNING' }], audit: async () => ({ issues: null }) }));
  assert.equal(result.ops.state, 'ERROR');
  assert.equal(result.runs.state, 'ERROR');
  assert.equal(result.audit.state, 'ERROR');
});

test('live nested metadata and static metadata preserve provenance without inventing sync time', () => {
  const live = readMetadata({ dataSource: { freshness: 'LIVE', source: 'github', sourceVersion: 'main', fingerprint: 'sha256:actual', sourceRef: 'https://github.com/byDenoso/Pantheon' } });
  assert.equal(live.sourceVersion, 'main');
  assert.equal(live.fingerprint, 'sha256:actual');
  assert.equal(live.updatedAt, null);
  assert.equal(readMetadata({ freshness: 'SNAPSHOT', sourceVersion: '2026-09-13' }).updatedAt, null);
  assert.equal(readMetadata({ sourceRef: 'javascript:alert(1)' }).sourceRef, null);
  assert.equal(freshnessLabel('UNKNOWN'), 'Origem não confirmada');
  assert.equal(freshnessLabel('DEGRADED'), 'Leitura degradada');
  assert.equal(readMetadata({ usedFallback: true, dataSource: { freshness: 'LIVE', usedFallback: false } }).freshness, 'DEGRADED');
});

test('unknown and terminal statuses do not become active work', () => {
  assert.deepEqual(activeOperations(['UNKNOWN', 'FAILED', 'PASS', 'SUCCESS', 'COMPLETED', 'RUNNING'].map(status => ({ id: status, status, label: status }))).map(row => row.id), ['RUNNING']);
});
