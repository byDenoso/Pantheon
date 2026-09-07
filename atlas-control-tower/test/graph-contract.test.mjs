import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeGraph,contractIssues,cacheKey,provenanceLabel,EMPTY_GRAPH,SOURCES,FRESHNESS} from '../lib/graph-contract.mjs';

test('optional contract fields fall back instead of breaking the UI',()=>{
 const g=normalizeGraph({nodes:[{id:'a'}],edges:[]});
 assert.equal(g.depth,1);assert.equal(g.truncated,false);assert.equal(g.fingerprint,'');
 assert.equal(g.sourceVersion,'');assert.equal(g.source,SOURCES.LEGACY);assert.equal(g.freshness,FRESHNESS.SNAPSHOT);
 assert.deepEqual(g.issues,[]);assert.equal(g.total,1);
 const empty=normalizeGraph(null);
 assert.deepEqual(empty.nodes,EMPTY_GRAPH.nodes);assert.equal(empty.total,0);
});

test('unknown fields from a newer backend are tolerated and preserved',()=>{
 const g=normalizeGraph({nodes:[],edges:[],ontology:'D1-D11+M1',revisionHistory:[1,2]});
 assert.equal(g.extra.ontology,'D1-D11+M1');
 assert.deepEqual(g.extra.revisionHistory,[1,2]);
});

test('edges with an unplaceable endpoint never reach the renderer',()=>{
 const g=normalizeGraph({nodes:[{id:'a'},{id:'b'}],edges:[{source:'a',target:'b'},{source:'a',target:'ghost'}]});
 assert.equal(g.edges.length,1);assert.equal(g.edges[0].target,'b');
});

test('focus travels in the contract and falls back to the request focus',()=>{
 assert.equal(normalizeGraph({nodes:[],edges:[],focus:'domain:D1'}).focus,'domain:D1');
 assert.equal(normalizeGraph({nodes:[],edges:[]},{focus:'system:NEXO'}).focus,'system:NEXO');
});

test('contract drift is reported by level, never thrown',()=>{
 const issues=contractIssues({edges:[{source:'a'}]});
 assert.ok(issues.some(i=>i.level==='ERROR'&&i.field==='nodes'));
 assert.ok(issues.some(i=>i.level==='WARN'&&i.field==='edges'));
 assert.equal(contractIssues({nodes:[],edges:[],total:0,fingerprint:'x',sourceVersion:'y',depth:1}).length,0);
});

test('cache key is deterministic and order independent',()=>{
 const a=cacheKey({fingerprint:'fp1',focus:'domain:D1',depth:3,source:'v1',filters:{type:'TEST',status:'blocked'}});
 const b=cacheKey({fingerprint:'fp1',focus:'domain:D1',depth:3,source:'v1',filters:{status:'blocked',type:'TEST'}});
 assert.equal(a,b);
 assert.equal(a,'graph:v1:v1:fp1:domain:D1:3:status=blocked,type=TEST');
 assert.notEqual(a,cacheKey({fingerprint:'fp2',focus:'domain:D1',depth:3,source:'v1',filters:{type:'TEST',status:'blocked'}}));
 assert.match(cacheKey({}),/^graph:v1:legacy:nofp:root:1:none$/);
});

test('a fallback is never described as live',()=>{
 assert.equal(provenanceLabel({source:SOURCES.V1,freshness:FRESHNESS.LIVE}),'LIVE · NEON V1');
 assert.equal(provenanceLabel({source:SOURCES.V1,freshness:FRESHNESS.STAGING}),'STAGING V1');
 assert.equal(provenanceLabel({source:SOURCES.LEGACY,freshness:FRESHNESS.SNAPSHOT}),'LEGACY SNAPSHOT');
 assert.equal(provenanceLabel({source:SOURCES.LEGACY,freshness:FRESHNESS.FALLBACK}),'FALLBACK · LEGACY SNAPSHOT');
 assert.equal(provenanceLabel({source:SOURCES.LEGACY,freshness:FRESHNESS.STALE}),'STALE · LEGACY SNAPSHOT');
});
