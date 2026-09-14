import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalRecordHash,diffProjection} from '../lib/projection-diff.mjs';

const record=(overrides={})=>({id:'T1',primaryCampaign:'C1',domains:['D1'],status:'PASS',summary:'ok',keyMetrics:'H0=71.5',evidenceClass:'E1',sourceRef:'ref',lastVerified:'2026-09-14T10:00:00Z',...overrides});

test('record hash is deterministic over field order and domain order',()=>{
  const a=canonicalRecordHash(record({domains:['D2','D1']}));
  const b=canonicalRecordHash({lastVerified:'2026-09-14T10:00:00Z',sourceRef:'ref',evidenceClass:'E1',keyMetrics:'H0=71.5',summary:'ok',status:'PASS',domains:['D1','D2'],primaryCampaign:'C1',id:'T1'});
  assert.equal(a,b);
  assert.match(a,/^sha256:[0-9a-f]{64}$/);
});

test('first observation is ADDED and firstSeenAt is observer time, not source creation time',()=>{
  const now='2026-09-14T15:42:18-03:00';
  const result=diffProjection({previousLedger:[],currentRecords:[record({sourceCreatedAt:'2026-09-14T14:00:00-03:00'})],observedAt:now});
  assert.equal(result.deltas[0].eventType,'ADDED');
  assert.equal(result.ledger[0].firstSeenAt,now);
  assert.equal(result.ledger[0].sourceCreatedAt,'2026-09-14T14:00:00-03:00');
  assert.equal(result.ledger[0].revision,1);
});

test('same identity and hash is UNCHANGED without revision bump',()=>{
  const first=diffProjection({previousLedger:[],currentRecords:[record()],observedAt:'2026-09-14T10:00:00Z'});
  const second=diffProjection({previousLedger:first.ledger,currentRecords:[record()],observedAt:'2026-09-14T11:00:00Z'});
  assert.equal(second.deltas.length,0);
  assert.equal(second.ledger[0].revision,1);
  assert.equal(second.ledger[0].lastSeenAt,'2026-09-14T11:00:00Z');
});

test('content change emits UPDATED and membership change also emits RELINKED',()=>{
  const first=diffProjection({previousLedger:[],currentRecords:[record()],observedAt:'2026-09-14T10:00:00Z'});
  const updated=diffProjection({previousLedger:first.ledger,currentRecords:[record({summary:'changed'})],observedAt:'2026-09-14T11:00:00Z'});
  assert.deepEqual(updated.deltas.map(x=>x.eventType),['UPDATED']);
  const relinked=diffProjection({previousLedger:updated.ledger,currentRecords:[record({summary:'changed',primaryCampaign:'C2',domains:['D2']})],observedAt:'2026-09-14T12:00:00Z'});
  assert.deepEqual(relinked.deltas.map(x=>x.eventType),['UPDATED','RELINKED']);
  assert.equal(relinked.ledger[0].revision,3);
});

test('previously published identity absent from current input becomes UNPUBLISHED',()=>{
  const first=diffProjection({previousLedger:[],currentRecords:[record()],observedAt:'2026-09-14T10:00:00Z'});
  const gone=diffProjection({previousLedger:first.ledger,currentRecords:[],observedAt:'2026-09-14T11:00:00Z'});
  assert.equal(gone.deltas[0].eventType,'UNPUBLISHED');
  assert.equal(gone.ledger[0].state,'UNPUBLISHED');
  assert.equal(gone.ledger[0].revision,2);
});
