import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from '../lib/graph-session.mjs';

test('session uses embedded graph summary and skips state request', async()=>{
 let graphCalls=0,stateCalls=0;
 const api={
  graph:async()=>{graphCalls++;return{focus:'system:NEXO',nodes:[{id:'system:NEXO'}],edges:[],summary:{total:7,counts:{TEST:3}}}},
  state:async()=>{stateCalls++;return{total:99}},sync:async()=>({})
 };
 const s=createSession(api);
 await s.refresh();
 assert.equal(graphCalls,1);
 assert.equal(stateCalls,0);
 assert.equal(s.state.summary.total,7);
});

test('session falls back to state for an older graph contract', async()=>{
 let stateCalls=0;
 const api={graph:async()=>({focus:'system:NEXO',nodes:[],edges:[]}),state:async()=>{stateCalls++;return{total:9}},sync:async()=>({})};
 const s=createSession(api);await s.refresh();assert.equal(stateCalls,1);assert.equal(s.state.summary.total,9);
});