import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/atlas-v3/index.html', import.meta.url), 'utf8');
const js = await readFile(new URL('../public/atlas-v3/atlas-v3.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/atlas-v3/atlas-v3.css', import.meta.url), 'utf8');

test('Atlas V3 exposes the approved orbital workspace instead of a dashboard-first shell', () => {
  assert.match(html, /id="graph-world"/);
  assert.match(html, /id="nexo-core"/);
  assert.match(html, /class="graph-controls"/);
  assert.match(html, /id="graph-search"/);
  assert.match(html, /Buscar entidade, work, hipótese/);
  assert.match(css, /\.nexo-core/);
  assert.match(css, /\.cluster-hub/);
  assert.match(css, /\.orbit-ring/);
  assert.match(css, /\.starfield/);
});

test('orbital graph stays a presentation over canonical snapshot nodes', () => {
  assert.match(js, /presentationOnly/);
  assert.match(js, /clusterKey/);
  assert.match(js, /orbitalLayout/);
  assert.match(js, /snapshot\.graph\.root/);
  assert.doesNotMatch(js, /snapshot\.graph\.root\.nodes\.push/);
  assert.doesNotMatch(js, /snapshot\.entities\[['"]NEXO['"]\]/);
});

test('graph navigation supports zoom, pan, reset and search without inventing entities', () => {
  for (const id of ['zoom-in', 'zoom-out', 'reset-view']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(js, /wheel/);
  assert.match(js, /pointerdown/);
  assert.match(js, /graph-search/);
  assert.match(js, /state\.snapshot\.graph\.root\.nodes/);
});

test('browser status is honest about snapshot freshness and never labels reload as Tower sync', () => {
  assert.match(html, /recarregar snapshot/i);
  assert.doesNotMatch(html, /sincronizar projeção/i);
  assert.doesNotMatch(html, /Sync OK|Last sync: live/i);
  assert.match(js, /manifest\.freshness|m\.freshness/);
  assert.match(js, /generatedAt/);
});

test('reduced motion has an explicit no-animation path', () => {
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
