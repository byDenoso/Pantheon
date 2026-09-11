import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOverviewSources } from '../src/data/load-overview.ts';

test('overview loader degrades each source independently',async()=>{
 const seen=[];
 const api={
  state:async()=>{seen.push('state');return {counts:{TEST:3}}},
  ops:async()=>{seen.push('ops');throw new Error('down')},
  audit:async()=>{seen.push('audit');return {open:1}},
 };
 const out=await loadOverviewSources(api);
 assert.deepEqual(out.state,{counts:{TEST:3}});
 assert.equal(out.ops,null);
 assert.deepEqual(out.audit,{open:1});
 assert.deepEqual(seen.sort(),['audit','ops','state']);
});
