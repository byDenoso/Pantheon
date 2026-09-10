import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIntent} from '../server/execution/contracts.mjs';
import {gateIntent,authorityProvider} from '../server/execution/gate.mjs';

const authorityRows=[
  {domain:'NEXO',canonical_truth:'ACTION_REGISTER + NDMK/STATE_INDEX'},
  {domain:'OLYMPUS',canonical_truth:'NEXO · SSOT CANONICAL / Olympus'},
  {domain:'ENGINEERING',canonical_truth:'Git/GitHub for versioned code'}
];
const pass={capability_id:'CAP-GCAL-SCHEDULED-WRITE',domain:'ENGINEERING/OLYMPUS',status:'PASS'};
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

test('ordinary external effect may differ from Truth Owner when capability explicitly allows domain',()=>{
  const result=gateIntent(intent,{truthGraphInput:{authorityRows,capabilityRows:[pass]},confirmed:true});
  assert.equal(result.allowed,true);
  assert.equal(result.authority.expected_provider,'nexo');
  assert.equal(result.provider,'calendar');
});

test('canonical mutations must target canonical authority provider',()=>{
  const canonical=normalizeIntent({...base,action_type:'nexo.sheet.update',provider:'drive',capability_id:'CAP-SHEET-WRITE'},0);
  assert.throws(()=>gateIntent(canonical,{truthGraphInput:{authorityRows,capabilityRows:[{capability_id:'CAP-SHEET-WRITE',domain:'OLYMPUS',status:'PASS'}]},confirmed:'STRONG_CONFIRM'}),e=>e.code==='AUTHORITY_CONFLICT');
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
