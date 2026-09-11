import test from 'node:test';
import assert from 'node:assert/strict';
import { loadUniversesSources } from '../src/data/load-universes.ts';

test('universe loader discovers declared universes from root and degrades details independently',async()=>{
 const calls=[];
 const api={graph:async q=>{
  calls.push(q.focus);
  if(q.focus==='system:NEXO')return {nodes:[
   {id:'system:NEXO',type:'SYSTEM'},
   {id:'system:SCIENCE',type:'SYSTEM'},
   {id:'system:ENGINEERING',type:'SYSTEM'},
   {id:'system:OLYMPUS',type:'SYSTEM'},
   {id:'system:LEARNING',type:'SYSTEM'}],edges:[
   {source:'system:NEXO',target:'system:SCIENCE',type:'CONTAINS'},
   {source:'system:NEXO',target:'system:ENGINEERING',type:'CONTAINS'},
   {source:'system:NEXO',target:'system:OLYMPUS',type:'CONTAINS'},
   {source:'system:NEXO',target:'system:LEARNING',type:'CONTAINS'}]};
  if(q.focus==='system:ENGINEERING')throw Error('down');
  return {nodes:[{id:q.focus,type:'SYSTEM'}],edges:[]};
 }}; const out=await loadUniversesSources(api);
 assert.ok(out.root);
 assert.ok(out.details.science);
 assert.equal(out.details.engineering,null);
 assert.ok(out.details.olympus);
 assert.deepEqual(calls,['system:NEXO','system:SCIENCE','system:ENGINEERING','system:OLYMPUS']);
});

test('root failure makes universe discovery unavailable without speculative reads',async()=>{
 let calls=0;
 const api={graph:async()=>{calls++;throw Error('root down')}};
 const out=await loadUniversesSources(api);
 assert.equal(out.root,null);
 assert.deepEqual(out.details,{});
 assert.equal(calls,1);
});