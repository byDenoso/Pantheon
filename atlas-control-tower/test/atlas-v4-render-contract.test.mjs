import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const canvas=fs.readFileSync(new URL('src/scene/AtlasCanvas.tsx',root),'utf8');
const app=fs.readFileSync(new URL('src/atlas-v3/AtlasV3App.tsx',root),'utf8');

test('V4 camera handles explicit fit-selection without resetting the universe',()=>{
  assert.match(canvas,/atlas:fit-selection/);
  assert.match(canvas,/fitSelection/);
  assert.match(canvas,/cameraDistanceForPresentation\(focusType/);
});

test('V4 exposes a screen-reader representation of the currently visible graph',()=>{
  assert.match(app,/atlas-visible-summary/);
  assert.match(app,/aria-label="Entidades visíveis no Atlas"/);
  assert.match(app,/layerGraph\.nodes/);
});
