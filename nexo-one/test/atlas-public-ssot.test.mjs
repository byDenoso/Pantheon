import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPublicAtlasSsot} from '../server/compiler/atlas-public-ssot.mjs';

const source={
 sourceFileId:'sheet',sourceModifiedAt:'2026-09-12T03:00:00Z',generatedAt:'2026-09-12T03:01:00Z',
 sections:{
  THREADS:[{thread_id:'secret-thread'}],WORK:[{work_id:'secret-work',question:'private'}],KNOWLEDGE:[{knowledge_id:'secret'}],DECISIONS:[{decision_id:'secret'}],
  SYSTEM:[{system_id:'safe',key:'AUTOMATION_ROLES',value:'DAILY|EXECUTOR',status:'ACTIVE',updated_at:'2026-09-12T03:00:00Z',source:'secret-ref'},{system_id:'unsafe',key:'PRIVATE_KEY',value:'must-not-leak',status:'ACTIVE'}],
  EVENTS:[{event_id:'raw-secret-id',timestamp:'2026-09-12T03:05:00Z',event_type:'EXECUTION_RUN',summary:'private science detail',result:'PASS | VERIFIED',source_role:'EXECUTOR',target_role:'LEARNER',correlation_id:'secret-correlation'}]
 },
 projections:{Science:[{record_type:'CAMPAIGN',record_id:'D1-C1',domain:'D1',title:'Public campaign',summary:'Structural summary',status:'ACTIVE',source_ref:'private-ref'}],Engineering:[{record_type:'PROGRAM',record_id:'ENG',title:'Engineering',status:'ACTIVE',payload_json:'secret'}],Olympus:[{record_type:'PROGRAM',record_id:'PERSONAL',title:'private'}],StructuralLearning:[{record_id:'secret'}],CrossDomain:[{record_id:'secret'}],Integrity:[{record_id:'secret'}]}
};

test('public Atlas snapshot keeps only privacy-safe structural and operational fields',()=>{
 const out=buildPublicAtlasSsot(source);
 assert.equal(out.access,'PUBLIC_SANITIZED');
 assert.equal(out.privacyGate,'OLYMPUS_EXCLUDED');
 assert.deepEqual(out.sections.THREADS,[]);
 assert.deepEqual(out.sections.WORK,[]);
 assert.deepEqual(out.sections.KNOWLEDGE,[]);
 assert.deepEqual(out.sections.DECISIONS,[]);
 assert.deepEqual(out.projections.Olympus,[]);
 assert.equal(out.sections.SYSTEM.length,1);
 assert.equal('source' in out.sections.SYSTEM[0],false);
 assert.equal(out.sections.EVENTS.length,1);
 assert.notEqual(out.sections.EVENTS[0].event_id,'raw-secret-id');
 assert.ok(!JSON.stringify(out).includes('private science detail'));
 assert.ok(!JSON.stringify(out).includes('secret-correlation'));
 assert.ok(!JSON.stringify(out).includes('must-not-leak'));
 assert.ok(out.fingerprint.startsWith('sha256:'));
});
