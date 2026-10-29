import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryFixture} from './helpers/memory.fixture.mjs';
import {browseMemory,memoryDocuments} from '../worker/memory.mjs';
import {createKnowledgeReader,queryKnowledge} from '../worker/knowledge.mjs';

test('exact object and canonical IDs precede mentioning records without dropping other matches',()=>{
  const tower=memoryFixture();
  const lexical=memoryDocuments(tower).filter(row=>[row.title,row.text,row.canonical_id,row.topic,...row.refs].join(' ').toLowerCase().includes('t-1'));
  assert.notEqual(lexical[0].canonical_id,'TEST::T-1');
  for(const query of ['T-1','TEST::T-1','  T-1  ']){
    const view=browseMemory(tower,{query,limit:50});
    assert.equal(view.items[0].canonical_id,'TEST::T-1');
    assert.equal(view.items[0].citation.entity_version,'4');
  }
  const view=browseMemory(tower,{query:'T-1',limit:50});
  assert.equal(view.total,lexical.length);
  assert.deepEqual(view.items.slice(1).map(row=>row.canonical_id),lexical.filter(row=>row.canonical_id!=='TEST::T-1').map(row=>row.canonical_id));
});

test('identity priority precedes pagination and preserves kind, relation and empty-query filters',()=>{
  const tower=memoryFixture();
  assert.equal(browseMemory(tower,{query:'T-1',limit:1}).items[0].canonical_id,'TEST::T-1');
  assert.notEqual(browseMemory(tower,{query:'T-1',offset:1,limit:1}).items[0].canonical_id,'TEST::T-1');
  assert.ok(browseMemory(tower,{query:'T-1',kind:'HYPOTHESIS'}).items.every(row=>row.kind==='HYPOTHESIS'));
  assert.equal(browseMemory(tower,{query:'T-1',related_id:'NO-SUCH-IDENTITY'}).total,0);
  assert.equal(browseMemory(tower,{query:'NO-SUCH-IDENTITY'}).total,0);
  assert.deepEqual(browseMemory(tower,{limit:50}).items.map(row=>row.canonical_id),memoryDocuments(tower).map(row=>row.canonical_id));
});

test('one request-local reader preserves graph outputs across bounded queries',()=>{
  const tower=memoryFixture(),read=createKnowledgeReader(tower);
  for(const body of [{},{seed_id:'T-1',depth:0,limit:1},{seed_id:'T-1',depth:1},{query:'expansion'},{domain:'SCIENCE'},{topic_id:'science.expansion'},{edge_limit:1},{limit:1},{expected_revision:tower.revision}])
    assert.deepEqual(read(body),queryKnowledge(tower,body));
  assert.throws(()=>read({expected_revision:'sha256:'+'a'.repeat(64)}),/KNOWLEDGE_REVISION_CONFLICT/);
  assert.throws(()=>read({include_history:true}),/KNOWLEDGE_HISTORY_SCOPE_CONFLICT/);
  assert.throws(()=>read({role:'ENGINEER'}),/KNOWLEDGE_QUERY_INVALID/);
});

test('request-local role scope cannot expand by mutating the caller Set or a previous result',()=>{
  const tower=memoryFixture(),ids=new Set(['TEST::T-1']);
  const read=createKnowledgeReader(tower,{allowedIds:ids}),before=read({seed_id:'T-1'});
  ids.add('HYPOTHESIS::H-1');
  const corrupted=read({seed_id:'T-1'});
  corrupted.nodes[0].title='changed';corrupted.nodes[0].citation.path='changed';
  corrupted.nodes[0].semantic.domain_id='changed';corrupted.domains[0].count=999;
  corrupted.nodes[0].semantic.membership_ids.push('OLYMPUS');
  corrupted.nodes[0].semantic.domain_resolution.id='OLYMPUS';
  corrupted.domains[0].aliases.push('injected-alias');
  assert.deepEqual(read({seed_id:'T-1'}),before);
  assert.equal(JSON.stringify(read({seed_id:'T-1'})).includes('HYPOTHESIS::H-1'),false);
  const broad=createKnowledgeReader(tower),expected=broad({seed_id:'T-1'}),first=broad({seed_id:'T-1'});
  first.edges[0].kind='changed';first.edges[0].evidence.path='changed';
  assert.deepEqual(broad({seed_id:'T-1'}),expected);
});

test('revision, role and history readers remain isolated when interleaved',()=>{
  const tower=memoryFixture();tower.files['entities/hypothesis/H-1.json'].value.status='RETIRED';
  const current=createKnowledgeReader(tower),history=createKnowledgeReader(tower,{includeHistory:true});
  const narrow=createKnowledgeReader(tower,{allowedIds:new Set(['TEST::T-1'])});
  assert.throws(()=>current({seed_id:'H-1'}),/KNOWLEDGE_TARGET_UNAVAILABLE/);
  assert.equal(history({seed_id:'H-1',include_history:true}).nodes[0].state,'RETIRED');
  assert.throws(()=>history({seed_id:'H-1'}),/KNOWLEDGE_HISTORY_SCOPE_CONFLICT/);
  assert.throws(()=>narrow({seed_id:'H-1'}),/KNOWLEDGE_TARGET_UNAVAILABLE/);
  const newTower=structuredClone(tower);newTower.revision=newTower.state_fingerprint='sha256:'+'b'.repeat(64);
  const newer=createKnowledgeReader(newTower);
  assert.equal(current({seed_id:'T-1'}).source_revision,tower.revision);
  assert.equal(newer({seed_id:'T-1'}).source_revision,newTower.revision);
});
