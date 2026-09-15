import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../atlas-v3/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/atlas-v3/AtlasV3App.tsx', import.meta.url), 'utf8');
const adapter = await readFile(new URL('../src/atlas-v3/scene-adapter.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/atlas-v3/atlas-v3.css', import.meta.url), 'utf8');
const canvas = await readFile(new URL('../src/scene/AtlasCanvas.tsx', import.meta.url), 'utf8');

test('Atlas V3 exposes the approved cinematic orbital workspace instead of a dashboard-first shell', () => {
  assert.match(html, /NEURAL V3/);
  assert.match(app, /AtlasCanvas/);
  assert.match(app, /className="control-dock/);
  assert.match(app, /atlas-v3-search/);
  assert.match(app, /Buscar campanha, grupo, claim ou work/);
  assert.match(css, /\.cinematic-stage/);
  assert.match(css, /\.brand-orbit/);
  assert.match(css, /radial-gradient/);
});

test('orbital graph stays a presentation over canonical snapshot nodes', () => {
  assert.match(adapter, /presentationOnly/);
  assert.match(adapter, /clusterKey/);
  assert.match(adapter, /__PRESENTATION_NEXO__/);
  assert.match(adapter, /snapshot\?\.graph\?\.root\?\.nodes/);
  assert.doesNotMatch(adapter, /snapshot\.graph\.root\.nodes\.push/);
});

test('graph navigation supports 3D orbit, pan, zoom, reset and search without inventing entities', () => {
  assert.match(canvas, /DreiOrbitControls/);
  assert.match(canvas, /enablePan/);
  assert.match(canvas, /enableRotate/);
  assert.match(canvas, /enableZoom/);
  assert.match(app, /Voltar ao NEXO/);
  assert.match(app, /searchResults/);
  assert.match(app, /canonicalIds/);
});

test('browser status is honest about snapshot freshness and never labels reload as Tower sync', () => {
  assert.match(app, /manifest\.freshness/);
  assert.match(app, /TOWER_V06/);
  assert.doesNotMatch(app, /Sync OK|Last sync: live/i);
});

test('reduced motion has an explicit no-animation path', () => {
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(app, /prefers-reduced-motion: reduce/);
});
