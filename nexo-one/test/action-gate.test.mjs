import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIntent} from '../server/execution/contracts.mjs';
import {gateIntent,authorityProvider} from '../server/execution/gate.mjs';

const authorityRows=[
  {domain:'NEXO',canonical_truth:'ACTION_REGISTER + NDMK/STATE_INDEX'},
  {domain:'OLYMPUS',canonical_truth:'NEXO · SSOT CANONICAL / Olympus'},
  {domain:'ENGINEERING',canonical_truth:'Git/GitHub for versioned code'}
];
const pass={capability_id:'CAP-GCAL-INTERACTIVE-WRITE',domain:'ENGINEERING/OLYMPUS',runtime:'INTERACTIVE',operation:'Calendar create/delete write',status:'PASS'};
const base={action_id:'A1',action_type:'calendar.create',domain:'OLYMPUS',provider:'calendar',capability_id:pass.capability_id,target_ref:'primary',idempotency_key:'K1',requested_payload:{summary:'Canary'}};
const intent=normalizeIntent(base,0);

test('authority provider follows canonical owner semantics',()=>{
  assert.equal(authorityProvider(authorityRows[1]),'nexo');
  assert.equal(authorityProvider(authorityRows[2]),'github');
});

test('unknown and non-PASS capabilities fail closed',()=>{
  assert.throws(()=>gateIntent(intent,{truthGraphInput:{authorityRows,capabilityRows:[]},confirmed:true}),e=>e.code==='CAPABILITY_BLOCKED');
  for(const status of ['UNVERIFIED','PENDING_CANARY','BLOCKED','FAIL']){
    assert.throws(()=>gateIntent(intent,{truthGraphInput:{authorityRows,capabilityRows:[{...pass,status}]},confirmed:true}),e=>e.code==='CAPABILITY_BLOCKED');
  }
});

test('capability must include the requested domain',()=>{
  assert.throws(()=>gateIntent(intent,{truthGraphInput:{authorityRows,capabilityRows:[{...pass,domain:'ENGINEERING'}]},confirmed:true}),e=>e.code==='CAPABILITY_BLOCKED');
});

test('ordinary external effect may differ from Truth Owner when exact interactive capability allows it',()=>{
  const result=gateIntent(intent,{truthGraphInput:{authorityRows,capabilityRows:[pass]},confirmed:true});
  assert.equal(result.allowed,true);
  assert.equal(result.authority.expected_provider,'nexo');
  assert.equal(result.provider,'calendar');
});

test('scheduled-only capability cannot authorize an interactive broker write',()=>{
  assert.throws(()=>gateIntent(intent,{truthGraphInput:{authorityRows,capabilityRows:[{...pass,runtime:'SCHEDULED_TASK'}]},confirmed:'CONFIRM'}),e=>e.code==='CAPABILITY_BLOCKED');
});

test('read capability cannot be reused for a write action',()=>{
  const deploy=normalizeIntent({...base,action_id:'V1',action_type:'vercel.deploy',domain:'ENGINEERING',provider:'vercel',capability_id:'CAP-VERCEL-INTERACTIVE-READ',target_ref:'prj_nexo'},0);
  const cap={capability_id:'CAP-VERCEL-INTERACTIVE-READ',domain:'ENGINEERING',runtime:'INTERACTIVE',operation:'Projects/deployments/runtime state read',status:'PASS'};
  assert.throws(()=>gateIntent(deploy,{truthGraphInput:{authorityRows,capabilityRows:[cap]},confirmed:'CONFIRM'}),e=>e.code==='CAPABILITY_BLOCKED');
});

test('capability for another provider family cannot authorize the action',()=>{
  const bad={...pass,capability_id:'CAP-GITHUB-INTERACTIVE-WRITE',operation:'GitHub issue write'};
  const forged=normalizeIntent({...base,capability_id:bad.capability_id},0);
  assert.throws(()=>gateIntent(forged,{truthGraphInput:{authorityRows,capabilityRows:[bad]},confirmed:'CONFIRM'}),e=>e.code==='CAPABILITY_BLOCKED');
});

test('canonical NEXO sheet mutation accepts only interactive Sheets write evidence',()=>{
  const canonical=normalizeIntent({action_id:'S1',action_type:'nexo.sheet.update',domain:'NEXO',provider:'nexo',capability_id:'CAP-GDRIVE-INTERACTIVE-SHEET',target_ref:'sheet!A1',idempotency_key:'S1',requested_payload:{}},0);
  const cap={capability_id:'CAP-GDRIVE-INTERACTIVE-SHEET',domain:'NEXO',runtime:'INTERACTIVE',operation:'Sheets structure/write/readback',status:'PASS'};
  assert.equal(gateIntent(canonical,{truthGraphInput:{authorityRows,capabilityRows:[cap]},confirmed:'STRONG_CONFIRM'}).allowed,true);
});

test('canonical mutations must target canonical authority provider',()=>{
  const canonical=normalizeIntent({...base,action_type:'nexo.sheet.update',provider:'drive',capability_id:'CAP-GDRIVE-INTERACTIVE-SHEET'},0);
  const cap={capability_id:'CAP-GDRIVE-INTERACTIVE-SHEET',domain:'OLYMPUS',runtime:'INTERACTIVE',operation:'Sheets structure/write/readback',status:'PASS'};
  assert.throws(()=>gateIntent(canonical,{truthGraphInput:{authorityRows,capabilityRows:[cap]},confirmed:'STRONG_CONFIRM'}),e=>e.code==='AUTHORITY_CONFLICT');
});

test('confirmation is enforced from server policy',()=>{
  assert.throws(()=>gateIntent(intent,{truthGraphInput:{authorityRows,capabilityRows:[pass]},confirmed:false}),e=>e.code==='CONFIRMATION_REQUIRED');
  assert.equal(gateIntent(intent,{truthGraphInput:{authorityRows,capabilityRows:[pass]},confirmed:'CONFIRM'}).allowed,true);
});

test('strong confirmation rejects ordinary confirmation',()=>{
  const strong=normalizeIntent({...base,action_type:'calendar.delete'},0);
  assert.throws(()=>gateIntent(strong,{truthGraphInput:{authorityRows,capabilityRows:[pass]},confirmed:'CONFIRM'}),e=>e.code==='CONFIRMATION_REQUIRED');
  assert.equal(gateIntent(strong,{truthGraphInput:{authorityRows,capabilityRows:[pass]},confirmed:'STRONG_CONFIRM'}).allowed,true);
});
