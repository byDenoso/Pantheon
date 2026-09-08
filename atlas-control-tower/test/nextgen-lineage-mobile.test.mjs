import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutGraph,labelPolicy} from '../nextgen/graph/engine.mjs';

const nodes=[
  {id:'claim:focus',type:'CLAIM',visualType:'CLAIM',zBand:-60},
  {id:'source:drive:file',type:'SOURCE',visualType:'SOURCE',zBand:190},
  {id:'source-ref:claim:focus:path',type:'SOURCE_REF',visualType:'SOURCE_REF',zBand:230}
];

const edges=[
  {source:'claim:focus',target:'source:drive:file',type:'OBSERVED_BY'},
  {source:'source:drive:file',target:'source-ref:claim:focus:path',type:'LOCATED_AT'}
];

const byId=positions=>new Map(positions.map(x=>[x.id,x]));

test('NextGen provenance flows vertically on narrow screens',()=>{
  const p=byId(layoutGraph(nodes,{focus:'claim:focus',semanticView:'provenance',viewportWidth:390,edges}));
  assert.ok(p.get('claim:focus').y < p.get('source:drive:file').y);
  assert.ok(p.get('source:drive:file').y < p.get('source-ref:claim:focus:path').y);
  assert.ok(Math.abs(p.get('claim:focus').x-p.get('source:drive:file').x) < 40);
});

test('NextGen provenance stays horizontal on desktop',()=>{
  const p=byId(layoutGraph(nodes,{focus:'claim:focus',semanticView:'provenance',viewportWidth:1280,edges}));
  assert.ok(p.get('claim:focus').x < p.get('source:drive:file').x);
  assert.ok(p.get('source:drive:file').x < p.get('source-ref:claim:focus:path').x);
  assert.ok(Math.abs(p.get('claim:focus').y-p.get('source:drive:file').y) < 40);
});

test('NextGen provenance raises the mobile label budget',()=>{
  const policy=labelPolicy(390,'provenance');
  assert.ok(policy.max>=16);
  assert.ok(policy.maxChars>=32);
});
