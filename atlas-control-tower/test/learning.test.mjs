import test from 'node:test';import assert from 'node:assert/strict';
import {stageOf,relationView,emergentLearning,learningLadder,learningForEntity,unresolvedEvidence,learningReport,LEARNING_STAGES} from '../lib/learning.mjs';

const rel=(id,over={})=>({id,type:'LEARNING_RELATION',label:over.relation_type||'DEPENDENCY',status:over.status??'PROVISIONAL',confidence:over.confidence,
 summary:over.notes||'',metadata:{node_a:'SCI::A',node_b:'ENG::B',domain_a:'SCIENCE',domain_b:'ENGINEERING',
  support_count:over.support??2,contradiction_count:over.contradiction??0,successful_uses:over.successes??0,failed_uses:over.failures??0,
  relation_scope:'CROSS_DOMAIN',evidence_refs:over.evidence??'',relation_type:over.relation_type||'DEPENDENCY',...over.metadata}});

test('stage comes from the declared field, then from the record status',()=>{
 assert.equal(stageOf({type:'LEARNING_RELATION',status:'OBSERVED'}),'OBSERVATION');
 assert.equal(stageOf({type:'LEARNING_RELATION',status:'VALIDATED'}),'PATTERN');
 assert.equal(stageOf({type:'LEARNING_LESSON',subtype:'LESSON'}),'LESSON');
 assert.equal(stageOf({type:'TEST'}),null);
});

test('stages without a source are reported as pending, never filled in',()=>{
 const ladder=learningLadder([rel('learning:1'),rel('learning:2',{status:'OBSERVED'})]);
 assert.deepEqual(ladder.map(s=>s.id),LEARNING_STAGES.map(s=>s.id));
 const lesson=ladder.find(s=>s.id==='LESSON');
 assert.equal(lesson.available,false);
 assert.equal(lesson.count,0);
 assert.equal(lesson.source,'learning_v1.lessons');
 assert.equal(ladder.find(s=>s.id==='OBSERVATION').count,1);
 assert.equal(ladder.find(s=>s.id==='PATTERN').count,1);
});

test('emergent buckets are read from published counters, not synthesised',()=>{
 const buckets=emergentLearning([
  rel('a',{status:'HYPOTHESIS'}),
  rel('b',{status:'VALIDATED',support:5,contradiction:0}),
  rel('c',{status:'PROVISIONAL',support:1,contradiction:3}),
  rel('d',{status:'',support:0,contradiction:0}),
  rel('e',{relation_type:'CONTRADICTION',status:'VALIDATED'})
 ]);
 const at=id=>buckets.find(b=>b.id===id);
 assert.equal(at('new').count,1);
 assert.equal(at('promoted').count,2);
 assert.equal(at('weakening').count,1);
 assert.equal(at('contradicted').count,2);
 assert.equal(at('unresolved').count,1);
 assert.ok(buckets.every(b=>typeof b.basis==='string'&&b.basis.length));
});

test('confidence is surfaced only when the source published one',()=>{
 assert.equal(relationView(rel('a',{confidence:0.86})).confidence,0.86);
 assert.equal(relationView(rel('b')).confidence,null);
 assert.equal(relationView({id:'c',type:'LEARNING_RELATION',confidence:NaN,metadata:{}}).confidence,null);
});

test('entity overlay uses explicit evidence refs and invents no link',()=>{
 const g={nodes:[{id:'test:T-LIKE-V61-001',type:'TEST'},
  rel('learning:1',{evidence:'PEER/Test Registry:T-LIKE-V61-001;T-LIKE-V63-001'}),
  rel('learning:2',{evidence:'PEER/Test Registry:T-OTHER-9'})],edges:[]};
 assert.equal(learningForEntity(g,'test:T-LIKE-V61-001').length,1);
 assert.equal(learningForEntity(g,'test:T-NOT-CITED').length,0);
 assert.equal(learningForEntity(g,'').length,0);
});

test('evidence that resolves to nothing is reported, not dropped silently',()=>{
 const g={nodes:[{id:'test:T-A',type:'TEST'},rel('learning:1',{evidence:'X:T-A;T-MISSING'})],edges:[]};
 const missing=unresolvedEvidence(g);
 assert.equal(missing.length,1);
 assert.equal(missing[0].missing,'T-MISSING');
});

test('report keeps cross-domain and totals consistent',()=>{
 const g={nodes:[rel('learning:1'),rel('learning:2',{metadata:{domain_b:'SCIENCE'}})],edges:[]};
 const r=learningReport(g);
 assert.equal(r.total,2);
 assert.equal(r.crossDomain,1);
 assert.ok(Array.isArray(r.emergent)&&Array.isArray(r.ladder));
});
