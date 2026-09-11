import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProvenanceSources } from '../src/data/load-provenance.ts';

test('provenance loader always loads audit and loads lineage only for a requested entity',async()=>{
 const calls=[];const api={audit:async()=>{calls.push('audit');return{total:1}},lineage:async id=>{calls.push(`lineage:${id}`);return{focus:id,nodes:[],edges:[]}}};
 const noFocus=await loadProvenanceSources(api,'');
 assert.equal(noFocus.audit.total,1);assert.equal(noFocus.lineage,null);
 const focused=await loadProvenanceSources(api,'T1');
 assert.equal(focused.lineage.focus,'T1');
 assert.deepEqual(calls,['audit','audit','lineage:T1']);
});

test('audit and lineage failures degrade independently',async()=>{
 const api={audit:async()=>{throw Error('offline')},lineage:async()=>({focus:'T1',nodes:[],edges:[]})};
 const got=await loadProvenanceSources(api,'T1');
 assert.equal(got.audit,null);assert.equal(got.lineage.focus,'T1');
});