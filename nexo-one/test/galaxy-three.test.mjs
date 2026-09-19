import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('active Atlas renderer is a procedural raw Three.js galaxy with Canvas fallback',async()=>{
  const [view,adapter,three]=await Promise.all([
    text('src/features/system/Atlas.tsx'),
    text('src/components/AtlasGalaxyRenderer.tsx'),
    text('src/components/GalaxyThree3D.tsx'),
  ]);
  assert.match(view,/AtlasGalaxyRenderer/);
  assert.doesNotMatch(view,/<AtlasCanvas25D/);
  assert.match(adapter,/hasWebGL2/);
  assert.match(adapter,/GalaxyThree3D/);
  assert.match(adapter,/AtlasCanvas25D/);
  assert.match(three,/new WebGLRenderer/);
  assert.match(three,/buildGalaxyGeometry/);
  assert.match(three,/ShaderMaterial/);
  assert.match(three,/UnrealBloomPass/);
  assert.doesNotMatch(three,/ForceGraph3D|react-force-graph-3d/);
});

test('procedural galaxy uses dense particles instead of luminous arm polylines',async()=>{
  const three=await text('src/components/GalaxyThree3D.tsx');
  assert.match(three,/particleCount = isMacro \? \(isMobile \? 4200 : 11000\) : \(isMobile \? 26000 : 68000\)/);
  assert.match(three,/signaturePoint/);
  assert.match(three,/galaxyArmPoint/);
  assert.match(three,/gaussian\(random\)/);
  assert.match(three,/AdditiveBlending/);
  assert.match(three,/gl_PointCoord/);
  assert.match(three,/data-renderer="three-procedural-galaxy"/);
});

test('three galaxy keeps semantic camera API compatible with tours and search',async()=>{
  const three=await text('src/components/GalaxyThree3D.tsx');
  assert.match(three,/forwardRef<CanvasGraph25DHandle/);
  assert.match(three,/focusDomain:/);
  assert.match(three,/focusSubdomain:/);
  assert.match(three,/focusEntity:/);
  assert.match(three,/focusPoint:/);
  assert.match(three,/getView:/);
  assert.match(three,/OrbitControls/);
});

test('macro scene derives missing domain anchors from the Galaxy snapshot',async()=>{
  const view=await text('src/features/system/Atlas.tsx');
  assert.match(view,/visualDomainNode/);
  assert.match(view,/galaxySnapshot\.domains/);
  assert.match(view,/graphForView/);
  assert.match(view,/galaxy:\/\/projection\/domain/);
  assert.match(view,/filterGraph\(graphForView, filters\)/);
});

test('mobile profile reduces GPU particle and pixel load without changing topology',async()=>{
  const three=await text('src/components/GalaxyThree3D.tsx');
  assert.match(three,/isMacro \? \(isMobile \? 4200 : 11000\) : \(isMobile \? 26000 : 68000\)/);
  assert.match(three,/isMobile \? 1\.45 : 1\.9/);
  assert.match(three,/if \(!isMobile && !isMacro && themeName === 'dark'\) \{/);
  assert.match(three,/data-particle-profile=\{isMobile \? 'mobile' : 'desktop'\}/);
});


test('macro overview uses deterministic domain anchors and explicit renderer mode',async()=>{
  const [view,layout,adapter,three]=await Promise.all([
    text('src/features/system/Atlas.tsx'),
    text('src/viewmodels/graph3d.ts'),
    text('src/components/AtlasGalaxyRenderer.tsx'),
    text('src/components/GalaxyThree3D.tsx'),
  ]);
  assert.match(layout,/layoutMacroDomains/);
  assert.match(layout,/SCIENCE: \{ x: 92, y: 18, z: -8 \}/);
  assert.match(layout,/ENGINEERING: \{ x: -84, y: 52, z: 8 \}/);
  assert.match(layout,/OLYMPUS: \{ x: -68, y: -58, z: -6 \}/);
  assert.match(view,/isMacroOverview/);
  assert.match(view,/layoutMacroDomains\(renderGraph\.nodes\)/);
  assert.match(view,/viewMode=\{isMacroOverview \? 'macro' : 'detail'\}/);
  assert.match(adapter,/viewMode\?: 'macro' \| 'detail'/);
  assert.match(three,/data-view-mode=\{viewMode\}/);
});
