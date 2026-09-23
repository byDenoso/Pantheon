import test from 'node:test';
import assert from 'node:assert/strict';
import {__runtimeDriveInternal} from '../api/runtime-drive.js';

test('Tower projection version is anchored to the live file revision',async()=>{
  const source=await __runtimeDriveInternal.loadSource({
    async getCurrentSnapshotMeta(){return {revision:'sha256:'+'c'.repeat(64),updated_at:'2026-09-23T12:32:03Z'};},
    async readControl(){return {mode:'ACTIVE',schema_version:'stale-schema',truth_owner:'TOWER_V06@GOOGLE_DRIVE_PRIVATE'};},
    async readActiveWorkIndex(){return {work:[{id:'WORK-1'}]};},
    async readCampaignIndex(){return {campaigns:[]};},
    async listJsonDirectory(){return [];}
  });
  assert.equal(source.sourceVersion,'sha256:'+'c'.repeat(64));
  assert.equal(source.completeness,'DRIVE_TOWER_LIVE');
  assert.equal(source.entities.work[0].id,'WORK-1');
});
