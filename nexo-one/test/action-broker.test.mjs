import test from 'node:test';
import assert from 'node:assert/strict';
import {createBroker} from '../server/execution/broker.mjs';
import {ExecutionLedger} from '../server/execution/ledger.mjs';

const authorityRows=[{domain:'OLYMPUS',canonical_truth:'NEXO · SSOT CANONICAL / Olympus'}];
const capabilityRows=[{capability_id:'CAP-GCAL-INTERACTIVE-WRITE',domain:'OLYMPUS',runtime:'INTERACTIVE',operation:'Calendar create/write',status:'PASS'}];
const truthGraphInput={authorityRows,capabilityRows};
const intent={action_id:'A1',action_type:'calendar.create',domain:'OLYMPUS',provider:'calendar',capability_id:'CAP-GCAL-INTERACTIVE-WRITE',target_ref:'primary',idempotency_key:'K1',requested_payload:{summary:'Canary'}};
const source={provider:{id:'calendar',status:'AVAILABLE',revision:'before'},items:[]};

function setup(provider={}){
  let effects=0,preflights=0;
  const ledger=new ExecutionLedger({now:()=>0});
  const broker=createBroker({
    ledger,
    loadTruth:async()=>({truthGraphInput,revision:'ssot-r1'}),
    loadProvider:async()=>source,
    resolveProvider:()=>({
      preflight:provider.preflight|| (async()=>{preflights++;return {ok:true};}),
      execute:provider.execute|| (async()=>{effects++;return {effect_id:'e1',source_ref:'https://calendar.google.com/e1',classification:'ACK',expected:{summary:'Canary'}};}),
      readback:provider.readback|| (async()=>({status:'PASS',readback_status:'MATCH',after_revision:'after',source_ref:'https://calendar.google.com/e1',explanation:'verified'}))
    }),
    now:()=>0
  });
  return {broker,ledger,effects:()=>effects,preflights:()=>preflights};
}

test('plan validates authority/capability and provider write preflight but does not dispatch',async()=>{
  const {broker,effects,preflights}=setup();const plan=await broker.planAction(intent,{env:{}});
  assert.equal(plan.status,'GATED');assert.equal(plan.confirmation_level,'CONFIRM');assert.equal(effects(),0);assert.equal(preflights(),1);
});

test('plan stops before confirmation when provider write scope preflight fails',async()=>{
  const {broker,effects}=setup({preflight:async()=>{throw Object.assign(new Error('scope'),{code:'SCOPE_REQUIRED'});}});
  await assert.rejects(()=>broker.planAction(intent,{env:{}}),error=>error.code==='SCOPE_REQUIRED');
  assert.equal(effects(),0);
});

test('execute requires confirmation and makes no side effect when missing',async()=>{
  const {broker,effects}=setup();await assert.rejects(()=>broker.executeAction(intent,{env:{},confirmed:false}),e=>e.code==='CONFIRMATION_REQUIRED');assert.equal(effects(),0);
});

test('confirmed write re-runs preflight then dispatches and readbacks before PASS',async()=>{
  const {broker,effects,preflights}=setup();const receipt=await broker.executeAction(intent,{env:{},confirmed:'CONFIRM'});
  assert.equal(effects(),1);assert.equal(preflights(),1);assert.equal(receipt.status,'PASS');assert.equal(receipt.readback_status,'MATCH');assert.ok(receipt.trace.some(x=>x.stage==='PROVIDER_ACK'));assert.ok(receipt.trace.some(x=>x.stage==='READBACK'));
});

test('duplicate confirmed execute produces one provider effect',async()=>{
  const {broker,effects}=setup();await broker.executeAction(intent,{env:{},confirmed:'CONFIRM'});const again=await broker.executeAction({...intent,action_id:'A2'},{env:{},confirmed:'CONFIRM'});
  assert.equal(effects(),1);assert.equal(again.status,'PASS');
});

test('provider ack plus mismatch is never PASS',async()=>{
  const {broker}=setup({readback:async()=>({status:'FAILED',readback_status:'MISMATCH',after_revision:'wrong',explanation:'mismatch'})});
  const receipt=await broker.executeAction(intent,{env:{},confirmed:'CONFIRM'});assert.equal(receipt.status,'FAILED');assert.notEqual(receipt.status,'PASS');
});

test('acked retry performs readback instead of a second dispatch',async()=>{
  let dispatch=0,reads=0;const {broker}=setup({execute:async()=>{dispatch++;return {effect_id:'e1',source_ref:'x',expected:{summary:'Canary'}};},readback:async()=>{reads++;if(reads===1)throw Object.assign(new Error('timeout'),{code:'READBACK_TIMEOUT'});return {status:'PASS',readback_status:'MATCH',after_revision:'r2'};}});
  const first=await broker.executeAction(intent,{env:{},confirmed:'CONFIRM'});assert.equal(first.status,'PENDING_READBACK');
  const second=await broker.executeAction({...intent,action_id:'A2'},{env:{},confirmed:'CONFIRM'});assert.equal(dispatch,1);assert.equal(second.status,'PASS');
});
