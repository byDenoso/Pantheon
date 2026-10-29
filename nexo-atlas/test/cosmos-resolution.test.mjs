import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canvasResolution, PIXEL_BUDGET} from '../src/tower-web/resolution.ts';

test('desktop Retina renders real 2× pixels when within budget', () => {
  assert.deepEqual(canvasResolution(1248, 644, 2, 'high'), {overlayDpr: 2, glDpr: 2});
});
test('mobile low-detail cloud remains crisp while labels keep 2× sampling', () => {
  assert.deepEqual(canvasResolution(390, 644, 3, 'low'), {overlayDpr: 2, glDpr: 1.5});
});
test('low geometric detail on desktop does not force a 1× bitmap', () => {
  const {glDpr} = canvasResolution(1248, 644, 2, 'low');
  assert.ok(glDpr > 1.49 && glDpr <= 1.5);
  assert.ok(1248 * 644 * glDpr ** 2 <= PIXEL_BUDGET.low + 1);
});
test('measured slow frames fall back to 1× cloud, preserving crisp labels', () => {
  assert.deepEqual(canvasResolution(390, 644, 3, 'low', true), {overlayDpr: 2, glDpr: 1});
});
test('supersampling is bounded for large desktop buffers and native low-DPR displays', () => {
  for (const quality of ['low', 'high']) {
    const r = canvasResolution(1920, 1080, 3, quality);
    assert.ok(1920 * 1080 * r.overlayDpr ** 2 <= PIXEL_BUDGET.overlay + 1);
    assert.ok(1920 * 1080 * r.glDpr ** 2 <= Math.max(1920 * 1080, PIXEL_BUDGET[quality]) + 1);
  }
  assert.deepEqual(canvasResolution(1248, 644, 1, 'high'), {overlayDpr: 1, glDpr: 1});
  assert.deepEqual(canvasResolution(390, 644, NaN, 'high'), {overlayDpr: 1, glDpr: 1});
});
test('the GL layer receives its own DPR and display-change listeners are cleaned up', () => {
  const source = readFileSync(new URL('../src/tower-web/TowerCosmos.tsx', import.meta.url), 'utf8');
  assert.match(source, /gl\.render\(\{cam: f\.cam, w, h, dpr: glDpr/);
  assert.match(source, /screenDpr\.addEventListener\('change', onDpr\)/);
  assert.match(source, /return \(\) => \{ ro\.disconnect\(\); screenDpr\.removeEventListener\('change', onDpr\)/);
});
