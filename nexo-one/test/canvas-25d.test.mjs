import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const text=path=>readFile(new URL(path,root),'utf8');

test('active graph surfaces use Canvas 2.5D instead of WebGL force graph',async()=>{
  const [atlas,mcp,canvas]=await Promise.all([
    text('src/features/system/Atlas.tsx'),
    text('src/mcp/McpAtlasApp.tsx'),
    text('src/components/CanvasGraph25D.tsx'),
  ]);
  assert.match(atlas,/AtlasCanvas25D/);
  assert.doesNotMatch(atlas,/AtlasWebGL3D/);
  assert.match(mcp,/CanvasGraph25D/);
  assert.doesNotMatch(mcp,/react-force-graph-3d|ForceGraph3D/);
  assert.match(canvas,/getContext\('2d'/);
  assert.match(canvas,/data-renderer="canvas-2\.5d"/);
  assert.match(canvas,/onPointerMove/);
});
