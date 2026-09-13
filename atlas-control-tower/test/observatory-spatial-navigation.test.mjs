import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const route=fs.readFileSync(new URL('../src/atlas-route.ts',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../src/pages/ObservatorySpatialPage.tsx',import.meta.url),'utf8');
const renderer=fs.readFileSync(new URL('../src/graph-engine/GraphRenderer.tsx',import.meta.url),'utf8');

test('Graphs is no longer a primary product area and Observatory owns spatial entry',()=>{
  assert.doesNotMatch(app,/label:\s*['"]GRAFOS['"]/);
  assert.doesNotMatch(app,/route\.area\s*===\s*['"]graphs['"]/);
  assert.match(app,/routeFor\(['"]observatory['"]/);
  assert.match(app,/ObservatoryPage/);
});

test('legacy graphs URLs normalize into Observatory instead of remaining a product area',()=>{
  assert.doesNotMatch(route,/export type AtlasArea\s*=\s*['"]graphs['"]/);
  assert.match(route,/graphs/);
  assert.match(route,/observatory/);
  assert.match(route,/legacy|compat|normalize/i);
});

test('Observatory embeds the spatial map and removes the old compact graph handoff',()=>{
  assert.match(page,/ObservatorySpatialMap/);
  assert.doesNotMatch(page,/ABRIR NO MODO GRAFOS/);
  assert.doesNotMatch(page,/CompactGraph/);
});

test('product graph renderer is Canvas 2.5D only with no visible WebGL switch',()=>{
  assert.match(renderer,/GraphExplorer/);
  assert.doesNotMatch(renderer,/graph-renderer-switch/);
  assert.doesNotMatch(renderer,/switchRenderer/);
});