import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAtlasSsotSnapshot} from '../server/compiler/atlas-ssot.mjs';

const rows=(header,...body)=>[header,...body];

const tables={
 THREADS:rows(['thread_id','domain','title','objective','current_question','priority','status','updated_at'],['THR::SCIENCE::ROOT','SCIENCE','Scientific research','Advance science','Which test?','CRITICAL','ACTIVE','2026-09-11T10:00:00-03:00']),
 WORK:rows(['work_id','thread_id','kind','question','status','priority','authority','result_ref','next_step','updated_at','domain','verification_status'],['WORK::SCI::1','THR::SCIENCE::ROOT','TEST','Run discriminator','DONE','HIGH','PEER','Drive:result','Close','2026-09-11T11:00:00-03:00','SCIENCE','VERIFIED']),
 EVENTS:rows(['event_id','event_type','domain','summary','status','source_role','target_role','correlation_id','created_at'],['EVT::1','HANDOFF_RESULT','SCIENCE','Verified result','DONE','EXECUTOR','LEARNER','CORR::1','2026-09-11T11:05:00-03:00']),
 KNOWLEDGE:rows(['knowledge_id','domain','type','statement','context','support','contradiction','confidence','evidence_refs','related_ids','status','updated_at'],['KNOW::SCI::1','SCIENCE','PROCEDURAL','Use matched nulls','method','2','0','0.9','Drive:result','WORK::SCI::1','ACTIVE','2026-09-11T11:10:00-03:00']),
 DECISIONS:rows(['decision_id','thread_id','question','options','advisor_recommendation','evidence_refs','impact','deadline','status','director_decision'],['DEC::1','THR::SCIENCE::ROOT','Proceed?','A|B','A','Drive:result','HIGH','immediate','RESOLVED','A']),
 SYSTEM:rows(['system_id','key','value','status','updated_at','source'],['SYS::SSOT','SSOT_ID','sheet-1','ACTIVE','2026-09-11T11:15:00-03:00','Google Drive'],['SYS::NEON','NEON','RETIRED_RUNTIME','RETIRED','2026-09-11T11:15:00-03:00','Director'])
};
const projectionTables={
 Science:rows(['record_type','record_id','status','title','summary','current_revision_id','domain','source_ref'],['campaign','CAMP-1','ACTIVE','Campaign','Question','REV-1','D1','Drive:science']),
 Engineering:rows(['record_type','record_id','status','title','parent_id','summary','source_ref'],['domain','ENG-DOM','ACTIVE','Engineering','','Code projection','GitHub']),
 Olympus:rows(['record_type','record_id','status','title','detail','payload_json','source','updated_at'],['domain','OLY-DOM','ACTIVE','Olympus','Health projection','{}','SSOT','2026-09-11']),
 StructuralLearning:rows(['learning_id','status','title','source_domains','structural_pattern','transfer_rule','support_count','contradict_count','confidence','provenance'],['SL-1','SUPPORTED','Null model','SCIENCE|ENGINEERING','Compare nulls','Use rival nulls','2','0','0.8','Drive']),
 CrossDomain:rows(['cross_id','domains','hypothesis','mechanism','status','provenance'],['CD-1','SCIENCE|OLYMPUS','Transfer null audit','Mechanism','SUPPORTED','Drive']),
 Integrity:rows(['integrity_id','scope','type','target','status','severity'],['INT-1','NEXO','readback','SSOT','PASS','HIGH'])
};

test('Atlas SSOT snapshot preserves six canonical sections and stable ids',()=>{
 const snap=buildAtlasSsotSnapshot({tables,sourceFileId:'sheet-1',sourceModifiedAt:'2026-09-11T14:15:00Z'});
 assert.equal(snap.contract,'NEXO_ATLAS_SSOT_V1');
 assert.equal(snap.authority,'GOOGLE_DRIVE');
 assert.equal(snap.projectionOnly,true);
 assert.deepEqual(Object.keys(snap.sections),['THREADS','WORK','EVENTS','KNOWLEDGE','DECISIONS','SYSTEM']);
 assert.equal(snap.sections.WORK[0].work_id,'WORK::SCI::1');
 assert.equal(snap.sections.KNOWLEDGE[0].knowledge_id,'KNOW::SCI::1');
 assert.equal(snap.sections.SYSTEM[1].value,'RETIRED_RUNTIME');
 assert.match(snap.fingerprint,/^sha256:[a-f0-9]{64}$/);
});

test('derived projection tabs are transported separately and never become authority',()=>{
 const snap=buildAtlasSsotSnapshot({tables,projectionTables,sourceFileId:'sheet-1'});
 assert.equal(snap.projections.Science[0].record_id,'CAMP-1');
 assert.equal(snap.projections.StructuralLearning[0].learning_id,'SL-1');
 assert.equal(snap.projections.CrossDomain[0].cross_id,'CD-1');
 assert.equal(snap.projectionAuthority,'DERIVED_FROM_SSOT');
 assert.deepEqual(Object.keys(snap.sections),['THREADS','WORK','EVENTS','KNOWLEDGE','DECISIONS','SYSTEM']);
});

test('fingerprint is semantic: retrieval time does not change it, row content does',()=>{
 const a=buildAtlasSsotSnapshot({tables,projectionTables,sourceFileId:'sheet-1',sourceModifiedAt:'2026-09-11T14:15:00Z',generatedAt:'2026-09-11T14:16:00Z'});
 const b=buildAtlasSsotSnapshot({tables,projectionTables,sourceFileId:'sheet-1',sourceModifiedAt:'2026-09-11T14:15:00Z',generatedAt:'2026-09-11T14:17:00Z'});
 assert.equal(a.fingerprint,b.fingerprint);
 const changed=structuredClone(tables);changed.WORK[1][4]='BLOCKED';
 const c=buildAtlasSsotSnapshot({tables:changed,projectionTables,sourceFileId:'sheet-1',sourceModifiedAt:'2026-09-11T14:18:00Z'});
 assert.notEqual(a.fingerprint,c.fingerprint);
});

test('malformed or missing canonical tabs fail closed',()=>{
 assert.throws(()=>buildAtlasSsotSnapshot({tables:{...tables,WORK:[]},sourceFileId:'sheet-1'}),/INVALID_CANONICAL_TAB:WORK/);
 assert.throws(()=>buildAtlasSsotSnapshot({tables:{...tables,KNOWLEDGE:[['wrong_header']]},sourceFileId:'sheet-1'}),/INVALID_CANONICAL_TAB:KNOWLEDGE/);
});
