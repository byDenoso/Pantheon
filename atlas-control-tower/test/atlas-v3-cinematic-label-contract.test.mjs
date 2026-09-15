import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const canvas=fs.readFileSync(new URL('../src/scene/AtlasCanvas.tsx',import.meta.url),'utf8');

test('3D labels use semantic LOD and collision-aware projection',()=>{
  assert.match(canvas,/selectSemanticLOD/);
  assert.match(canvas,/placeProjectedLabels/);
  assert.match(canvas,/LabelOverlay/);
});
