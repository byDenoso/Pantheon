import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveHealthPlanes, planeLabel } from '../src/core/cockpit-view-model.ts';

test('resolveHealthPlanes always returns exactly the 8 locked planes in order', () => {
  const planes = resolveHealthPlanes(null);
  assert.deepEqual(
    planes.map(p => p.id),
    ['CANONICAL_STATE', 'WRITE_CONTRACT', 'SCHEDULER', 'EXECUTION', 'API', 'DEPLOYMENT', 'DOCUMENTATION', 'ESTATE_HYGIENE']
  );
});

test('with no health payload, every plane is UNKNOWN -- never GREEN by default', () => {
  const planes = resolveHealthPlanes(null);
  assert.ok(planes.every(p => p.status === 'UNKNOWN'));
});

test('a real contract payload turns CANONICAL_STATE green with a reason, other planes stay UNKNOWN', () => {
  const planes = resolveHealthPlanes({ contract: 'nexo-static-runtime-v1', sourceVersion: '2026-09-13T00:00:00Z' });
  const canonical = planes.find(p => p.id === 'CANONICAL_STATE');
  assert.equal(canonical.status, 'GREEN');
  assert.match(canonical.reason, /nexo-static-runtime-v1/);
  const scheduler = planes.find(p => p.id === 'SCHEDULER');
  assert.equal(scheduler.status, 'UNKNOWN');
});

test('API plane reflects LIVE vs SNAPSHOT freshness, never assumes LIVE', () => {
  const live = resolveHealthPlanes({ dataSource: { freshness: 'LIVE' } });
  const snapshot = resolveHealthPlanes({ dataSource: { freshness: 'SNAPSHOT' } });
  assert.equal(live.find(p => p.id === 'API').status, 'GREEN');
  assert.equal(snapshot.find(p => p.id === 'API').status, 'AMBER');
});

test('planeLabel covers every plane id with a non-empty Portuguese label', () => {
  for (const id of ['CANONICAL_STATE', 'WRITE_CONTRACT', 'SCHEDULER', 'EXECUTION', 'API', 'DEPLOYMENT', 'DOCUMENTATION', 'ESTATE_HYGIENE']) {
    assert.ok(planeLabel(id).length > 0);
  }
});
