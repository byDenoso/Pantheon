import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('GraphRenderer exposes only the Spatial Canvas path',()=>{
 const source=read('src/graph-engine/GraphRenderer.tsx');
 assert.match(source,/Canvas25DGraph/);
 assert.doesNotMatch(source,/GraphScene3D|renderer-mode|graph-renderer-switch|>WebGL</);
});

test('spatial label placement is deterministic and keeps forced labels',async()=>{
 const {placeSpatialLabels}=await import(new URL('../src/graph-engine/canvas-label-layout.mjs',import.meta.url));
 const items=[
  {id:'focus',x:100,y:100,width:80,height:18,priority:100,forced:true},
  {id:'selected',x:108,y:108,width:90,height:18,priority:90,forced:true},
  {id:'far-a',x:112,y:112,width:90,height:18,priority:5,forced:false},
  {id:'far-b',x:114,y:114,width:90,height:18,priority:4,forced:false}
 ];
 const first=placeSpatialLabels(items,{padding:4,maxOrdinary:8});
 const second=placeSpatialLabels(items,{padding:4,maxOrdinary:8});
 assert.deepEqual(first,second);
 assert.ok(first.some(x=>x.id==='focus'));
 assert.ok(first.some(x=>x.id==='selected'));
 assert.ok(first.filter(x=>x.id.startsWith('far-')).length<=1);
});

test('Canvas renderer uses depth-aware curved edges and label density control',()=>{
 const source=read('src/graph-engine/Canvas25DGraph.tsx');
 assert.match(source,/quadraticCurveTo|bezierCurveTo/);
 assert.match(source,/depthAlpha|edgeAlpha/);
 assert.match(source,/placeSpatialLabels/);
 assert.match(source,/maxOrdinary|labelBudget/);
});
