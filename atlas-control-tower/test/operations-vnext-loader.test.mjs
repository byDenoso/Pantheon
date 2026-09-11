import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOperationsSources } from '../src/data/load-operations.ts';

test('operations loader degrades each source independently',async()=>{
 const api={
  ops:async()=>({counts:{runs:3}}),
  automationRuns:async()=>{throw Error('offline')},
  health:async()=>({ok:true,contract:'v1'}),
 };
 const got=await loadOperationsSources(api);
 assert.equal(got.ops.counts.runs,3);
 assert.equal(got.runs,null);
 assert.equal(got.health.ok,true);
});

test('operations loader never rejects the whole cockpit on one source failure',async()=>{
 const api={ops:async()=>{throw Error('x')},automationRuns:async()=>[],health:async()=>{throw Error('x')}};
 const got=await loadOperationsSources(api);
 assert.equal(got.ops,null);
 assert.deepEqual(got.runs,[]);
 assert.equal(got.health,null);
});