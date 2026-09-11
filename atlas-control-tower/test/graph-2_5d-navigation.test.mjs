import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');

test('graph surface uses viewport-sized canvas with floating inspector',()=>{
  const css=read('src/design/graph-v2.css');
  assert.match(css,/\.graphs-page\{[^}]*height:calc\(100dvh -/);
  assert.match(css,/\.graph-v2-main\{[^}]*position:absolute[^}]*inset:0/);
  assert.match(css,/\.graph-v2-inspector\{[^}]*position:absolute/);
  assert.doesNotMatch(css,/grid-template-columns:minmax\(0,1fr\) 320px/);
});

test('2.5D camera keeps Pixi 2D renderer and computes depth inside canvas',()=>{
  const source=read('src/graph-engine/GraphExplorer.tsx');
  const css=read('src/design/graph-v2.css');
  assert.match(source,/tiltX/);
  assert.match(source,/tiltY/);
  assert.match(source,/shiftKey/);
  assert.match(source,/projectCanvasNode/);
  assert.match(source,/depthScale/);
  assert.match(source,/depthAlpha/);
  assert.doesNotMatch(source,/--graph-tilt-x|--graph-tilt-y|translateZ\(0\)/);
  assert.doesNotMatch(css,/rotateX\(|rotateY\(|perspective:\s*1400px/);
  assert.doesNotMatch(source,/THREE|@react-three|Canvas from ['"]@react-three/);
});

test('label LOD tightens at distant zoom and expands when zooming in',async()=>{
  const viewport=await import(new URL('../src/graph-engine/viewport.mjs',import.meta.url));
  const far=viewport.graphLabelBudget({width:1440,nodeCount:500,zoom:.6});
  const normal=viewport.graphLabelBudget({width:1440,nodeCount:500,zoom:1});
  const near=viewport.graphLabelBudget({width:1440,nodeCount:500,zoom:2});
  assert.ok(far<=18,`far label budget too high: ${far}`);
  assert.ok(normal<=40,`normal label budget too high: ${normal}`);
  assert.ok(near>normal,'zooming in should reveal more labels');
  assert.ok(near<=90,`near label budget too high: ${near}`);
});

test('selected and focus labels remain visible under LOD',async()=>{
  const viewport=await import(new URL('../src/graph-engine/viewport.mjs',import.meta.url));
  const nodes=Array.from({length:80},(_,i)=>({id:`n:${i}`,type:i===0?'ROOT':'ENTITY'}));
  const labels=viewport.selectGraphLabelNodes(nodes,{focusId:'n:0',selectedId:'n:79',budget:8});
  assert.ok(labels.some(node=>node.id==='n:0'));
  assert.ok(labels.some(node=>node.id==='n:79'));
  assert.ok(labels.length<=8);
});
