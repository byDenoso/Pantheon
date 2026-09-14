import test from 'node:test';
import assert from 'node:assert/strict';
import {buildActivityEvents} from '../lib/activity-ledger.mjs';

const delta=(eventType,overrides={})=>({eventType,entityId:'T1',entityType:'TEST',observedAt:'2026-09-14T15:42:18-03:00',revision:2,campaignId:'C1',domains:['D1'],previousHash:'sha256:old',currentHash:'sha256:new',...overrides});

test('test projection deltas map to explicit user-visible activity event kinds',()=>{
  const events=buildActivityEvents([
    delta('ADDED',{revision:1,previousHash:undefined}),
    delta('UPDATED'),
    delta('RELINKED'),
    delta('UNPUBLISHED',{currentHash:undefined})
  ]);
  assert.deepEqual(events.map(x=>x.type),['TEST_ADDED','TEST_UPDATED','TEST_RELINKED','TEST_UNPUBLISHED']);
});

test('activity ids are deterministic for the same entity revision and event type',()=>{
  const first=buildActivityEvents([delta('UPDATED')])[0];
  const second=buildActivityEvents([delta('UPDATED')])[0];
  assert.equal(first.id,second.id);
  assert.equal(first.entityId,'T1');
  assert.equal(first.observedAt,'2026-09-14T15:42:18-03:00');
  assert.deepEqual(first.domains,['D1']);
});

test('activity preserves hashes and provenance without inventing source time',()=>{
  const event=buildActivityEvents([delta('UPDATED')],{sourceVersion:'drive-v1',sourceRef:'DENER · SSOT CANONICAL / Science'})[0];
  assert.equal(event.previousHash,'sha256:old');
  assert.equal(event.currentHash,'sha256:new');
  assert.equal(event.sourceCreatedAt,undefined);
  assert.equal(event.provenance[0].sourceVersion,'drive-v1');
});
