import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const canvas=fs.readFileSync(new URL('../src/scene/AtlasCanvas.tsx',import.meta.url),'utf8');

test('renderer error boundary degrades to Canvas instead of blanking the Atlas',()=>{
  assert.match(canvas,/CanvasErrorBoundary/);
  assert.match(canvas,/fallback=\{fallback\}/);
});
