import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIntent,confirmationFor,ActionError,semanticKey} from '../server/execution/contracts.mjs';

const base={
  action_id:'A-1',
  action_type:'gmail.send',
  domain:'NEXO',
  provider:'gmail',
  capability_id:'CAP-GMAIL-SEND',
  target_ref:'me',
  idempotency_key:'idem-1',
  requested_payload:{to:'person@example.com',subject:'Teste'}
};

test('intent rejects client authority and missing stable identity',()=>{
  assert.throws(()=>normalizeIntent({...base,authority:'CLIENT'},0),error=>error instanceof ActionError&&error.code==='INVALID_INTENT');
  assert.throws(()=>normalizeIntent({...base,action_id:''},0),error=>error instanceof ActionError&&error.code==='INVALID_INTENT');
});

test('risk policy is server derived',()=>{
  assert.equal(confirmationFor('gmail.send'),'CONFIRM');
  assert.equal(confirmationFor('calendar.delete'),'STRONG_CONFIRM');
  assert.equal(confirmationFor('vercel.promote'),'STRONG_CONFIRM');
  assert.equal(confirmationFor('provider.refresh'),'NONE');
});

test('normalizeIntent ignores client timing and derives server fields',()=>{
  const value=normalizeIntent({...base,requested_at:'1999-01-01',requested_by:'attacker',confirmation_level:'NONE'},0);
  assert.equal(value.requested_at,'1970-01-01T00:00:00.000Z');
  assert.equal(value.requested_by,'private-session');
  assert.equal(value.confirmation_level,'CONFIRM');
});

test('semantic key is stable across server timing fields',()=>{
  const a=normalizeIntent(base,0),b=normalizeIntent(base,5000);
  assert.equal(semanticKey(a),semanticKey(b));
});

test('normalized errors expose allowlisted safe codes only',()=>{
  assert.equal(new ActionError('CAPABILITY_BLOCKED','provider leaked detail').code,'CAPABILITY_BLOCKED');
  assert.equal(new ActionError('SOMETHING_SECRET','provider leaked detail').code,'PROVIDER_UNAVAILABLE');
});
