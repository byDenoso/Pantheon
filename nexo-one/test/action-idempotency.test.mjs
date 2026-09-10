import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIntent} from '../server/execution/contracts.mjs';
import {ExecutionLedger} from '../server/execution/ledger.mjs';

const base={action_id:'A1',action_type:'gmail.send',domain:'NEXO',provider:'gmail',capability_id:'CAP-X',target_ref:'me',idempotency_key:'K1',requested_payload:{subject:'x'}};

test('same idempotency key and semantic payload reuses the receipt',()=>{
  const ledger=new ExecutionLedger({now:()=>0});
  const first=ledger.begin(normalizeIntent(base,0));
  const second=ledger.begin(normalizeIntent({...base,action_id:'A2'},1));
  assert.equal(second.receipt_id,first.receipt_id);
  assert.equal(ledger.recent().length,1);
});

test('same idempotency key with different payload fails closed',()=>{
  const ledger=new ExecutionLedger({now:()=>0});
  ledger.begin(normalizeIntent(base,0));
  assert.throws(()=>ledger.begin(normalizeIntent({...base,action_id:'A2',requested_payload:{subject:'different'}},1)),e=>e.code==='IDEMPOTENCY_CONFLICT');
});

test('receipt lifecycle captures provider ack and readback evidence',()=>{
  const ledger=new ExecutionLedger({now:()=>0});
  const r=ledger.begin(normalizeIntent(base,0));
  ledger.transition(r.receipt_id,'DISPATCHED',{before_revision:'r1'});
  ledger.ack(r.receipt_id,{effect_id:'m1',source_ref:'https://mail.google.com/'});
  const done=ledger.finish(r.receipt_id,{status:'PASS',after_revision:'r2',readback_status:'MATCH',explanation:'effect verified'});
  assert.equal(done.status,'PASS');
  assert.equal(done.provider_effect_id,'m1');
  assert.equal(done.after_revision,'r2');
});

test('ledger remains bounded',()=>{
  let now=0;const ledger=new ExecutionLedger({limit:2,ttlMs:1000,now:()=>now});
  for(let i=0;i<3;i++)ledger.begin(normalizeIntent({...base,action_id:`A${i}`,idempotency_key:`K${i}`},i));
  assert.equal(ledger.recent(10).length,2);
  now=5000;ledger.prune();
  assert.equal(ledger.recent(10).length,0);
});
