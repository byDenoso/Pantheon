import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const rendererUrl=new URL('../src/graph-engine/GraphRenderer.tsx',import.meta.url);

test('active graph surface is the full interactive Spatial Canvas without rollback chrome',async()=>{
  const source=await readFile(rendererUrl,'utf8');
  assert.match(source,/graph-renderer-canvas graph-renderer-spatial/);
  assert.match(source,/<Canvas25DGraph/);
  assert.doesNotMatch(source,/graph-renderer-rollback|graph-renderer-switch|GraphScene3D/);
});
