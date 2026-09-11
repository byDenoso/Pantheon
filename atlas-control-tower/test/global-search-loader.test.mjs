import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlobalSearchSources } from '../src/data/load-global-search.ts';

function api(fail=''){
 return {
  graph:async query=>{if(fail==='graph')throw Error('down');return {nodes:[{id:query.focus,type:'SYSTEM',label:query.query||''}]};},
  learning:async()=>fail==='learning'?Promise.reject(Error('down')):{ladder:[]},
  ops:async()=>fail==='ops'?Promise.reject(Error('down')):{actions:[],events:[]},
  automationRuns:async()=>fail==='runs'?Promise.reject(Error('down')):[],
  audit:async()=>fail==='audit'?Promise.reject(Error('down')):{categories:[]},
 };
}

test('global search loader normalizes query contracts per source',async()=>{
 const calls=[];const a=api();const graph=a.graph;
 a.graph=async q=>{calls.push(q);return graph(q)};
 const out=await loadGlobalSearchSources('runtime',a);
 assert.equal(out.science?.nodes?.[0]?.label,'runtime');
 assert.ok(calls.some(q=>q.focus==='system:SCIENCE'&&q.mode==='search'&&q.query==='runtime'));
 assert.ok(calls.some(q=>q.focus==='system:OLYMPUS'&&q.mode==='search'&&q.query==='runtime'));
});
test('global search loader degrades sources independently',async()=>{
 const out=await loadGlobalSearchSources('runtime',api('learning'));
 assert.ok(out.science);
 assert.ok(out.olympus);
 assert.equal(out.learning,null);
 assert.ok(out.ops);
 assert.ok(Array.isArray(out.runs));
 assert.ok(out.audit);
});

test('blank query performs no remote reads',async()=>{
 let called=0;const a=api();
 for(const key of Object.keys(a)){const original=a[key];a[key]=async(...args)=>{called++;return original(...args)}}
 const out=await loadGlobalSearchSources(' ',a);
 assert.equal(called,0);
 assert.equal(out.science,null);
});
