import test from 'node:test';import assert from 'node:assert/strict';
import {configuredMode,resolveSource,fallbackIssue,createV1Reader,MODES} from '../lib/datasource.mjs';
import {SOURCES,FRESHNESS} from '../lib/graph-contract.mjs';

test('Drive is the only configured Atlas datasource mode',()=>{
 assert.deepEqual(MODES,{DRIVE:'drive'});
 assert.equal(configuredMode({}),MODES.DRIVE);
 assert.equal(configuredMode({ATLAS_DATA_SOURCE:'v1'}),MODES.DRIVE);
});

test('source resolution always returns a Drive-derived projection without fallback',async()=>{
 const d=await resolveSource({});
 assert.equal(d.source,SOURCES.DRIVE);
 assert.equal(d.freshness,FRESHNESS.SNAPSHOT);
 assert.equal(d.usedFallback,false);
 assert.equal(d.authority,'GOOGLE_DRIVE');
 assert.equal(d.projectionOnly,true);
 assert.equal(fallbackIssue(d),null);
});

test('the retired V1 reader cannot perform network reads',async()=>{
 const r=createV1Reader({fetchImpl:async()=>{throw Error('must not run')}});
 const health=await r.checkHealth();
 assert.equal(health.ok,false);
 assert.equal(health.detail,'RETIRED_RUNTIME');
});
