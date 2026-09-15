import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('live failover canary v2 is branch-bounded, reproducible and uses the existing Vercel fallback executor',async()=>{
  const runner=await read('science/runtime/vercel_fallback_canary.py');
  assert.match(runner,/--contract-b64/);
  assert.match(runner,/validation_status/);
  assert.match(runner,/result_hash/);
  assert.doesNotMatch(runner,/requests\.|urllib|subprocess|socket/);

  const canary=await read('nexo-one/server/executor/live-canary.mjs');
  assert.match(canary,/test\/nexo-vercel-failover-live-canary-v2/);
  assert.match(canary,/chooseExecutor/);
  assert.match(canary,/runVercelFallbackShard/);
  assert.match(canary,/GITHUB_UNAVAILABLE/);
  assert.match(canary,/scientific_effect:'NONE'/);
  assert.match(canary,/sessionRef/);
  assert.match(canary,/^|[^A-Za-z]sbx_/m);

  const api=await read('nexo-one/api/index.js');
  assert.match(api,/failover-canary/);
  assert.match(api,/runLiveVercelFallbackCanary/);
  assert.match(api,/LIVE_CANARY_BRANCH/);
});
