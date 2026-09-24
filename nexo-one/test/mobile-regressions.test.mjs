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

test('Canvas galaxy exposes explicit navigation controls in addition to gestures', async () => {
  const canvas = await text('src/components/CanvasGraph25D.tsx');
  assert.match(canvas, /aria-label="Girar para a esquerda"/);
  assert.match(canvas, /aria-label="Girar para a direita"/);
  assert.match(canvas, /aria-label="Aproximar"/);
  assert.match(canvas, /aria-label="Afastar"/);
  assert.match(canvas, /onPointerMove/);
  assert.match(canvas, /onWheel=/);
});

test('Atlas adapts density and interaction budgets for mobile viewports', async () => {
  const [canvas,styles] = await Promise.all([
    text('src/components/CanvasGraph25D.tsx'),
    text('src/components/CanvasGraph25D.css'),
  ]);
  assert.match(canvas, /size\.width<760\?720:1500/);
  assert.match(canvas, /size\.width<760\?420:1100/);
  assert.match(canvas, /size\.width<760\?14:34/);
  assert.match(canvas, /pointersRef/);
  assert.match(canvas, /newDistance\/oldDistance/);
  assert.match(styles, /touch-action:\s*none/);
});

test('Canvas relation rendering keeps both visible endpoints and promotes selected links', async () => {
  const canvas = await text('src/components/CanvasGraph25D.tsx');
  assert.match(canvas, /screenById\.has\(edge\.from\)/);
  assert.match(canvas, /screenById\.has\(edge\.to\)/);
  assert.match(canvas, /screenById\.get\(edge\.from\)/);
  assert.match(canvas, /screenById\.get\(edge\.to\)/);
  assert.match(canvas, /selected\?1\.75/);
  assert.match(canvas, /quadraticCurveTo/);
});
