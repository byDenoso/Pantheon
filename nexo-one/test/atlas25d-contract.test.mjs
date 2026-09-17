import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const renderer = await readFile(new URL('../src/components/Atlas25DCanvas.tsx', import.meta.url), 'utf8');
const atlas = await readFile(new URL('../src/features/system/Atlas.tsx', import.meta.url), 'utf8');

test('Atlas render path uses Canvas 2D rather than Babylon/WebGL', () => {
  assert.match(renderer, /getContext\(['"]2d['"]\)/);
  assert.match(renderer, /requestAnimationFrame/);
  assert.doesNotMatch(renderer, /@babylonjs|WebGL|ArcRotateCamera|Engine\(/);
  assert.match(atlas, /Atlas25DCanvas/);
  assert.doesNotMatch(atlas, /Atlas3DCanvas/);
});

test('mobile interaction is gesture-first and removes the directional control grid', () => {
  assert.match(renderer, /pointerdown/);
  assert.match(renderer, /pointermove/);
  assert.match(renderer, /pointerup/);
  assert.match(renderer, /wheel/);
  assert.doesNotMatch(renderer, /atlas3d-mobile-nav|Girar mapa para a esquerda|Inclinar mapa para cima/);
});
