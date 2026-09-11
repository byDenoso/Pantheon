import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOverviewSources } from '../src/data/load-overview.ts';

const response=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});

test('overview loader degrades each source independently',async()=>{
 const seen=[];
 const fetchImpl=async url=>{
  seen.push(url);
  if(url==='/api/state') return response(200,{counts:{TEST:3}});
  if(url==='/api/ops') return response(503,{error:'down'});
  if(url==='/api/audit') return response(200,{open:1});
  throw new Error('unexpected '+url);
 };
 const out=await loadOverviewSources(fetchImpl);
 assert.deepEqual(out.state,{counts:{TEST:3}});
 assert.equal(out.ops,null);
 assert.deepEqual(out.audit,{open:1});
 assert.deepEqual(seen,['/api/state','/api/ops','/api/audit']);
});
