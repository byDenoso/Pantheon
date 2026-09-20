import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('stage 2 exposes deterministic three-arm NEXO galaxy geometry',async()=>{
  const graph=await text('src/viewmodels/graph3d.ts');
  assert.match(graph,/PRIMARY_GALAXY_DOMAINS\s*=\s*\['SCIENCE', 'ENGINEERING', 'OLYMPUS'\]/);
  assert.match(graph,/galaxyArmPoint/);
  assert.match(graph,/galaxyArmPath/);
  assert.match(graph,/layoutGalaxy3D/);
  assert.match(graph,/return layoutGalaxy3D\(nodes\)/);
  assert.doesNotMatch(graph,/for \(let leftIndex = 0; leftIndex < placed\.length/);
});

test('stage 2 canvas has imperative focus camera, lod and bounded rendering',async()=>{
  const canvas=await text('src/components/CanvasGraph25D.tsx');
  assert.match(canvas,/forwardRef<CanvasGraph25DHandle/);
  assert.match(canvas,/focusDomain/);
  assert.match(canvas,/focusSubdomain/);
  assert.match(canvas,/focusEntity/);
  assert.match(canvas,/lodForZoom/);
  assert.match(canvas,/nodeBudget/);
  assert.match(canvas,/edgeBudget/);
  assert.match(canvas,/devicePixelRatio/);
  assert.match(canvas,/requestAnimationFrame/);
  assert.match(canvas,/pointersRef/);
  assert.match(canvas,/data-renderer="canvas-2\.5d"/);
  assert.doesNotMatch(canvas,/WebGL|ForceGraph3D|react-force-graph-3d/);
});

test('atlas consumes snapshot domain membership while the live graph owns field entities',async()=>{
  const [adapter,atlas]=await Promise.all([
    text('src/components/AtlasCanvas25D.tsx'),
    text('src/features/system/Atlas.tsx'),
  ]);
  assert.match(adapter,/PRIMARY_GALAXY_DOMAINS/);
  assert.match(adapter,/GALAXY_ARMS/);
  assert.match(adapter,/GALAXY_COLOR='#79e7ff'/);
  assert.doesNotMatch(adapter,/DOMAIN_COLOR|ALERT_COLOR/);
  assert.match(atlas,/useGalaxySnapshot\(state\)/);
  assert.match(atlas,/galaxySnapshot\.domains/);
  assert.match(atlas,/visualDomainNode/);
  assert.match(atlas,/graphForView/);
  assert.doesNotMatch(atlas,/galaxySnapshot\.entities/);
  assert.match(atlas,/<AtlasGalaxyRenderer ref=\{galaxyRef\}/);
  assert.match(atlas,/focusDomain/);
  assert.match(atlas,/focusSubdomain/);
  assert.match(atlas,/focusEntity/);
});
