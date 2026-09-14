import test from 'node:test';import assert from 'node:assert/strict';
import {configuredMode,resolveSource,fallbackIssue,createV1Reader,MODES} from '../lib/datasource.mjs';
import {SOURCES,FRESHNESS} from '../lib/graph-contract.mjs';

test('Tower is the configured Atlas authority mode while Drive remains compatibility-only',()=>{
 assert.deepEqual(MODES,{TOWER:'tower',DRIVE:'drive'});
 assert.equal(configuredMode({}),MODES.TOWER);
 assert.equal(configuredMode({ATLAS_DATA_SOURCE:'drive'}),MODES.TOWER);
});

test('source resolution exposes a read-only Tower projection without fallback',async()=>{
 const d=await resolveSource({});
 assert.equal(d.source,SOURCES.TOWER);
 assert.equal(d.freshness,FRESHNESS.SNAPSHOT);
 assert.equal(d.usedFallback,false);
 assert.equal(d.authority,'TOWER_V06');
 assert.equal(d.truthOwner,'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06');
 assert.equal(d.projectionOnly,true);
 assert.equal(fallbackIssue(d),null);
});

test('the retired V1 reader cannot perform network reads',async()=>{
 const r=createV1Reader({fetchImpl:async()=>{throw Error('must not run')}});
 const health=await r.checkHealth();
 assert.equal(health.ok,false);
 assert.equal(health.detail,'RETIRED_RUNTIME');
});