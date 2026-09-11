import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLineageLayout } from '../src/data/lineage-layout.ts';
import { readFileSync } from 'node:fs';

const model={focusId:'T1',nodes:[
 {id:'D3',type:'DOMAIN',label:'Domain'},{id:'H1',type:'CLAIM',label:'Claim'},
 {id:'T1',type:'TEST',label:'Test'},{id:'R1',type:'RESULT',label:'Result'}
],edges:[
 {source:'D3',target:'T1',type:'CONTAINS'},{source:'H1',target:'T1',type:'TESTS'},{source:'T1',target:'R1',type:'PRODUCES'}
]};

test('lineage layout is deterministic and progresses with edge direction',()=>{
 const a=buildLineageLayout(model),b=buildLineageLayout(model);
 assert.deepEqual(a,b);
 const by=new Map(a.nodes.map(x=>[x.id,x]));
 assert.ok(by.get('D3').x<by.get('T1').x);
 assert.ok(by.get('H1').x<by.get('T1').x);
 assert.ok(by.get('T1').x<by.get('R1').x);
});
test('lineage renderer is SVG, directed and not the structural graph renderer',()=>{
 const source=readFileSync(new URL('../src/components/LineageDag.tsx',import.meta.url),'utf8');
 assert.match(source,/<svg/);
 assert.match(source,/markerEnd|marker-end/);
 assert.match(source,/buildLineageLayout/);
 assert.doesNotMatch(source,/AtlasCanvas|LearningMesh|Canvas/);
});
