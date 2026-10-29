import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryFixture} from './helpers/memory.fixture.mjs';
import {queryKnowledge} from '../worker/knowledge.mjs';
import {integrateMemoryGraph} from '../server/atlas/memory-graph-bridge.mjs';
const packet=tower=>{const node=queryKnowledge(tower,{seed_id:'T-1',depth:0}).nodes[0];return {snapshot:{source_id:tower.stable_file_id,revision:tower.revision},role:'LEARNER',role_scope:{role:'LEARNER',source_revision:tower.revision,eligible_ids:['TEST::T-1','HYPOTHESIS::H-1']},mode:'hybrid',method:'tfidf-lsa',hits:[{id:node.id,score:.02,cosine:.8,title:'UNTRUSTED_TITLE',excerpt:'UNTRUSTED_EXCERPT',citation:{...node.citation,canonical_id:node.id,object_id:node.object_id,content_sha256:'b'.repeat(64)}}]};};
test('Python retrieval composes with canonical graph without trusting cache text or confusing hashes',()=>{
 const tower=memoryFixture(),before=JSON.stringify(tower),result=integrateMemoryGraph(tower,packet(tower));
 assert.equal(result.runtime,'LOCAL_COMPOSITION_ONLY');assert.equal(result.hosted_vector_cache,'NOT_CONNECTED');assert.equal(result.hits[0].retrieval_citation.hash_contract,'PYTHON_JSON_V1');assert.equal(result.hits[0].node.citation.hash_contract,'ATLAS_JSON_V1');assert.notEqual(result.hits[0].retrieval_citation.content_sha256,result.hits[0].node.citation.content_sha256);
 assert.ok(result.graph.edges.length);assert.equal(JSON.stringify(result).includes('UNTRUSTED_'),false);assert.equal(result.scientific_authority,false);assert.equal(result.applied,false);assert.equal(JSON.stringify(tower),before);
});
test('foreign source, stale cache, mismatched version/path and malformed scores are refused',()=>{
 const tower=memoryFixture();for(const mutate of [p=>p.snapshot.revision='old',p=>p.snapshot.source_id='other',p=>p.hits[0].citation.entity_version='3',p=>p.hits[0].citation.path='elsewhere',p=>p.hits[0].score=NaN,p=>p.mode='made-up']){const p=packet(tower);mutate(p);assert.throws(()=>integrateMemoryGraph(tower,p));}
});
test('broader private Python results cannot expand the scoped Atlas graph visibility',()=>{
 const tower=memoryFixture(),p=packet(tower);p.hits[0].id=p.hits[0].citation.canonical_id='TEST::PEER-PRIVATE';
 const result=integrateMemoryGraph(tower,p);assert.equal(result.hits.length,0);assert.equal(result.graph,null);assert.equal(result.excluded_hit_count,1);assert.equal(JSON.stringify(result).includes('PEER-PRIVATE'),false);
});
test('graph expansion preserves exact provider role eligibility and requires its revision-bound scope',()=>{
 const tower=memoryFixture(),p=packet(tower);p.role_scope.eligible_ids=['TEST::T-1'];
 const result=integrateMemoryGraph(tower,p);assert.deepEqual(result.graph.nodes.map(v=>v.id),['TEST::T-1']);assert.deepEqual(result.graph.edges,[]);assert.equal(result.retrieval.role,'LEARNER');
 for(const mutate of [p=>delete p.role_scope,p=>p.role_scope.role='ENGINEER',p=>p.role_scope.source_revision='old']){const copy=packet(tower);mutate(copy);assert.throws(()=>integrateMemoryGraph(tower,copy),/MEMORY_GRAPH_ROLE_SCOPE_REQUIRED/);}
});
