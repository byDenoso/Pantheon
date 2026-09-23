import test from 'node:test';
import assert from 'node:assert/strict';
import {createTowerGateway,towerStorageMode} from '../lib/tower-gateway.mjs';

test('storage authority has no implicit GitHub fallback',()=>{
  const env={};
  assert.equal(towerStorageMode(env),'');
  assert.throws(()=>createTowerGateway({env,fetchImpl:async()=>{throw new Error('unexpected network')}}),/NEXO_STORAGE_MODE_REQUIRED/);
  assert.throws(()=>createTowerGateway({env:{NEXO_STORAGE_MODE:'GITHUB'},fetchImpl:async()=>{throw new Error('unexpected network')}}),/LEGACY_GITHUB_STATE_BACKEND_DISABLED/);
});

test('Drive primary is explicit and fails closed when credentials are absent',async()=>{
  const env={NEXO_STORAGE_MODE:'DRIVE_PRIMARY'};
  assert.equal(towerStorageMode(env),'DRIVE_PRIMARY');
  const gateway=createTowerGateway({env,fetchImpl:async()=>{throw new Error('unexpected network')}});
  assert.equal(gateway.configured.towerStore,'GOOGLE_DRIVE_PRIVATE');
  assert.equal(gateway.configured.towerWrite,false);
  assert.equal(gateway.configured.migrationFallback,false);
  assert.equal(gateway.classifyBundlePath('CONTROL.json'),'CURRENT_CANONICAL');
  assert.equal(gateway.classifyBundlePath('projections/public/manifest.json'),'DERIVED_STALE_ALLOWED');
  assert.equal(gateway.classifyBundlePath('projections/public/projection.json'),'DERIVED_STALE_ALLOWED');
  await assert.rejects(()=>gateway.readControl(),/DRIVE_PRIMARY_NOT_CONFIGURED/);
  await assert.rejects(()=>gateway.submitTowerMutation({}),/DRIVE_V2_CORE_DIRECT_ONLY/);
  await assert.rejects(()=>gateway.dispatchRuntime({}),/DRIVE_V2_CORE_DIRECT_ONLY/);
});

test('legacy GitHub fallback flag cannot restore a second state source',()=>{
  const env={
    NEXO_STORAGE_MODE:'DRIVE_PRIMARY',
    NEXO_DRIVE_MIGRATION_FALLBACK_GITHUB:'1'
  };
  const gateway=createTowerGateway({env,fetchImpl:async()=>{throw new Error('network blocked')}});
  assert.equal(gateway.configured.towerStore,'GOOGLE_DRIVE_PRIVATE');
  assert.equal(gateway.configured.migrationFallback,false);
});
