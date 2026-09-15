import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);

test('V3 inherits a usable Canvas fallback when WebGL is unavailable',()=>{
  const canvas=fs.readFileSync(new URL('src/scene/AtlasCanvas.tsx',root),'utf8');
  assert.match(canvas,/CanvasGraphFallback/);
  assert.match(canvas,/Renderer 3D indisponível/);
  assert.match(canvas,/if\(!threeEnabled\)/);
});
