import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('active Atlas canvas uses the 2.5D renderer without orbital positioning',async()=>{
  const source=await read('src/scene/AtlasCanvas.tsx');
  assert.match(source,/CanvasGraph25D/);
  assert.match(source,/data-renderer="canvas-2\.5d"/);
  assert.doesNotMatch(source,/CanvasGraphFallback/);
  assert.doesNotMatch(source,/buildOrbitalNodes/);
});

test('2.5D renderer stays Canvas-only and keeps approved gestures',async()=>{
  const source=await read('src/scene/CanvasGraph25D.tsx');
  assert.doesNotMatch(source,/@react-three|from ['"]three['"]|WebGL/);
  assert.match(source,/quadraticCurveTo/);
  assert.match(source,/pointerdown/);
  assert.match(source,/zoomCameraAt/);
  assert.match(source,/onNodeDoubleClick/);
  assert.match(source,/requestAnimationFrame/);
});

test('mobile layout removes the legacy six-button dock',async()=>{
  const css=await read('src/scene/canvas25d.css');
  assert.match(css,/@media \(max-width:760px\)/);
  assert.match(css,/\.atlas-v3-shell \.control-dock[^\{]*\{display:none!important\}/);
});
