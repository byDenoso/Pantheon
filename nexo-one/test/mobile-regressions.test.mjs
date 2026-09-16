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
  const atlas = await text('src/components/Atlas3DCanvas.tsx');
  assert.match(atlas, /aria-label="Girar mapa para a esquerda"/);
  assert.match(atlas, /aria-label="Girar mapa para a direita"/);
  assert.match(atlas, /aria-label="Aproximar mapa"/);
  assert.match(atlas, /aria-label="Afastar mapa"/);
  assert.match(atlas, /camera\.alpha/);
  assert.match(atlas, /camera\.radius/);
});
