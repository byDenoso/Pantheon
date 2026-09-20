import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDriveMutationToBundle} from '../lib/tower-drive-transaction.mjs';

function bundle(extra={}){
  return {
    contract:'NEXO_TOWER_BUNDLE_V1',
    authority:'TOWER_V06',
    source_fingerprint:'sha256:'+'a'.repeat(64),
    files:{
      'snapshot/latest.json':{encoding:'json',value:{counts:{active_work:1},event_cursor:'OLD'}},
      'indexes/active-work.json':{encoding:'json',value:{count:1,source:'GITHUB_TOWER_HOT_SET',work:[{id:'WORK-1',entity_version:1,status:'READY',owner_role:'EXECUTOR'}]}},
      'entities/work/WORK-1.json':{encoding:'json',value:{id:'WORK-1',entity_version:1,status:'READY',owner_role:'EXECUTOR'}},
      ...extra
    }
  };
}

test('Drive transaction applies entity-version CAS, event, receipt and readback metadata',()=>{
  const input=bundle();
  const request={request_id:'REQ-1',entity_kind:'work',entity_name:'WORK-1',expected_version:1,writer_role:'EXECUTOR',event_type:'WORK_STARTED',changes:{status:'RUNNING'}};
  const out=applyDriveMutationToBundle(input,request,{now:new Date('2026-09-20T20:30:00.123Z')});
  const entity=out.bundle.files['entities/work/WORK-1.json'].value;
  assert.equal(entity.entity_version,2);
  assert.equal(entity.status,'RUNNING');
  assert.equal(out.receipt.accepted,true);
  assert.equal(out.receipt.readback,'PASS');
  assert.equal(out.bundle.files['snapshot/latest.json'].value.event_cursor,out.receipt.event_id);
  assert.ok(out.changedPaths.some(path=>path.startsWith('events/2026-09-20/')));
  assert.equal(input.files['entities/work/WORK-1.json'].value.entity_version,1);
});

test('Drive transaction rejects stale expected version without mutating input',()=>{
  const input=bundle();
  const request={request_id:'REQ-STALE',entity_kind:'work',entity_name:'WORK-1',expected_version:0,writer_role:'EXECUTOR',event_type:'WORK_STARTED',changes:{status:'RUNNING'}};
  assert.throws(()=>applyDriveMutationToBundle(input,request),/WRITE_CONFLICT_RETRY_REQUIRED/);
  assert.equal(input.files['entities/work/WORK-1.json'].value.status,'READY');
});

test('Drive transaction is idempotent after canonical receipt exists',()=>{
  const receipt={request_id:'REQ-DONE',accepted:true,entity_version:2,readback:'PASS',event_id:'EVT-X'};
  const input=bundle({'mutations/receipts/REQ-DONE.json':{encoding:'json',value:receipt}});
  const request={request_id:'REQ-DONE',entity_kind:'work',entity_name:'WORK-1',expected_version:1,writer_role:'EXECUTOR',event_type:'WORK_STARTED',changes:{status:'RUNNING'}};
  const out=applyDriveMutationToBundle(input,request);
  assert.equal(out.idempotent,true);
  assert.deepEqual(out.receipt,receipt);
  assert.equal(out.bundle,input);
});

test('Drive transaction creates new TEST only at expected_version zero and protects identity',()=>{
  const input=bundle();
  const request={request_id:'REQ-TEST',entity_kind:'test',entity_name:'T-NEW',expected_version:0,writer_role:'EXECUTOR',event_type:'TEST_CREATED',changes:{id:'T-NEW',kind:'TEST',status:'READY'}};
  const out=applyDriveMutationToBundle(input,request,{now:new Date('2026-09-20T20:31:00Z')});
  assert.equal(out.bundle.files['entities/test/T-NEW.json'].value.entity_version,1);
  assert.equal(out.bundle.files['entities/test/T-NEW.json'].value.id,'T-NEW');
  assert.throws(()=>applyDriveMutationToBundle(input,{...request,request_id:'REQ-BAD',changes:{id:'T-OTHER'}}),/create identity must match/);
});

test('terminal WORK is removed from hot index in the same candidate transaction',()=>{
  const input=bundle();
  const request={request_id:'REQ-DONE-WORK',entity_kind:'work',entity_name:'WORK-1',expected_version:1,writer_role:'EXECUTOR',event_type:'WORK_DONE',changes:{status:'DONE'}};
  const out=applyDriveMutationToBundle(input,request);
  assert.equal(out.bundle.files['indexes/active-work.json'].value.count,0);
  assert.equal(out.bundle.files['snapshot/latest.json'].value.counts.active_work,0);
  assert.equal(out.bundle.files['indexes/active-work.json'].value.source,'DRIVE_TOWER_HOT_SET');
});

test('protected identity/version fields cannot be overwritten',()=>{
  const input=bundle();
  const request={request_id:'REQ-PROTECTED',entity_kind:'work',entity_name:'WORK-1',expected_version:1,writer_role:'EXECUTOR',event_type:'WORK_STARTED',changes:{entity_version:99}};
  assert.throws(()=>applyDriveMutationToBundle(input,request),/PROTECTED_FIELD_MUTATION/);
});


test('Drive transaction enforces L3 declared intent',()=>{
  const input=bundle();
  const base={request_id:'REQ-L3',entity_kind:'work',entity_name:'WORK-1',expected_version:1,writer_role:'EXECUTOR',event_type:'WORK_STARTED',changes:{status:'RUNNING'},autonomy_level:'L3'};
  assert.throws(()=>applyDriveMutationToBundle(input,base),/L3_INTENT_REQUIRED/);
  const out=applyDriveMutationToBundle(input,{...base,l3_intent:{summary:'start work',reason:'ready',metric:'terminal result'}});
  assert.equal(out.receipt.autonomy_level,'L3');
  assert.equal(out.receipt.governance_gate,'PASS_WITH_REPORT');
});

test('Drive transaction prevents L5 authority changes',()=>{
  const input=bundle();
  const request={request_id:'REQ-L5',entity_kind:'work',entity_name:'WORK-1',expected_version:1,writer_role:'EXECUTOR',event_type:'WORK_EDITED',changes:{truth_owner:'other'}};
  assert.throws(()=>applyDriveMutationToBundle(input,request),/L5_BOUNDARY_HUMAN_AUTHORITY_REQUIRED/);
});

test('Drive transaction keeps L4 policy human-gated',()=>{
  const input=bundle({'entities/governance/NEXO_RSI_POLICY.json':{encoding:'json',value:{id:'NEXO_RSI_POLICY',entity_version:1,retry_limit:2}}});
  const request={request_id:'REQ-L4',entity_kind:'governance',entity_name:'NEXO_RSI_POLICY',expected_version:1,writer_role:'ADVISOR',event_type:'POLICY_UPDATED',changes:{retry_limit:3},autonomy_level:'L4',governance_evidence:{baseline_ref:'B',hypothesis_ref:'H',metric:'m',rollback_ref:'R',evidence_refs:['E'],observed_gain:1,regression_passed:true}};
  assert.throws(()=>applyDriveMutationToBundle(input,request),/L4_HUMAN_APPROVAL_REQUIRED/);
});
