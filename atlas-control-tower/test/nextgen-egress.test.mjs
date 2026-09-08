import test from 'node:test';
import assert from 'node:assert/strict';
import {healthCheck} from '../api/ng.js';

test('NextGen health probe does not hydrate the full canonical graph', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async url => {
    calls += 1;
    const table = new URL(url).pathname.split('/').at(-1);
    return {
      ok: true,
      json: async () => table === 'entities'
        ? [{entity_id:'T-EGRESS', entity_type:'TEST', title:'Egress probe', status:'ACTIVE'}]
        : []
    };
  };

  try {
    const out = await healthCheck({headers:{'x-vercel-oidc-token':'test-oidc'}});
    assert.equal(out.ok, true);
    assert.equal(calls, 1, 'health must issue only the lightweight liveness query');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
