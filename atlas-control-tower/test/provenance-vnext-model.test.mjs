import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuditModel, buildLineageModel } from '../src/data/provenance-vnext-model.ts';

const audit={source:'v1',total:92,open:0,resolved:92,categories:[
 {id:'BROKEN_REFERENCE',label:'BROKEN REFERENCE',severity:'INFO',count:44,openCount:0,items:[{id:'i1',label:'row 1',status:'RESOLVED',open:false,severity:'WARN',detail:'fixed',resolution:'registered'}]},
 {id:'RESULT_SUBJECT',label:'RESULT SUBJECT',severity:'INFO',count:45,openCount:0,items:[]}
]};
const lineage={source:'v1',freshness:'LIVE',focus:'T1',nodes:[
 {id:'D3',type:'DOMAIN',label:'Dark Energy'},
 {id:'H1',type:'CLAIM',label:'Claim'},
 {id:'T1',type:'TEST',label:'Test',status:'COMPLETE',sourceRefs:[{source:'GOOGLE_SHEETS',sourceRef:"'Tests'!A2:P2",url:'https://docs.google.com/x'}]},
 {id:'R1',type:'RESULT',label:'Result'}
],edges:[{source:'D3',target:'T1',type:'CONTAINS'},{source:'H1',target:'T1',type:'TESTS'},{source:'T1',target:'R1',type:'PRODUCES'}]};
test('audit model exposes only published counts and issue categories',()=>{
 const model=buildAuditModel(audit);
 assert.equal(model.available,true);
 assert.deepEqual(model.metrics,{total:92,open:0,resolved:92});
 assert.equal(model.categories[0].id,'BROKEN_REFERENCE');
 assert.equal(model.categories[0].count,44);
 assert.doesNotMatch(JSON.stringify(model),/neon|oidc/i);
});

test('lineage model preserves declared nodes, relations and source refs',()=>{
 const model=buildLineageModel(lineage,'T1');
 assert.equal(model.available,true);
 assert.equal(model.focusId,'T1');
 assert.equal(model.nodes.length,4);
 assert.equal(model.edges.length,3);
 assert.equal(model.nodes.find(x=>x.id==='T1').sourceRefs[0].sourceRef,"'Tests'!A2:P2");
});

test('invalid lineage endpoints are dropped rather than invented',()=>{
 const broken=structuredClone(lineage);broken.edges.push({source:'T1',target:'MISSING',type:'PRODUCES'});
 const model=buildLineageModel(broken,'T1');
 assert.equal(model.edges.length,3);
});

test('missing provenance sources stay explicitly unavailable',()=>{
 assert.equal(buildAuditModel(null).available,false);
 assert.equal(buildLineageModel(null,'T1').available,false);
});