import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogDigest,preparePublicCatalog,publishPublicCatalog,readPrivateCatalog,readPublicCatalog,EMPTY_PUBLIC_CATALOG} from '../server/atlas/public-catalog.mjs';

const P='entities/test/SCI-001.json',A='runtime/artifacts/ART-1.json',R='runtime/results/RES-1.json',V='events/REV-1.json';
const bilingual=s=>({'pt-BR':s+' PT',en:s+' EN'});
function tower(){
 const record={id:'SCI-001',kind:'TEST',domain:'SCIENCE',status:'DONE',review_state:'CONFIRMED',roadmap_id:'RM-SCI-1',result_summary:'Synthetic positive/negative test result',execution:{run_id:'RUN-1'}};
 return {contract:'NEXO_TOWER_LIVE_V1',authority:'TOWER_V06',storage:'GOOGLE_DRIVE_PRIVATE',revision:'sha256:'+'a'.repeat(64),state_fingerprint:'sha256:'+'a'.repeat(64),files:{
  [P]:{encoding:'json',value:record},
  [A]:{encoding:'json',value:{id:'ART-1',test_id:'SCI-001',run_id:'RUN-1',digest:'b'.repeat(64),validation_status:'PASS'}},
  [R]:{encoding:'json',value:{id:'RES-1',test_id:'SCI-001',run_id:'RUN-1',artifact_ref:'ART-1'}},
  [V]:{encoding:'json',value:{test_id:'SCI-001',run_id:'RUN-1',role:'REFEREE_1',verdict:'CONFIRMED',producer:'EXECUTOR',reviewer:'REFEREE_1'}},
  'roadmaps/RM-SCI-1.json':{encoding:'json',value:{roadmap_id:'RM-SCI-1',status:'ACTIVE'}}
 }};
}
function packet(t,extra={}){
 const row=t.files[P].value;
 const publicCard={id:'public-test-1',campaign:'cosmology',finding:'scientific-question-1',question:bilingual('Question'),answers:bilingual('Scope'),method:bilingual('Method'),result:bilingual('Result'),limits:bilingual('Limits'),...(extra.public||{})};
 return {contract:'NEXO_PUBLIC_CATALOG_PROPOSAL_V1',sourceRevision:t.revision,approvalId:'APPROVAL-SYNTHETIC-001',expectedHead:null,cards:[{source:{testId:'SCI-001',sourceDigest:catalogDigest(row),artifactPath:A,resultPath:R,reviewPath:V},public:publicCard,claimRefs:Object.fromEntries(['question','answers','method','result','limits'].map(field=>[field,[P]]))}],...extra};
}
function memory(){
 const map=new Map();let fault=false;
 const run=async(cmd,...args)=>{
  if(cmd==='GET')return map.get(args[0])??null;
  if(cmd==='EVAL'){
   if(fault)throw Error('simulated-outage');
   const [script,count,head,key,expected,next,payload]=args;
   assert.equal(count,2);assert.ok(script.includes("redis.call('SET'"));
   if((map.get(head)||'')!==expected)return 'CONFLICT';
   if(map.get(head)===next)return 'UNCHANGED';
   map.set(key,payload);map.set(head,next);return 'PUBLISHED';
  }
  throw Error('UNKNOWN_TEST_REDIS_COMMAND:'+cmd);
 };
 run.failWrites=v=>{fault=v;};return run;
}
test('synthetic publication is versioned, read back, idempotent, and private references never escape',async()=>{
 const store=memory(),source=tower(),request=packet(source);
 assert.deepEqual(await readPublicCatalog(store),EMPTY_PUBLIC_CATALOG);
 const first=await publishPublicCatalog(store,source,request);
 assert.equal(first.status,'PUBLISHED');assert.deepEqual(first.counts,{published:1,updated:0,withdrawn:0});
 const out=await readPublicCatalog(store);assert.equal(out.tests.length,1);assert.equal(out.tests[0].limits.en,'Limits EN');
 for(const secret of ['SCI-001','RM-SCI-1','ART-1','REV-1','RUN-1','sourceRevision','approvalId','provenance','claimRefs'])assert.equal(JSON.stringify(out).includes(secret),false,secret);
 assert.equal((await publishPublicCatalog(store,source,{...request,expectedHead:first.revision})).status,'UNCHANGED');
});
test('corrected source updates the same public finding; obsolete revision cannot overwrite; withdrawal removes it',async()=>{
 const store=memory(),t=tower();const first=await publishPublicCatalog(store,t,packet(t));
 const updated=tower();updated.revision=updated.state_fingerprint='sha256:'+'c'.repeat(64);updated.files[P].value.result_summary='Corrected public outcome';
 const second=await publishPublicCatalog(store,updated,packet(updated,{expectedHead:first.revision,public:{result:bilingual('Corrected result')}}));
 assert.deepEqual(second.counts,{published:0,updated:1,withdrawn:0});
 assert.equal((await readPublicCatalog(store)).tests[0].result.en,'Corrected result EN');
 await assert.rejects(publishPublicCatalog(store,updated,packet(updated,{expectedHead:first.revision})),/PUBLIC_CATALOG_STALE_HEAD/);
 const withdrawn=await publishPublicCatalog(store,updated,{contract:'NEXO_PUBLIC_CATALOG_PROPOSAL_V1',sourceRevision:updated.revision,approvalId:'APPROVAL-SYNTHETIC-002',expectedHead:second.revision,cards:[]});
 assert.deepEqual(withdrawn.counts,{published:0,updated:0,withdrawn:1});
 assert.deepEqual((await readPublicCatalog(store)).tests,[]);
});
test('synthetic private/Olympus/PEER content, unreviewed claims, missing artifact and forged evidence fail closed',()=>{
 const good=tower();const attempts=[
  t=>{t.files[P].value.review_state='PENDING_REVIEW';},
  t=>{t.files[P].value.domain='OLYMPUS';},
  t=>{t.files[P].value.result_summary='Não executado nesta rodada';},
  t=>{delete t.files[A];},
  t=>{t.files[A].value.test_id='UNRELATED';},
  t=>{t.files[V].value.producer='REFEREE_1';},
  t=>{t.files['roadmaps/RM-SCI-1.json'].value.status='PROPOSED';}
 ];
 for(const mutate of attempts){const t=tower();mutate(t);assert.throws(()=>preparePublicCatalog(t,packet(t)));}
 for(const forbidden of [bilingual('PEER detection'),bilingual('Olympus client'),bilingual('private data')])assert.throws(()=>preparePublicCatalog(good,packet(good,{public:{result:forbidden}})),/PUBLIC_CONTENT_INVALID/);
 const request=packet(good);request.cards[0].claimRefs.result=['events/PRIVATE-FAKE.json'];assert.throws(()=>preparePublicCatalog(good,request),/CLAIM_PROVENANCE_INCOMPLETE/);
});
test('failed publish keeps old version and no duplicated rerun or changed public identity is accepted',async()=>{
 const store=memory(),t=tower(),first=await publishPublicCatalog(store,t,packet(t));
 store.failWrites(true);
 await assert.rejects(publishPublicCatalog(store,t,packet(t,{expectedHead:first.revision,public:{result:bilingual('Alternative result')}})),/simulated-outage/);
 assert.equal((await readPublicCatalog(store)).tests[0].result.en,'Result EN');
 store.failWrites(false);
 await assert.rejects(publishPublicCatalog(store,t,packet(t,{expectedHead:first.revision,public:{id:'public-test-2'}})),/PUBLIC_FINDING_ID_CHANGED/);
 const dup=packet(t);dup.cards.push({...structuredClone(dup.cards[0]),public:{...dup.cards[0].public,id:'public-duplicated'}});
 assert.throws(()=>preparePublicCatalog(t,dup),/PUBLIC_DUPLICATE_FINDING/);
 assert.equal((await readPrivateCatalog(store)).provenance.length,1);
});
