import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningMeshModel } from '../src/data/learning-vnext-model.ts';

const report={source:'v1',total:4,crossDomain:1,emergent:[{id:'promoted',count:1}],ladder:[
 {id:'OBSERVATION',count:1,items:[{id:'observation:o1',stage:'OBSERVATION',relationType:'runtime observation',status:'SUPPORTED',domainA:'NEXO_RUNTIME'}]},
 {id:'PATTERN',count:2,items:[
  {id:'pattern:p1',stage:'PATTERN',relationType:'Pointer-first',status:'VALIDATED',domainA:'ENGINEERING',confidence:null,evidenceCount:4},
  {id:'pattern:p2',stage:'PATTERN',relationType:'Transfer method',status:'PROVISIONAL',domainA:'CROSS_DOMAIN',evidenceRefs:JSON.stringify({domain_a:'ENGINEERING',domain_b:'SCIENCE',relation_scope:'CROSS_DOMAIN',relation_type:'TRANSFERABLE_METHOD',confidence_raw:'0.94',support_count:3})}
 ]},
 {id:'LESSON',count:1,items:[{id:'lesson:l1',stage:'LESSON',relationType:'Reuse pointer',status:'ACTIVE',domainA:'SCIENCE',derivedFrom:['pattern:p1']}]},
 {id:'STRATEGY',count:0,items:[]},{id:'POLICY',count:0,items:[]}
]};

test('learning mesh has context anchors and no canonical Learning hub',()=>{
 const model=buildLearningMeshModel(report);
 assert.equal(model.available,true);
 assert.ok(model.contexts.some(x=>x.id==='engineering'));
 assert.ok(model.contexts.some(x=>x.id==='science'));
 assert.ok(model.contexts.some(x=>x.id==='operation'));
 assert.equal(model.nodes.some(x=>x.id==='system:LEARNING'||x.id==='context:learning'),false);
});
test('only explicit cross-domain declarations become transfer filaments',()=>{
 const model=buildLearningMeshModel(report);
 const transfers=model.filaments.filter(x=>x.type==='transfer');
 assert.equal(transfers.length,1);
 assert.equal(transfers[0].source,'context:engineering');
 assert.equal(transfers[0].target,'context:science');
 assert.equal(transfers[0].confidence,0.94);
 assert.equal(transfers[0].support,3);
});

test('lineage is drawn only when both declared records resolve in the mesh',()=>{
 const model=buildLearningMeshModel(report);
 assert.ok(model.filaments.some(x=>x.type==='lineage'&&x.source==='pattern:p1'&&x.target==='lesson:l1'));
 const broken=structuredClone(report);
 broken.ladder[2].items[0].derivedFrom=['pattern:missing'];
 const brokenModel=buildLearningMeshModel(broken);
 assert.equal(brokenModel.filaments.some(x=>x.type==='lineage'),false);
});
test('learning metrics use published values and never invent confidence',()=>{
 const model=buildLearningMeshModel(report);
 assert.equal(model.metrics.total,4);
 assert.equal(model.metrics.promoted,1);
 assert.equal(model.metrics.crossDomain,1);
 const p1=model.items.find(x=>x.id==='pattern:p1');
 assert.equal(p1.confidence,null);
});

test('missing report produces an unavailable empty mesh',()=>{
 const model=buildLearningMeshModel(null);
 assert.equal(model.available,false);
 assert.deepEqual(model.contexts,[]);
 assert.deepEqual(model.nodes,[]);
 assert.deepEqual(model.filaments,[]);
});
