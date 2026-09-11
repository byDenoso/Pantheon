import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const exists=path=>fs.existsSync(new URL(path,root));

test('graph viewport policy is explicit and bounded',async()=>{
  assert.equal(exists('src/graph-engine/viewport.mjs'),true,'viewport policy module must exist');
  if(!exists('src/graph-engine/viewport.mjs'))return;
  const viewport=await import(new URL('../src/graph-engine/viewport.mjs',import.meta.url));
  assert.equal(viewport.clampGraphZoom(0.1),0.55);
  assert.equal(viewport.clampGraphZoom(4),2.4);
  assert.ok(viewport.graphDpr({devicePixelRatio:3,width:390,nodeCount:5000})<=1.25);
  assert.ok(viewport.graphDpr({devicePixelRatio:3,width:1440,nodeCount:100})<=2);
  for(const count of [100,1000,5000,10000]){
    const nodes=Array.from({length:count},(_,i)=>({id:`n:${i}`,type:i===0?'ROOT':'ENTITY'}));
    const visible=viewport.selectVisibleGraphNodes(nodes,{focusId:'n:0',selectedId:`n:${count-1}`,budget:viewport.graphNodeBudget({width:1280,nodeCount:count})});
    assert.ok(visible.length<=viewport.graphNodeBudget({width:1280,nodeCount:count}));
    assert.ok(visible.some(node=>node.id==='n:0'));
    assert.ok(visible.some(node=>node.id===`n:${count-1}`));
    assert.ok(viewport.graphLabelBudget({width:1280,nodeCount:count})<=visible.length);
  }
});

test('Pixi application stays persistent while graph state redraws incrementally',()=>{
  const source=read('src/graph-engine/GraphExplorer.tsx');
  assert.match(source,/appRef/);
  assert.match(source,/worldRef/);
  assert.match(source,/redrawRef/);
  assert.match(source,/latestRef\.current=\{projection,learningEdges,learning,selectedId,selectedEdgeId\}/);
  assert.match(source,/useEffect\(\(\)=>\{redrawRef\.current\?\.\(\)\},\[projection,learningEdges,learning,selectedId,selectedEdgeId\]\)/);
  assert.doesNotMatch(source,/host\.innerHTML=''/);
});

test('graph explorer supports pan zoom pinch reduced motion and context recovery',()=>{
  const source=read('src/graph-engine/GraphExplorer.tsx');
  for(const token of ['pointerdown','pointermove','pointerup','wheel','prefers-reduced-motion: reduce','webglcontextlost','webglcontextrestored','atlas:graph-metrics'])assert.match(source,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(source,/clampGraphZoom/);
  assert.match(source,/graphDpr/);
});

test('Learning filaments are selectable and have an inspector path',()=>{
  const source=read('src/graph-engine/GraphExplorer.tsx');
  assert.match(source,/onSelectEdge/);
  assert.match(source,/selectedEdgeId/);
  assert.match(source,/edgeHit/);
  assert.match(source,/RELAÇÃO LEARNING/);
  for(const page of ['GraphsV2Page.tsx','GraphDomainV2Page.tsx','GraphDetailV2Page.tsx']){
    const pageSource=read('src/pages/'+page);
    assert.match(pageSource,/params\.get\('edge'\)/);
    assert.match(pageSource,/onSelectEdge/);
  }
});

test('canvas has a keyboard-operable DOM accessibility mirror',()=>{
  const source=read('src/graph-engine/GraphExplorer.tsx');
  assert.match(source,/graph-v2-a11y/);
  assert.match(source,/aria-label=.*Selecionar/);
  assert.match(source,/onKeyDown|<button/);
});

test('graph v2 mobile and reduced-motion policy is explicit',()=>{
  const css=read('src/design/graph-v2.css');
  assert.match(css,/min-height:44px/);
  assert.match(css,/position:sticky/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/touch-action:none/);
});

test('Learning overlay reads the published Learning report rather than an empty relation endpoint',()=>{
  const source=read('src/graph-engine/useLearningOverlay.ts');
  assert.match(source,/api\.learning\(\)/);
  assert.doesNotMatch(source,/learningRelations\(\)/);
});
