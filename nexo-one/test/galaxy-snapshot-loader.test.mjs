import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertGalaxySnapshot,
  galaxySnapshotAgeLabel,
  galaxySnapshotFreshness,
  loadGalaxySnapshot,
  snapshotAgeMs,
} from '../src/data/galaxySnapshot.ts';
import { compileGalaxySnapshot } from '../src/viewmodels/galaxyCompiler.ts';
import { scenarioById } from '../src/data/fixtures/scenarios.ts';

const snapshot = () => compileGalaxySnapshot(scenarioById('all-live').build());

test('assertGalaxySnapshot accepts the Stage 1 contract and rejects malformed payloads', () => {
  const value = snapshot();
  assert.equal(assertGalaxySnapshot(value).snapshot_id, value.snapshot_id);
  assert.throws(() => assertGalaxySnapshot({ contract: 'NOPE' }), /GALAXY_CONTRACT_INVALID/);
  assert.throws(() => assertGalaxySnapshot({ ...value, domains: ['SCIENCE'] }), /GALAXY_DOMAINS_INVALID/);
});

test('freshness follows the two-hour publication cadence with bounded grace', () => {
  const now = Date.parse('2026-09-19T18:00:00Z');
  assert.equal(galaxySnapshotFreshness('2026-09-19T16:00:00Z', now), 'FRESH');
  assert.equal(galaxySnapshotFreshness('2026-09-19T14:30:00Z', now), 'AGING');
  assert.equal(galaxySnapshotFreshness('2026-09-19T10:00:00Z', now), 'STALE');
  assert.equal(galaxySnapshotFreshness('bad-date', now), 'UNKNOWN');
  assert.equal(snapshotAgeMs('2026-09-19T17:00:00Z', now), 60 * 60 * 1000);
  assert.equal(galaxySnapshotAgeLabel('2026-09-19T16:00:00Z', now), 'updated 2h ago');
});

test('loadGalaxySnapshot validates successful reads and can keep a known-good fallback', async () => {
  const value = snapshot();
  const loaded = await loadGalaxySnapshot({
    endpoint: '/galaxy/latest.json',
    fetchImpl: async () => new Response(JSON.stringify(value), { status: 200 }),
  });
  assert.equal(loaded.snapshot_id, value.snapshot_id);

  const fallback = await loadGalaxySnapshot({
    endpoint: '/galaxy/latest.json',
    fallback: value,
    fetchImpl: async () => new Response('broken', { status: 503 }),
  });
  assert.equal(fallback.snapshot_id, value.snapshot_id);

  await assert.rejects(
    () => loadGalaxySnapshot({
      endpoint: '/galaxy/latest.json',
      fetchImpl: async () => new Response('broken', { status: 503 }),
    }),
    /GALAXY_HTTP_503/,
  );
});
