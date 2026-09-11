import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('canvas-only renderer keeps structural depth inside Pixi instead of CSS transforms',()=>{
 const explorer=read('src/graph-engine/GraphExplorer.tsx');
 const css=read('src/design/graph-v2.css');
 assert.doesNotMatch(css,/rotateX\(|rotateY\(|perspective:\s*1400px|--graph-tilt-x|--graph-tilt-y/);
 assert.doesNotMatch(explorer,/style\.setProperty\('--graph-tilt/);
 assert.match(explorer,/projectCanvasNode/);
 assert.match(explorer,/depthScale/);
 assert.match(explorer,/depthAlpha/);
});

test('canvas label engine uses measured bounding boxes and preserves focus and selection',()=>{
 const source=read('src/graph-engine/canvas-layout.mjs');
 assert.match(source,/measureText/);
 assert.match(source,/placeCanvasLabels/);
 assert.match(source,/focusId/);
 assert.match(source,/selectedId/);
 assert.match(source,/boxesOverlap/);
});

test('canvas orbital layout centers focus and uses deterministic multi-ring cluster packing',async()=>{
 const layout=await import(new URL('../src/graph-engine/canvas-layout.mjs',import.meta.url));
 const nodes=[{id:'focus',type:'DOMAIN'},...Array.from({length:18},(_,i)=>({id:`n${i}`,type:'ENTITY',parentId:'focus'}))];
 const a=layout.layoutCanvasOrbit(nodes,{focusId:'focus',width:1200,height:800});
 const b=layout.layoutCanvasOrbit(nodes,{focusId:'focus',width:1200,height:800});
 assert.deepEqual(a,b);
 assert.equal(a.get('focus').x,600);
 assert.equal(a.get('focus').y,400);
 const radii=nodes.slice(1).map(n=>Math.round(Math.hypot(a.get(n.id).x-600,a.get(n.id).y-400)));
 assert.ok(new Set(radii).size>=2,'dense cluster must use multiple rings');
});

test('canvas label placement rejects overlaps among non-forced labels',async()=>{
 const layout=await import(new URL('../src/graph-engine/canvas-layout.mjs',import.meta.url));
 const items=[
  {id:'focus',label:'FOCUS',x:100,y:100,priority:100},
  {id:'a',label:'ALPHA-LONG',x:110,y:110,priority:10},
  {id:'b',label:'BETA-LONG',x:112,y:112,priority:9}
 ];
 const placed=layout.placeCanvasLabels(items,{focusId:'focus',selectedId:null,measureText:t=>t.length*9,fontHeight:14});
 assert.ok(placed.some(x=>x.id==='focus'));
 const ordinary=placed.filter(x=>x.id!=='focus');
 assert.ok(ordinary.length<=1);
});
