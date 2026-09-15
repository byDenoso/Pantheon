import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const canvas=fs.readFileSync(new URL('src/scene/AtlasCanvas.tsx',root),'utf8');
const fallback=fs.readFileSync(new URL('src/scene/CanvasGraphFallback.tsx',root),'utf8');

test('V3 inherits a usable Canvas fallback when WebGL is unavailable',()=>{
  assert.match(canvas,/CanvasGraphFallback/);
  assert.match(canvas,/canUseThreeRenderer/);
  assert.match(canvas,/CanvasErrorBoundary/);
  assert.match(canvas,/fallback=\{fallback\}/);
  assert.match(fallback,/Renderer 3D indisponível/);
});
