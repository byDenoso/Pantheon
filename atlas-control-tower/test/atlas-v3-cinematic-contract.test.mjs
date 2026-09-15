import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const exists=path=>fs.existsSync(new URL(path,root));

test('Atlas V3 is a bundled R3F multi-page entry instead of the legacy SVG renderer',()=>{
  assert.equal(exists('atlas-v3/index.html'),true,'atlas-v3/index.html must be a Vite page input');
  assert.equal(exists('src/atlas-v3/AtlasV3App.tsx'),true,'React V3 app must exist');
  assert.equal(exists('src/atlas-v3/scene-adapter.mjs'),true,'Projection V3 scene adapter must exist');
  assert.equal(exists('public/atlas-v3/atlas-v3.js'),false,'legacy SVG renderer must be removed');
  const vite=read('vite.config.ts');assert.match(vite,/atlas-v3\/index\.html/);
  const app=read('src/atlas-v3/AtlasV3App.tsx');assert.match(app,/AtlasCanvas/);assert.match(app,/data-testid=["']atlas-v3-stage["']/);assert.match(app,/TOWER_V06/);assert.match(app,/Projeção indisponível/);assert.match(app,/O Atlas não inventará um estado substituto\./);
});

test('cinematic scene keeps presentation nodes outside canonical Projection V3 state',()=>{
  const adapter=read('src/atlas-v3/scene-adapter.mjs');assert.match(adapter,/__PRESENTATION_NEXO__/);assert.match(adapter,/__PRESENTATION_CLUSTER__/);assert.match(adapter,/presentationOnly:true/);assert.match(adapter,/layoutParent/);assert.doesNotMatch(adapter,/snapshot\.graph\.root\.nodes\.push/);
});

test('cinematic renderer exposes orbit pan zoom reduced motion adaptive quality and Canvas fallback',()=>{
  const canvas=read('src/scene/AtlasCanvas.tsx');
  assert.match(canvas,/CanvasGraphFallback/);assert.match(canvas,/reducedMotion/);assert.match(canvas,/DreiOrbitControls/);assert.match(canvas,/enablePan/);assert.match(canvas,/enableRotate/);assert.match(canvas,/enableZoom/);
  assert.match(canvas,/visibleBudget:compact\?70:180/);assert.match(canvas,/PerformanceMonitor/);assert.match(canvas,/setDpr/);
});
