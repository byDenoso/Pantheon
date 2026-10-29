import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryFixture} from './helpers/memory.fixture.mjs';
import {queryKnowledge, knowledgeRoute} from '../worker/knowledge.mjs';
const add=(tower,path,value)=>{tower.files[path]={encoding:'json',value};tower.file_count=Object.keys(tower.files).length;};
test('graph reuses exact identities, versions, explicit field lineage and canonical domain metadata',()=>{
 const tower=memoryFixture(),before=JSON.stringify(tower),view=queryKnowledge(tower,{seed_id:'T-1',depth:1});
 assert.equal(view.contract,'ATLAS_PRIVATE_KNOWLEDGE_V1');assert.equal(view.source_revision,tower.revision);assert.equal(view.scientific_authority,false);assert.equal(view.writer.can_apply,false);
 assert.equal(view.retrieval.vector_cache,'NOT_CONNECTED');assert.equal(view.retrieval.similarity_is_evidence,false);
 const node=view.nodes.find(v=>v.id==='TEST::T-1');assert.equal(node.citation.entity_version,'4');assert.equal(node.semantic.topic_id,'science.expansion');
 const edge=view.edges.find(v=>v.kind==='TESTS_HYPOTHESIS');assert.equal(edge.target,'HYPOTHESIS::H-1');assert.equal(edge.evidence.json_pointer,'/hypothesis_id');assert.equal(edge.evidence.tower_revision,tower.revision);
 assert.ok(view.nodes.some(v=>v.id==='LEARNING_SIGNAL::FB-1'));assert.equal(JSON.stringify(tower),before);
});
test('excluded nested domains, secrets and unresolved target identifiers never leak into graph',()=>{
 const tower=memoryFixture();add(tower,'entities/test/T-X.json',{id:'T-X',kind:'TEST',semantic:{topic_id:'peer.private'},title:'NEVER_TOPIC'});
 add(tower,'entities/test/T-Y.json',{id:'T-Y',kind:'TEST',payload:{items:[{domain:'OLYMPUS'}]},title:'NEVER_ARRAY'});
 tower.files['entities/test/T-1.json'].value.refs=['NEVER_PRIVATE_REF'];
 tower.files['entities/test/T-1.json'].value.apiKey='NEVER_SECRET';
 const json=JSON.stringify(queryKnowledge(tower,{limit:100}));
 for(const text of ['NEVER_MEMORY_PEER','NEVER_CROSS_DOMAIN','NEVER_TOPIC','NEVER_ARRAY','NEVER_PRIVATE_REF','NEVER_SECRET'])assert.equal(json.includes(text),false,text);
 assert.ok(queryKnowledge(tower).unresolved_reference_count>0);
});
test('conflicting identities are quarantined, same names across kinds are never guessed',()=>{
 const tower=memoryFixture();add(tower,'entities/test/duplicate.json',{...tower.files['entities/test/T-1.json'].value,title:'different'});
 assert.throws(()=>queryKnowledge(tower,{seed_id:'T-1'}),/KNOWLEDGE_TARGET_UNAVAILABLE/);
 const result=queryKnowledge(tower);assert.equal(result.quarantined_identity_count,2);assert.ok(result.nodes.every(v=>v.object_id!=='T-1'));
 const other=memoryFixture();add(other,'entities/artifact/T-1.json',{id:'T-1',kind:'ARTIFACT',title:'Unrelated'});
 assert.throws(()=>queryKnowledge(other,{seed_id:'T-1'}),/KNOWLEDGE_TARGET_UNAVAILABLE/);
 assert.ok(queryKnowledge(other,{seed_id:'TEST::T-1'}).edges.some(v=>v.kind==='RELATES_TO_TEST'));
 assert.ok(!queryKnowledge(other,{seed_id:'TEST::T-1'}).edges.some(v=>v.source==='LEARNING_SIGNAL::FB-1'));
});
test('inactive records require explicit history and never gain automatic scientific confirmation',()=>{
 const tower=memoryFixture();tower.files['entities/test/T-1.json'].value.status='RETRACTED';
 assert.throws(()=>queryKnowledge(tower,{seed_id:'T-1'}),/KNOWLEDGE_TARGET_UNAVAILABLE/);
 const result=queryKnowledge(tower,{seed_id:'T-1',include_history:true});assert.equal(result.nodes[0].state,'RETRACTED');assert.equal(result.scientific_authority,false);
});
test('unknown semantic values remain unmapped and filters do not cross domains or infer similarity',()=>{
 const tower=memoryFixture();const view=queryKnowledge(tower,{seed_id:'T-1',domain:'science'});
 assert.ok(view.nodes.every(v=>v.semantic.domain_id==='SCIENCE'));assert.ok(view.edges.every(v=>v.kind!=='SIMILAR_TO'));
 assert.ok(queryKnowledge(tower,{query:'RULE-1'}).nodes.every(v=>v.semantic.domain_id==='UNMAPPED'));
 assert.equal(queryKnowledge(tower,{topic_id:'science.expansion'}).nodes.length,1);
});
test('limits and revision conflicts are enforced before graph traversal',async()=>{
 const tower=memoryFixture();for(const body of [{depth:4},{depth:-1},{limit:101},{edge_limit:301},{query:'x'.repeat(257)},{include_history:'yes'},{file_id:'anything'},null,[],{expected_revision:'bad'}])assert.throws(()=>queryKnowledge(tower,body),/KNOWLEDGE_QUERY_INVALID/);
 assert.throws(()=>queryKnowledge(tower,{expected_revision:'sha256:'+'a'.repeat(64)}),/KNOWLEDGE_REVISION_CONFLICT/);
 const narrow=queryKnowledge(tower,{seed_id:'T-1',limit:1});assert.equal(narrow.nodes.length,1);assert.equal(narrow.coverage.truncated,true);
 const edges=queryKnowledge(tower,{seed_id:'T-1',edge_limit:1});assert.equal(edges.edges.length,1);assert.equal(edges.coverage.truncated,true);assert.equal(edges.coverage.metrics_scope,'RETURNED_GRAPH_ONLY');
 let reads=0;assert.equal((await knowledgeRoute({url:'untrusted'},async()=>{reads++;return tower;})).status,400);assert.equal(reads,0);
});
test('graph kernels identify bounded cycles and articulation from explicit references only',()=>{
 const view=queryKnowledge(memoryFixture(),{seed_id:'T-1'});assert.equal(view.metrics.components,1);assert.deepEqual(view.metrics.cyclic_nodes,['HYPOTHESIS::H-1','TEST::T-1']);assert.deepEqual(view.metrics.articulation_nodes,['TEST::T-1']);
 const sorted=JSON.parse(JSON.stringify(memoryFixture()));sorted.files=Object.fromEntries(Object.entries(sorted.files).reverse());assert.deepEqual(queryKnowledge(sorted,{seed_id:'T-1'}),view);
});
