import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from '../lib/graph-session.mjs';

test('session uses graph summary and avoids a second state request', async()=>{
 let graphCalls=0,stateCalls=0;
 const summary={total:42,counts:{TEST:42}};
 const api={
  graph:async()=>{graphCalls++;return{nodes:[],edges:[],summary}},
  state:async()=>{stateCalls++;throw Error('state should not be called')},
  sync:async()=>({})
 };
 const session=createSession(api);
 const result=await session.refresh();
 assert.ok(result);
 assert.equal(graphCalls,1);
 assert.equal(stateCalls,0);
 assert.deepEqual(session.state.summary,summary);
});

test('session keeps backward compatibility when graph has no summary', async()=>{
 let stateCalls=0;
 const api={graph:async()=>({nodes:[],edges:[]}),state:async()=>{stateCalls++;return{total:7}},sync:async()=>({})};
 const session=createSession(api);
 await session.refresh();
 assert.equal(stateCalls,1);
 assert.equal(session.state.summary.total,7);
});
