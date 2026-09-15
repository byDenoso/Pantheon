import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// P0 retry marker: Vercel NEXO ONE previews are accepting builds again; keep behavior unchanged.
const root=new URL('../../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('live failover canary is bounded, reproducible and uses the existing Vercel fallback executor',async()=>{
  const runner=await read('science/runtime/vercel_fallback_canary.py');
  assert.match(runner,/--contract-b64/);
  assert.match(runner,/validation_status/);
  assert.match(runner,/result_hash/);
  assert.doesNotMatch(runner,/requests\.|urllib|subprocess|socket/);

  const workflow=await read('.github/workflows/nexo-vercel-failover-live-canary.yml');
  assert.match(workflow,/environment:\s*nexo-one-preview/);
  assert.match(workflow,/GITHUB_AVAILABLE:\s*['"]?false/i);
  assert.match(workflow,/runVercelFallbackShard/);
  assert.match(workflow,/chooseExecutor/);
  assert.match(workflow,/vercel-failover-canary-receipt\.json/);
  assert.match(workflow,/actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow,/workflow_dispatch/);
});
