import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const cssUrl=new URL('../src/design/graph-3d.css',import.meta.url);
const rendererUrl=new URL('../src/graph-engine/GraphRenderer.tsx',import.meta.url);

test('2D fallback wrapper preserves full graph height',async()=>{
  const css=await readFile(cssUrl,'utf8');
  assert.match(css,/\.graph-renderer-rollback\{[^}]*height:100%/s);
  assert.match(css,/\.graph-renderer-rollback>\.graph-v2-shell\{[^}]*height:100%/s);
});

test('2D fallback remains an interactive canvas surface (Canvas25DGraph, swapped from GraphExplorer/Pixi per an explicit user request)',async()=>{
  const source=await readFile(rendererUrl,'utf8');
  assert.match(source,/graph-renderer-rollback/);
  assert.match(source,/<Canvas25DGraph /);
});
