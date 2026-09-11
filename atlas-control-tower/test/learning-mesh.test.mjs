import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutLearningMesh, filamentPath } from '../src/data/learning-layout.ts';
import { readFileSync } from 'node:fs';

const model={available:true,contexts:[
 {id:'science',anchorId:'context:science',label:'Ciência'},
 {id:'engineering',anchorId:'context:engineering',label:'Engenharia'},
 {id:'operation',anchorId:'context:operation',label:'Operação'}
],items:[
 {id:'pattern:p1',stage:'PATTERN',label:'Pointer-first',status:'VALIDATED',domainA:'ENGINEERING'},
 {id:'lesson:l1',stage:'LESSON',label:'Reuse',status:'ACTIVE',domainA:'SCIENCE'}
],nodes:[],filaments:[
 {id:'a',source:'context:engineering',target:'pattern:p1',type:'association'},
 {id:'l',source:'pattern:p1',target:'lesson:l1',type:'lineage'},
 {id:'t',source:'context:engineering',target:'context:science',type:'transfer',confidence:.94}
],metrics:{total:2,promoted:1,crossDomain:1}};
test('learning layout keeps contexts stable and never creates a Learning hub',()=>{
 const layout=layoutLearningMesh(model);
 assert.equal(layout.points.some(point=>point.id==='system:LEARNING'||point.id==='context:learning'),false);
 assert.deepEqual(layout.points.find(point=>point.id==='context:science')?.position,[180,150]);
 assert.deepEqual(layout.points.find(point=>point.id==='context:engineering')?.position,[820,150]);
 assert.ok(layout.points.find(point=>point.id==='pattern:p1'));
});

test('filaments are curved and only keep endpoints present in layout',()=>{
 const layout=layoutLearningMesh(model);
 assert.equal(layout.filaments.length,3);
 const transfer=layout.filaments.find(item=>item.type==='transfer');
 const d=filamentPath(transfer,layout.byId);
 assert.match(d,/^M .* C .*$/);
});

test('renderer uses svg neural filaments and supports reduced motion',()=>{
 const source=readFileSync(new URL('../src/components/LearningMesh.tsx',import.meta.url),'utf8');
 assert.match(source,/<svg/);
 assert.match(source,/learning-filament/);
 assert.match(source,/reducedMotion/);
 assert.match(source,/animateMotion/);
 assert.doesNotMatch(source,/AtlasCanvas|system:LEARNING/);
});
