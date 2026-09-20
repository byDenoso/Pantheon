import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('active Atlas renderer is the semantic NEXO field with Canvas fallback',async()=>{
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
  assert.match(three,/buildFieldGeometry/);
  assert.match(three,/data-renderer="three-nexo-field"/);
  assert.doesNotMatch(three,/ForceGraph3D|react-force-graph-3d/);
});

test('NEXO field uses bounded domain-colored clusters',async()=>{
  const three=await text('src/components/GalaxyThree3D.tsx');
  assert.match(three,/particleCount = isMacro \? \(isMobile \? 180 : 760\) : \(isMobile \? 520 : 1800\)/);
  assert.match(three,/buildFieldGeometry/);
  assert.match(three,/domainColor/);
  assert.match(three,/aColor/);
  assert.match(three,/clusters\.length > 0/);
  assert.match(three,/GridHelper/);
  assert.match(three,/grid\.visible = !isMobile/);
  assert.match(three,/MOBILE_MACRO_CAMERA/);
  assert.match(three,/AdditiveBlending/);
});

test('semantic edges separate structure dependency blockers and selection',async()=>{
  const three=await text('src/components/GalaxyThree3D.tsx');
  assert.match(three,/LineDashedMaterial/);
  assert.match(three,/dependencyKinds/);
  assert.match(three,/blockedRelationMaterial/);
  assert.match(three,/relationSegments\.structural/);
  assert.match(three,/relationSegments\.dependency/);
  assert.match(three,/relationSegments\.blocked/);
  assert.match(three,/relationSegments\.selected/);
});

test('graph labels expose domain state and semantic hierarchy',async()=>{
  const [three,css]=await Promise.all([
    text('src/components/GalaxyThree3D.tsx'),
    text('src/components/GalaxyThree3D.css'),
  ]);
  assert.match(three,/data-domain=\{node\.domain\}/);
  assert.match(three,/data-state=\{stateClass\(node\.state\)\}/);
  assert.match(three,/node-status/);
  assert.match(three,/node-label-copy/);
  assert.match(css,/semantic graph appearance V2/);
  assert.match(css,/data-domain="ENGINEERING"/);
  assert.match(css,/data-state\*="block"/);
});

test('mobile macro field is compact flat and deterministic',async()=>{
  const [view,layout,three]=await Promise.all([
    text('src/features/system/Atlas.tsx'),
    text('src/viewmodels/graph3d.ts'),
    text('src/components/GalaxyThree3D.tsx'),
  ]);
  assert.match(layout,/SCIENCE: \{ x: -31, y: -6, z: -2 \}/);
  assert.match(layout,/ENGINEERING: \{ x: 0, y: 38, z: 2 \}/);
  assert.match(layout,/OLYMPUS: \{ x: 31, y: -6, z: -2 \}/);
  assert.match(view,/layoutMacroDomains\(renderGraph\.nodes, isMobile\)/);
  assert.match(three,/PerspectiveCamera\(isMobile \? 35 : 40/);
  assert.match(three,/controls\.enableRotate = !\(isMobile && isMacro\)/);
  assert.match(three,/data-particle-profile=\{isMobile \? 'mobile' : 'desktop'\}/);
});

test('camera API remains compatible with search tours and drill-down',async()=>{
  const three=await text('src/components/GalaxyThree3D.tsx');
  assert.match(three,/forwardRef<CanvasGraph25DHandle/);
  assert.match(three,/focusDomain:/);
  assert.match(three,/focusSubdomain:/);
  assert.match(three,/focusEntity:/);
  assert.match(three,/focusPoint:/);
  assert.match(three,/getView:/);
  assert.match(three,/OrbitControls/);
});


test('Atlas hierarchy is domain to campaign to tests and learning is overlay-only',async()=>{
  const [view,layout,contracts]=await Promise.all([
    text('src/features/system/Atlas.tsx'),
    text('src/viewmodels/graph3d.ts'),
    text('src/contracts/system.ts'),
  ]);
  assert.match(view,/const NO_CAMPAIGN = '__NO_CAMPAIGN__'/);
  assert.match(view,/campaignNodeId/);
  assert.match(view,/setExpandedCampaign/);
  assert.match(view,/canonicalCampaigns/);
  assert.match(view,/node\.type !== 'FILAMENT'/);
  assert.doesNotMatch(view,/!learningEndpointIds\.has/);
  assert.match(contracts,/\| 'DOMAIN' \| 'CAMPAIGN'/);
  assert.match(layout,/semanticType === 'CAMPAIGN'/);
  assert.match(layout,/semanticType === 'TEST'/);
  assert.match(layout,/semanticDepth/);
});

test('macro domain labels carry member counts and campaigns carry item counts',async()=>{
  const [view,three]=await Promise.all([
    text('src/features/system/Atlas.tsx'),
    text('src/components/GalaxyThree3D.tsx'),
  ]);
  assert.match(view,/member_count: graphForView\.nodes\.filter/);
  assert.match(three,/node\.member_count \?\? 0/);
  assert.match(three,/node\.type === 'CAMPAIGN'/);
});
