import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('published shell does not mount the legacy projection overlay that probes /api/projections', async () => {
  const main = await text('src/main.tsx');
  assert.doesNotMatch(main, /ProjectionBusStatus/);
  assert.doesNotMatch(main, /<ProjectionBusStatus\s*\/>/);
});

test('Atlas exposes explicit touch navigation controls for mobile instead of depending only on gestures', async () => {
  const atlas = await text('src/components/AtlasCanvas25D.tsx');
  assert.match(atlas, /aria-label="Girar mapa para a esquerda"/);
  assert.match(atlas, /aria-label="Girar mapa para a direita"/);
  assert.match(atlas, /aria-label="Aproximar mapa"/);
  assert.match(atlas, /aria-label="Afastar mapa"/);
  assert.match(atlas, /camera\.rotation/);
  assert.match(atlas, /camera\.zoom/);
});

test('Atlas uses Canvas 2.5D as the active renderer and keeps WebGL out of the path', async () => {
  const atlas = await text('src/components/AtlasCanvas25D.tsx');
  const view = await text('src/features/system/Atlas.tsx');
  assert.match(atlas, /data-renderer="canvas-25d"/);
  assert.match(atlas, /getContext\('2d'\)/);
  assert.match(atlas, /Math\.pow\(afterDistance \/ beforeDistance, 1\.35\)/);
  assert.doesNotMatch(atlas, /@babylonjs|BABYLON|Engine\(/);
  assert.match(view, /AtlasCanvas25D/);
});

test('Atlas orbit wraps a full 360 degrees and renders backend learning edges by scope', async () => {
  const atlas = await text('src/components/AtlasCanvas25D.tsx');
  assert.match(atlas, /wrapAngle/);
  assert.match(atlas, /camera\.tilt = wrapAngle/);
  assert.match(atlas, /edge\.is_learning/);
  assert.match(atlas, /edge\.learning_scope === 'INTER_DOMAIN'/);
  assert.match(atlas, /edge\.learning_scope === 'INTER_DOMAIN' \? '#bd8cff' : '#44d9ff'/);
});

test('Atlas surfaces backend learning scope counts beside the filament toggle', async () => {
  const view = await text('src/features/system/Atlas.tsx');
  assert.match(view, /filtered\.edges\.filter\(edge => edge\.is_learning\)/);
  assert.match(view, /learningInterDomain/);
  assert.match(view, /learningIntraDomain/);
  assert.match(view, /interdomínio/);
  assert.match(view, /intradomínio/);
});
