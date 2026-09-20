import test from 'node:test';
import assert from 'node:assert/strict';
import {createTowerGateway,towerStorageMode} from '../lib/tower-gateway.mjs';

test('storage authority stays on GitHub by default',()=>{
  const env={};
  assert.equal(towerStorageMode(env),'GITHUB');
  const gateway=createTowerGateway({env,fetchImpl:async()=>{throw new Error('unexpected network')}});
  assert.equal(gateway.configured.towerRepo,'byDenoso/NEXO-Obsidian-Vault');
  assert.equal(gateway.configured.towerRef,'main');
});

test('Drive primary is explicit and fails closed when credentials are absent',async()=>{
  const env={NEXO_STORAGE_MODE:'DRIVE_PRIMARY'};
  assert.equal(towerStorageMode(env),'DRIVE_PRIMARY');
  const gateway=createTowerGateway({env,fetchImpl:async()=>{throw new Error('unexpected network')}});
  assert.equal(gateway.configured.towerStore,'GOOGLE_DRIVE');
  assert.equal(gateway.configured.towerWrite,false);
  assert.equal(gateway.configured.migrationFallback,false);
  await assert.rejects(()=>gateway.readControl(),/DRIVE_PRIMARY_NOT_CONFIGURED/);
});

test('GitHub fallback is migration-only and must be explicitly enabled',()=>{
  const env={
    NEXO_STORAGE_MODE:'DRIVE_PRIMARY',
    NEXO_DRIVE_MIGRATION_FALLBACK_GITHUB:'1'
  };
  const gateway=createTowerGateway({env,fetchImpl:async()=>{throw new Error('network blocked')}});
  assert.equal(gateway.configured.towerStore,'GOOGLE_DRIVE');
  assert.equal(gateway.configured.migrationFallback,true);
});
