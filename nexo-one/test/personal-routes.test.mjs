import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=()=>readFile(new URL('../server/handler.mjs',import.meta.url),'utf8');

test('personal snapshot and action routes are explicitly mounted behind the private session boundary',async()=>{
  const handler=await read();
  assert.match(handler,/buildPersonalSnapshot/);
  assert.match(handler,/executePersonalAction/);
  assert.match(handler,/route==='personal'/);
  assert.match(handler,/route==='personal-action'/);
  assert.match(handler,/if\(!privateAccess\)return send\(\{error:'AUTH_REQUIRED'\},401\)/);
});

test('personal mutation is handled before the global GET-only guard and remains same-origin',async()=>{
  const handler=await read();
  const actionIndex=handler.indexOf("route==='personal-action'");
  const globalWriteGuard=handler.indexOf("req.method!=='GET')return send({error:'WRITES_DISABLED'}");
  assert.ok(actionIndex>0&&globalWriteGuard>actionIndex);
  const actionBlock=handler.slice(actionIndex,globalWriteGuard);
  assert.match(actionBlock,/sameOrigin\(req\)/);
  assert.match(actionBlock,/req\.method!=='POST'/);
  assert.match(actionBlock,/approval/);
});
