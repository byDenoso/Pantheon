import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('Atlas uses raw Three.js galaxy while Canvas 2.5D remains the non-WebGL fallback',async()=>{
  const [atlas,adapter,mcp,canvas,three]=await Promise.all([
    text('src/features/system/Atlas.tsx'),
    text('src/components/AtlasGalaxyRenderer.tsx'),
    text('src/mcp/McpAtlasApp.tsx'),
    text('src/components/CanvasGraph25D.tsx'),
    text('src/components/GalaxyThree3D.tsx'),
  ]);
  assert.match(atlas,/AtlasGalaxyRenderer/);
  assert.doesNotMatch(atlas,/AtlasWebGL3D/);
  assert.match(adapter,/AtlasCanvas25D/);
  assert.match(adapter,/hasWebGL2/);
  assert.match(three,/new WebGLRenderer/);
  assert.doesNotMatch(three,/react-force-graph-3d|ForceGraph3D/);
  assert.match(mcp,/CanvasGraph25D/);
  assert.doesNotMatch(mcp,/react-force-graph-3d|ForceGraph3D/);
  assert.match(canvas,/getContext\('2d'/);
  assert.match(canvas,/data-renderer="canvas-2\.5d"/);
  assert.match(canvas,/onPointerMove/);
});
