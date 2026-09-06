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
 await api.graph({focus:'b'});          // learns the new version
 await api.graph({focus:'a'});          // previously cached under fp1, must refetch
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

test('a failed read surfaces the status and caches nothing',async()=>{
 const api=createApi({fetchImpl:async()=>({ok:false,status:503,json:async()=>({})})});
 await assert.rejects(()=>api.graph({focus:'a'}),/HTTP 503/);
 assert.equal(api.cached,0);
});
