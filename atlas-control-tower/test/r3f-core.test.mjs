import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticRank, selectSemanticLOD} from '../src/scene/semantic-lod.ts';
import {encodePickId, decodePickId} from '../src/scene/gpu-picking.ts';

const nodes = [
 {id:'result:1',type:'RESULT',status:'SUCCESS'},
 {id:'test:1',type:'TEST',status:'ACTIVE'},
 {id:'campaign:1',type:'CAMPAIGN'},
 {id:'domain:D7',type:'DOMAIN'},
 {id:'system:SCIENCE',type:'SYSTEM'},
 {id:'claim:block',type:'CLAIM',status:'BLOCKED'},
 {id:'run:1',type:'RUN'}
];

test('semantic rank prefers focus and selection before structural importance', () => {
 const ctx={selectedId:'test:1',focusId:'domain:D7'};
 assert.ok(semanticRank(nodes[1],ctx) > semanticRank(nodes[3],ctx));
 assert.ok(semanticRank(nodes[3],ctx) > semanticRank(nodes[4],{}));
 assert.ok(semanticRank(nodes[4],{}) > semanticRank(nodes[2],{}));
 assert.ok(semanticRank(nodes[5],{}) > semanticRank(nodes[1],{}));
 assert.ok(semanticRank(nodes[1],{}) > semanticRank(nodes[0],{}));
});

test('semantic LOD never drops selected/focus and obeys visible and label budgets', () => {
 const many=[...nodes,...Array.from({length:100},(_,i)=>({id:`result:${i+2}`,type:'RESULT',status:'SUCCESS'}))];
 const out=selectSemanticLOD(many,{selectedId:'result:99',focusId:'domain:D7',visibleBudget:18,labelBudget:6});
 assert.equal(out.visibleIds.has('result:99'),true);
 assert.equal(out.visibleIds.has('domain:D7'),true);
 assert.ok(out.visibleIds.size<=18);
 assert.ok(out.labelIds.size<=6);
 assert.equal(out.labelIds.has('result:99'),true);
 assert.equal(out.labelIds.has('domain:D7'),true);
});

test('semantic LOD is deterministic for identical inputs', () => {
 const a=selectSemanticLOD(nodes,{visibleBudget:5,labelBudget:3});
 const b=selectSemanticLOD(nodes,{visibleBudget:5,labelBudget:3});
 assert.deepEqual([...a.visibleIds],[...b.visibleIds]);
 assert.deepEqual([...a.labelIds],[...b.labelIds]);
});

test('GPU picking encodes stable 24-bit ids and reserves zero for background', () => {
 assert.equal(decodePickId([0,0,0,255]),0);
 for(const id of [1,255,256,65535,65536,0xFFFFFF]){
  const pixel=encodePickId(id);
  assert.equal(pixel[3],255);
  assert.equal(decodePickId(pixel),id);
 }
 assert.throws(()=>encodePickId(0),/positive/);
 assert.throws(()=>encodePickId(0x1000000),/24-bit/);
});
