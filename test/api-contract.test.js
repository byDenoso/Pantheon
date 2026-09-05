const test = require('node:test');
const assert = require('node:assert/strict');

function makeRes() {
  return {
    headers: {}, statusCode: 200, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

test('api returns explicit degraded fallback when no supported database env exists', async () => {
  const { createHandler } = require('../api/nexo');
  const handler = createHandler({ env: {}, queryDatabaseFn: async () => { throw new Error('should not query'); } });
  const res = makeRes();
  await handler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.source, 'EMBEDDED_FALLBACK');
  assert.equal(res.body.sync.state, 'DEGRADED');
  assert.equal(res.body.reason, 'DATABASE_URL_NOT_CONFIGURED');
  assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
});

test('api accepts POSTGRES_URL alias and shapes live Neon rows', async () => {
  const { createHandler } = require('../api/nexo');
  let usedUrl = null;
  const handler = createHandler({
    env: { POSTGRES_URL: 'postgres://alias' },
    now: () => new Date('2026-09-05T12:00:00Z'),
    queryDatabaseFn: async (url) => {
      usedUrl = url;
      return {
        currentState: [
          { component: 'NEXO Continuity', status: 'ACTIVE', payload: { active_task: true } },
          { component: 'NEXO Scientific Core', status: 'ACTIVE_REVIEW', payload: { active_task: true } },
          { component: 'NEXO Executor', status: 'ACTIVE', payload: { active_task: true } },
          { component: 'SCIENCE', domain: 'SCIENCE', status: 'READY_CRITICAL' },
          { component: 'ENGINEERING', domain: 'ENGINEERING', status: 'READY' },
          { component: 'OLYMPUS', domain: 'OLYMPUS', status: 'NO_ACTIVE_ACTION' }
        ],
        attention: [], runtimeEvents: [],
        syncRows: [{ last_synced_at: '2026-09-05T11:58:00Z', sync_status: 'SYNCED' }]
      };
    }
  });
  const res = makeRes();
  await handler({}, res);
  assert.equal(usedUrl, 'postgres://alias');
  assert.equal(res.body.source, 'NEON_NEXO_OPS');
  assert.equal(res.body.sync.state, 'LIVE');
  assert.equal(res.body.lanes.length, 3);
});

test('api fails soft to degraded fallback if Neon query fails', async () => {
  const { createHandler } = require('../api/nexo');
  const handler = createHandler({
    env: { NEON_DATABASE_URL: 'postgres://neon' },
    queryDatabaseFn: async () => { throw new Error('connection refused'); }
  });
  const res = makeRes();
  await handler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.source, 'EMBEDDED_FALLBACK');
  assert.match(res.body.reason, /^NEON_QUERY_FAILED:/);
});
