import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const canvas=fs.readFileSync(new URL('../src/scene/AtlasCanvas.tsx',import.meta.url),'utf8');

test('3D camera exposes rotate pan zoom damping and touch-capable OrbitControls',()=>{
  assert.match(canvas,/enablePan/);
  assert.match(canvas,/enableRotate/);
  assert.match(canvas,/enableZoom/);
  assert.match(canvas,/enableDamping/);
  assert.match(canvas,/DreiOrbitControls/);
});
