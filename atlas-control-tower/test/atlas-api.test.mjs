import test from 'node:test';import assert from 'node:assert/strict';
import {createApi,normalizeGraph,EMPTY_GRAPH} from '../lib/atlas-api.mjs';

const reply=body=>({ok:true,status:200,json:async()=>body});

test('contract fields fall back instead of throwing on an older payload',()=>{
 const g=normalizeGraph({nodes:[{id:'a'}],edges:[]});
 assert.equal(g.depth,1);assert.equal(g.truncated,false);assert.equal(g.fingerprint,'');
 assert.equal(g.sourceVersion,'');assert.deepEqual(g.issues,[]);assert.equal(g.total,1);
 const empty=normalizeGraph(null);
 assert.deepEqual(empty.nodes,EMPTY_GRAPH.nodes);assert.equal(empty.total,0);
});

test('edges with an unplaceable endpoint never reach the renderer',()=>{
 const g=normalizeGraph({nodes:[{id:'a'},{id:'b'}],edges:[{source:'a',target:'b'},{source:'a',target:'ghost'}]});
 assert.equal(g.edges.length,1);
 assert.equal(g.edges[0].target,'b');
});

test('repeat reads are served from cache while the fingerprint holds',async()=>{
 let calls=0;
 const api=createApi({fetchImpl:async()=>{calls++;return reply({nodes:[],edges:[],fingerprint:'fp1'})}});
 await api.graph({focus:'system:NEXO'});
 await api.graph({focus:'system:NEXO'});
 assert.equal(calls,1);
 await api.graph({focus:'system:SCIENCE'});
 assert.equal(calls,2);
});

test('a new projection fingerprint clears the cache; it is never an authority',async()=>{
 let fingerprint='fp1',calls=0;
 const api=createApi({fetchImpl:async()=>{calls++;return reply({nodes:[],edges:[],fingerprint})}});
 await api.graph({focus:'a'});
 assert.equal(calls,1);
 fingerprint='fp2';
 await api.graph({focus:'b'});
 await api.graph({focus:'a'});
 assert.equal(calls,3);
});

test('sync is never cached and drops what was cached before it',async()=>{
 let calls=0;
 const api=createApi({fetchImpl:async()=>{calls++;return reply({nodes:[],edges:[],fingerprint:'fp1'})}});
 await api.graph({focus:'a'});
 await api.sync();
 await api.sync();
 await api.graph({focus:'a'});
 assert.equal(calls,4);
 assert.equal(api.cached,1);
});

test('the first graph read after sync bypasses CDN once without changing the stable cache key',async()=>{
 const urls=[];
 const api=createApi({fetchImpl:async(url)=>{urls.push(url);return reply({nodes:[],edges:[],fingerprint:'fp1',source:'v1',freshness:'LIVE'})}});
 await api.graph({focus:'a'});
 await api.sync();
 await api.graph({focus:'a'});
 assert.match(urls.at(-1),/refresh=1/);
 const afterBypass=urls.length;
 await api.graph({focus:'a'});
 assert.equal(urls.length,afterBypass);
});

test('a failed read surfaces the status and caches nothing',async()=>{
 const api=createApi({fetchImpl:async()=>({ok:false,status:503,json:async()=>({})})});
 await assert.rejects(()=>api.graph({focus:'a'}),/HTTP 503/);
 assert.equal(api.cached,0);
});

test('provenance is exposed and a fallback is never labelled live',async()=>{
 const api=createApi({fetchImpl:async()=>reply({nodes:[],edges:[],fingerprint:'fp1',source:'legacy',freshness:'FALLBACK',sourceVersion:'2026-09-05T20:13:05Z'})});
 await api.graph({focus:'a'});
 assert.equal(api.provenance.source,'legacy');
 assert.equal(api.provenance.freshness,'FALLBACK');
 assert.equal(api.provenance.label,'FALLBACK · LEGACY SNAPSHOT');
 assert.equal(api.provenance.sourceVersion,'2026-09-05T20:13:05Z');
});

test('a healthy v1 payload is reported as live',async()=>{
 const api=createApi({fetchImpl:async()=>reply({nodes:[],edges:[],fingerprint:'fp9',source:'v1',freshness:'LIVE'})});
 await api.graph({focus:'a'});
 assert.equal(api.provenance.label,'LIVE · NEON V1');
});

test('the documented cache key carries source, fingerprint, focus, depth and filters',async()=>{
 const api=createApi({fetchImpl:async()=>reply({nodes:[],edges:[],fingerprint:'fp1',source:'v1',freshness:'LIVE'})});
 await api.graph({focus:'domain:D1',depth:3});
 const key=api.cacheKeyFor({focus:'domain:D1',depth:3,type:'TEST'});
 assert.match(key,/^graph:v1:v1:fp1:domain:D1:3:/);
 assert.ok(key.includes('type=TEST'));
});

test('a contract without nodes still yields a renderable empty graph',()=>{
 const g=normalizeGraph({focus:'x'});
 assert.deepEqual(g.nodes,[]);assert.deepEqual(g.edges,[]);assert.equal(g.focus,'x');
});
