import test from 'node:test';import assert from 'node:assert/strict';
import {auditReport,scientificDomains,AUDIT_CATEGORIES} from '../lib/audit.mjs';

const graph={
 nodes:[
  {id:'domain:UNMAPPED',type:'DOMAIN',domain:'UNMAPPED',label:'UNMAPPED'},
  {id:'test:T1',type:'TEST',domain:'UNMAPPED',label:'T1'},
  {id:'test:T2',type:'TEST',domain:'D1',label:'T2'},
  {id:'result:E1',type:'RESULT',label:'E1'},
  {id:'result:E2',type:'RESULT',label:'E2'},
  {id:'automation:NEXO Guardian',type:'AUTOMATION',status:'LEGACY',label:'NEXO Guardian'},
  {id:'domain:D1',type:'DOMAIN',label:'D1'},{id:'domain:D2',type:'DOMAIN',label:'D2'}
 ],
 edges:[
  {source:'test:T2',target:'result:E1',type:'PRODUCES'},
  {source:'domain:D1',target:'test:T2',type:'CONTAINS'},
  {source:'domain:D2',target:'test:T2',type:'CONTAINS'}
 ],
 issues:[{id:'test:T9:PRODUCES:result:E9',reason:'UNRESOLVED_ENDPOINT',source:'test:T9',target:'result:E9',missing:'test:T9'}]
};
const pick=(r,id)=>r.categories.find(c=>c.id===id);

test('every declared category is reported, including the empty ones',()=>{
 const r=auditReport(graph);
 assert.deepEqual(r.categories.map(c=>c.id),AUDIT_CATEGORIES.map(c=>c.id));
 assert.equal(pick(r,'OTHER').count,0);
 assert.deepEqual(pick(r,'OTHER').items,[]);
});

test('migration issues are counted from observed facts only',()=>{
 const r=auditReport(graph);
 assert.equal(pick(r,'BROKEN_REFERENCE').count,1);
 assert.equal(pick(r,'BROKEN_REFERENCE').items[0].missing,'test:T9');
 assert.equal(pick(r,'UNRESOLVED_OWNER').count,1);              // E2 has no PRODUCES edge
 assert.equal(pick(r,'UNRESOLVED_OWNER').items[0].id,'result:E2');
 assert.equal(pick(r,'AMBIGUOUS_MAPPING').count,1);             // T2 sits under D1 and D2
 assert.deepEqual(pick(r,'AMBIGUOUS_MAPPING').items[0].domains,['domain:D1','domain:D2']);
 assert.equal(pick(r,'LEGACY_ALIAS').count,1);
 assert.equal(r.total,pick(r,'BROKEN_REFERENCE').count+pick(r,'UNRESOLVED_DOMAIN').count+pick(r,'UNRESOLVED_OWNER').count+pick(r,'AMBIGUOUS_MAPPING').count+pick(r,'LEGACY_ALIAS').count+pick(r,'OTHER').count);
});

test('unresolved mapping is an audit issue and never a domain node',()=>{
 const r=auditReport(graph);
 const unresolved=pick(r,'UNRESOLVED_DOMAIN');
 assert.equal(unresolved.count,1);                              // the DOMAIN placeholder itself is excluded
 assert.equal(unresolved.items[0].id,'test:T1');
 assert.ok(!unresolved.items.some(i=>i.type==='DOMAIN'));
});

test('scientific domain buckets drop the unresolved bucket',()=>{
 assert.deepEqual(scientificDomains({D1:5,UNMAPPED:1242,D2:3}),{D1:5,D2:3});
 assert.deepEqual(scientificDomains(),{});
});

test('samples are bounded while counts stay complete',()=>{
 const many={nodes:Array.from({length:40},(_,i)=>({id:'result:R'+i,type:'RESULT',label:'R'+i})),edges:[],issues:[]};
 const r=auditReport(many,{sample:5});
 assert.equal(pick(r,'UNRESOLVED_OWNER').count,40);
 assert.equal(pick(r,'UNRESOLVED_OWNER').items.length,5);
});
