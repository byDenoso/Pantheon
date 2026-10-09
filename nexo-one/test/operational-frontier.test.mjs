import test from 'node:test';
import assert from 'node:assert/strict';
import {projectOperations} from '../server/atlas/operational-frontier.mjs';
const revision='sha256:'+'a'.repeat(64);
const tower = () => ({contract:'NEXO_TOWER_LIVE_V1',authority:'TOWER_V06',storage:'GOOGLE_DRIVE_PRIVATE',
  truth_owner:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',stable_file_id:'1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z',
  revision,state_fingerprint:revision,files:{}});
const put=(t,p,v)=>(t.files[p]={encoding:'json',value:v});
test('canonical WORK discovery does not depend on a truncated bootstrap or compatibility queue',()=>{
  const t=tower();for(let i=0;i<7;i++)put(t,`entities/work/W${i}.json`,{id:`W${i}`,status:'READY',capability_id:'fixture',owner_role:'EXECUTOR'});
  put(t,'queues/executor.json',{items:[],compatibility:'SUPERSEDED_BY_BOOTSTRAP_ROLE_VIEW'});
  put(t,'bootstrap/executor.json',{queue:[]});
  const result=projectOperations(t,{limit:5});assert.equal(result.total_count,7);assert.equal(result.items.length,5);assert.equal(result.has_more,true);
  assert.ok(result.items.every(r=>r.dispatch_authorized===false));
  assert.equal(projectOperations(t,{limit:5,cursor:result.next_cursor}).items.length,2);
});
test('closed campaigns cannot become preparation or execution candidates',()=>{
  const t=tower();put(t,'roadmaps/R.json',{roadmap_id:'R',status:'CLOSED'});
  put(t,'entities/test/T.json',{id:'T',roadmap_id:'R',status:'BLOCKED_INPUT',recipe:'fixture',recipe_params:{},readiness:{policy:'SCIENTIFIC_INTEGRITY_V1',eligible:true}});
  assert.equal(projectOperations(t).items[0].lane,'CLOSED_CAMPAIGN');
});
test('recorded admission remains a candidate, never a dispatch grant',()=>{
  const t=tower();put(t,'entities/test/T.json',{id:'T',status:'READY',recipe:'fixture',recipe_params:{},readiness:{policy:'SCIENTIFIC_INTEGRITY_V1',eligible:true}});
  const row=projectOperations(t).items[0];assert.equal(row.lane,'ADMISSION_CANDIDATE');assert.equal(row.dispatch_authorized,false);
});
test('DONE is not independent scientific review',()=>{
  const t=tower();put(t,'entities/test/T.json',{id:'T',status:'DONE'});put(t,'entities/work/W.json',{id:'W',status:'DONE'});
  const rows=projectOperations(t).items;assert.equal(rows[0].lane,'REVIEW');assert.equal(rows[1].lane,'TERMINAL');
});
test('technical blockers do not generate invented human approvals',()=>{
  const t=tower();put(t,'entities/test/T.json',{id:'T',status:'BLOCKED_INPUT',readiness:{policy:'SCIENTIFIC_INTEGRITY_V1',eligible:false,reasons:['RECIPE_BINDING_MISSING']}});
  assert.equal(projectOperations(t).items[0].lane,'REPAIR');
});
test('checkpoints route to runner reconciliation, not fresh dispatch',()=>{
  const t=tower();put(t,'entities/work/W.json',{id:'W',status:'CHECKPOINTED'});
  assert.equal(projectOperations(t).items[0].lane,'RUN_FOLLOWUP');
});
test('cursor binds the revision, view and owner',()=>{
  const t=tower();for(let i=0;i<2;i++)put(t,`entities/work/W${i}.json`,{id:`W${i}`,owner_role:'EXECUTOR'});
  const first=projectOperations(t,{limit:1});
  const changed={...t,revision:'sha256:'+'b'.repeat(64),state_fingerprint:'sha256:'+'b'.repeat(64)};
  assert.throws(()=>projectOperations(changed,{cursor:first.next_cursor}),/STALE/);
  assert.throws(()=>projectOperations(t,{view:'receipts',cursor:first.next_cursor}),/INVALID/);
  assert.throws(()=>projectOperations(t,{owner:'EXECUTOR',cursor:first.next_cursor}),/INVALID/);
});
test('historical retries do not inflate the current operation backlog',()=>{
  const t=tower();put(t,'operations/receipts/a.json',{intent_id:'op',outcome:'DEFERRED_DEPENDENCY',occurred_at:'2026-10-01T00:00:00Z'});
  put(t,'operations/receipts/b.json',{intent_id:'op',outcome:'APPLIED',occurred_at:'2026-10-02T00:00:00Z'});
  const result=projectOperations(t,{view:'receipts'});assert.equal(result.total_count,1);assert.equal(result.items[0].outcome,'APPLIED');
});
test('conflicting same-time receipts stay visible',()=>{
  const t=tower();for(const outcome of ['APPLIED','REJECTED_TERMINAL'])put(t,`operations/receipts/${outcome}.json`,{intent_id:'op',outcome,occurred_at:'same'});
  assert.equal(projectOperations(t,{view:'receipts'}).items[0].outcome,'CONFLICT_REQUIRES_RECONCILIATION');
});
test('projection is non-mutating, bounded and private',()=>{
  const t=tower();put(t,'roadmaps/R.json',{roadmap_id:'R',status:'PROPOSED',question:'x'.repeat(5000),stop_conditions:{private:'raw-object'}});
  const before=JSON.stringify(t),r=projectOperations(t,{view:'campaigns'});
  assert.equal(JSON.stringify(t),before);assert.equal(r.access,'PRIVATE');assert.equal(r.items[0].question.length,600);assert.equal(r.items[0].stop_criteria,'STRUCTURED_CRITERION_SEE_SOURCE');
  assert.throws(()=>projectOperations(t,{limit:101}),/INVALID/);assert.throws(()=>projectOperations({...t,storage:'PUBLIC'}),/INVALID/);
});
