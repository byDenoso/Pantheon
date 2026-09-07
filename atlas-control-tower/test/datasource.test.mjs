import test from 'node:test';import assert from 'node:assert/strict';
import {configuredMode,resolveSource,fallbackIssue,createV1Reader,MODES} from '../lib/datasource.mjs';
import {SOURCES,FRESHNESS} from '../lib/graph-contract.mjs';

const reader=detail=>({checkHealth:async()=>({ok:detail==='OK',detail})});

test('the mode comes from the environment and defaults to auto',()=>{
 assert.equal(configuredMode({}),MODES.AUTO);
 assert.equal(configuredMode({ATLAS_DATA_SOURCE:'v1'}),MODES.V1);
 assert.equal(configuredMode({ATLAS_DATA_SOURCE:'LEGACY'}),MODES.LEGACY);
 assert.equal(configuredMode({ATLAS_DATA_SOURCE:'nonsense'}),MODES.AUTO);
});

test('auto uses V1 when healthy and falls back loudly when it is not',async()=>{
 const ok=await resolveSource({mode:MODES.AUTO,reader:reader('OK')});
 assert.equal(ok.source,SOURCES.V1);assert.equal(ok.usedFallback,false);
 const down=await resolveSource({mode:MODES.AUTO,reader:reader('V1_HTTP_502')});
 assert.equal(down.source,SOURCES.LEGACY);
 assert.equal(down.freshness,FRESHNESS.FALLBACK);
 assert.equal(down.usedFallback,true);
 assert.equal(down.reason,'V1_HTTP_502');
});

test('auto without a configured V1 is legacy by design, not a degraded fallback',async()=>{
 const d=await resolveSource({mode:MODES.AUTO,reader:reader('NOT_CONFIGURED')});
 assert.equal(d.source,SOURCES.LEGACY);
 assert.equal(d.freshness,FRESHNESS.SNAPSHOT);
 assert.equal(d.usedFallback,false);
 assert.equal(fallbackIssue(d),null);
});

test('asking for v1 explicitly and getting nothing is always reported',async()=>{
 const d=await resolveSource({mode:MODES.V1,reader:reader('NOT_CONFIGURED')});
 assert.equal(d.freshness,FRESHNESS.FALLBACK);
 const issue=fallbackIssue(d);
 assert.equal(issue.type,'DATASOURCE_FALLBACK');
 assert.match(issue.detail,/science_v1/);
});

test('legacy mode never probes V1',async()=>{
 let probed=false;
 const d=await resolveSource({mode:MODES.LEGACY,reader:{checkHealth:async()=>{probed=true;return{ok:true}}}});
 assert.equal(probed,false);
 assert.equal(d.source,SOURCES.LEGACY);
 assert.equal(d.reason,'CONFIGURED_LEGACY');
});

test('an unconfigured V1 reader reports NOT_CONFIGURED without a network call',async()=>{
 let calls=0;
 const r=createV1Reader({env:{},fetchImpl:async()=>{calls++;return{ok:true,json:async()=>({})}}});
 const h=await r.checkHealth();
 assert.equal(h.ok,false);assert.equal(h.detail,'NOT_CONFIGURED');assert.equal(calls,0);
});

test('a configured V1 reader caches health for its ttl',async()=>{
 let calls=0;
 const r=createV1Reader({env:{ATLAS_V1_BASE_URL:'https://v1.example/api'},healthTtlMs:60000,
  fetchImpl:async()=>{calls++;return{ok:true,json:async()=>({ok:true,version:'1.0.0'})}}});
 assert.equal((await r.checkHealth()).ok,true);
 await r.checkHealth();
 assert.equal(calls,1);
 await r.checkHealth({force:true});
 assert.equal(calls,2);
});
