const test = require('node:test');
const assert = require('node:assert/strict');

const {
  chooseDatabaseUrl,
  deriveSync,
  shapePayload,
  fallbackPayload,
  getMaterialEvents,
} = require('../lib/nexo-data');

test('chooseDatabaseUrl honors DATABASE_URL then POSTGRES_URL then NEON_DATABASE_URL', () => {
  assert.deepEqual(chooseDatabaseUrl({
    DATABASE_URL: 'db', POSTGRES_URL: 'pg', NEON_DATABASE_URL: 'neon'
  }), { key: 'DATABASE_URL', value: 'db' });
  assert.deepEqual(chooseDatabaseUrl({ POSTGRES_URL: 'pg', NEON_DATABASE_URL: 'neon' }), { key: 'POSTGRES_URL', value: 'pg' });
  assert.deepEqual(chooseDatabaseUrl({ NEON_DATABASE_URL: 'neon' }), { key: 'NEON_DATABASE_URL', value: 'neon' });
  assert.equal(chooseDatabaseUrl({}), null);
});

test('deriveSync reports LIVE for a recent successful sync and STALE when old', () => {
  const now = new Date('2026-09-05T12:00:00Z');
  assert.deepEqual(deriveSync([{ last_synced_at: '2026-09-05T11:55:00Z', sync_status: 'SYNCED' }], now), {
    state: 'LIVE', ageMinutes: 5, lastSyncedAt: '2026-09-05T11:55:00Z'
  });
  assert.equal(deriveSync([{ last_synced_at: '2026-09-05T09:00:00Z', sync_status: 'SYNCED' }], now).state, 'STALE');
});

test('getMaterialEvents removes routine no-op heartbeat noise', () => {
  const events = [
    { event_id: '1', event_type: 'MATERIAL_RUN', status: 'PASS', summary: 'changed something' },
    { event_id: '2', event_type: 'HEARTBEAT', status: 'PASS_NO_OP', summary: 'heartbeat' },
    { event_id: '3', event_type: 'MATERIAL_RUN', status: 'PASS_NO_OP', summary: 'No new material after dedupe' }
  ];
  assert.deepEqual(getMaterialEvents(events).map(x => x.event_id), ['1']);
});

test('shapePayload keeps only current three operational roles and separates retired history', () => {
  const rows = [
    { component: 'NEXO Continuity', domain: null, status: 'PASS_NO_OP', synced_at: '2026-09-05T11:59:00Z', payload: { active_task: true } },
    { component: 'NEXO Scientific Core', domain: 'SCIENCE', status: 'ACTIVE_REVIEW', synced_at: '2026-09-05T11:59:00Z', payload: { active_task: true } },
    { component: 'NEXO Executor', domain: null, status: 'ACTIVE_NO_OP', synced_at: '2026-09-05T11:59:00Z', payload: { active_task: true } },
    { component: 'NEXO Journal', domain: null, status: 'RETIRED_MERGED', synced_at: '2026-09-05T11:59:00Z', payload: { retired: true } },
    { component: 'NEXO Guardian', domain: null, status: 'RETIRED_MERGED', synced_at: '2026-09-05T11:59:00Z', payload: { retired: true } },
    { component: 'SCIENCE', domain: 'SCIENCE', status: 'READY_CRITICAL', current_action: 'ACT-SCI' },
    { component: 'ENGINEERING', domain: 'ENGINEERING', status: 'READY_CRITICAL', current_action: 'ACT-ENG' },
    { component: 'OLYMPUS', domain: 'OLYMPUS', status: 'NO_ACTIVE_ACTION' }
  ];
  const out = shapePayload({ currentState: rows, attention: [], runtimeEvents: [], syncRows: [] }, new Date('2026-09-05T12:00:00Z'));
  assert.deepEqual(out.roles.map(x => x.component), ['NEXO Continuity', 'NEXO Scientific Core', 'NEXO Executor']);
  assert.deepEqual(out.historicalRoles.map(x => x.component), ['NEXO Journal', 'NEXO Guardian']);
  assert.deepEqual(out.lanes.map(x => x.component), ['SCIENCE', 'ENGINEERING', 'OLYMPUS']);
});

test('fallbackPayload is visibly degraded and never claims live data', () => {
  const out = fallbackPayload('DATABASE_URL_NOT_CONFIGURED');
  assert.equal(out.source, 'EMBEDDED_FALLBACK');
  assert.equal(out.sync.state, 'DEGRADED');
  assert.equal(out.reason, 'DATABASE_URL_NOT_CONFIGURED');
  assert.equal(out.roles.length, 3);
  assert.equal(out.historicalRoles.length, 2);
});
