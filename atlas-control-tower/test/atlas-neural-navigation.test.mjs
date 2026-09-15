import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const canvas = read('../src/scene/AtlasCanvas.tsx');
const fallback = read('../src/scene/CanvasGraphFallback.tsx');
const app = read('../src/atlas-v3/AtlasV3App.tsx');

test('neural WebGL navigation keeps a reusable view history and explicit global reset', () => {
  for (const marker of ['atlas:reset-view', 'viewHistory', 'onDoubleClick', 'enableDamping', 'enablePan', 'enableZoom']) {
    assert.match(canvas, new RegExp(marker.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));
  }
});

test('neural Canvas fallback supports smooth drag, pinch and double-click focus', () => {
  for (const marker of ['pointers', 'pinch', 'requestAnimationFrame', 'dblclick', 'velocity', 'touchAction']) {
    assert.match(fallback, new RegExp(marker.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));
  }
});

test('neural HUD exposes the global reset view action', () => {
  assert.match(app, /Reset view/);
  assert.match(app, /data-testid=["']atlas-reset-view["']/);
});

test('embedded Neural surface anchors Projection V3 reads to the published atlas-v3 base path', () => {
  assert.match(app, /loadAtlasV3Snapshot\(new URL\(['"]atlas-v3\/['"],window\.location\.href\)\.href\)/);
});

test('embedded Neural surface opts into the Atlas full-height workspace contract', () => {
  assert.match(app, /atlas-v3-shell--embedded[^`]*spatial-knowledge-page/);
});
