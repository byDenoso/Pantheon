import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('projection service auth exists and is scoped to the projection route',async()=>{
  const auth=await import('../server/auth/vercel-oidc.mjs').catch(()=>null);
  assert.equal(typeof auth?.verifyProjectionService,'function');
  const handler=await readFile(new URL('../server/handler.mjs',import.meta.url),'utf8');
  assert.match(handler,/verifyProjectionService/);
  assert.match(handler,/route==='projections'/);
});
