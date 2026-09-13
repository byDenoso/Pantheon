import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLearnerRenderInstruction, resolveLearnerLayer } from '../src/graph-engine/learner-overlay.ts';

const NOW = Date.parse('2026-09-13T20:00:00Z');

function filament(overrides = {}) {
  return {
    id: 'lf1',
    sourceNodeId: 'campaign:gz-01-b02',
    targetNodeId: null,
    state: 'pending',
    observedAt: null,
    sourceRef: null,
    consumptionProof: null,
    ...overrides
  };
}

test('active with target, fresh proof and known target renders an animated line', () => {
  const result = resolveLearnerRenderInstruction(
    filament({
      state: 'active',
      targetNodeId: 'domain:science',
      consumptionProof: { receiptId: 'r1', observedAt: '2026-09-13T18:00:00Z' }
    }),
    NOW
  );
  assert.equal(result.geometry, 'animated-line');
  assert.equal(result.animated, true);
});

test('active without consumptionProof never animates, even if declared active', () => {
  const result = resolveLearnerRenderInstruction(
    filament({ state: 'active', targetNodeId: 'domain:science', consumptionProof: null }),
    NOW
  );
  assert.notEqual(result.geometry, 'animated-line');
  assert.equal(result.animated, false);
});

test('active with targetNodeId null never renders a line, regardless of proof', () => {
  const result = resolveLearnerRenderInstruction(
    filament({
      state: 'active',
      targetNodeId: null,
      consumptionProof: { receiptId: 'r1', observedAt: '2026-09-13T18:00:00Z' }
    }),
    NOW
  );
  assert.equal(result.geometry, 'badge');
  assert.equal(result.animated, false);
});

test('active with stale proof (outside freshness window) does not animate', () => {
  const result = resolveLearnerRenderInstruction(
    filament({
      state: 'active',
      targetNodeId: 'domain:science',
      consumptionProof: { receiptId: 'r1', observedAt: '2026-09-10T18:00:00Z' } // 3 days old
    }),
    NOW
  );
  assert.notEqual(result.geometry, 'animated-line');
  assert.equal(result.animated, false);
});

test('pending with known target renders a static (non-animated) line', () => {
  const result = resolveLearnerRenderInstruction(filament({ state: 'pending', targetNodeId: 'campaign:c2' }), NOW);
  assert.equal(result.geometry, 'static-line');
  assert.equal(result.animated, false);
});

test('pending with unknown target renders only a badge on the source, zero line', () => {
  const result = resolveLearnerRenderInstruction(filament({ state: 'pending', targetNodeId: null }), NOW);
  assert.equal(result.geometry, 'badge');
});

test('disabled renders no geometry at all, only legend text', () => {
  const result = resolveLearnerRenderInstruction(filament({ state: 'disabled', targetNodeId: 'campaign:c2' }), NOW);
  assert.equal(result.geometry, 'none');
  assert.equal(result.legendText, 'Learner: desabilitado');
});

test('unknown renders no geometry at all, only legend text', () => {
  const result = resolveLearnerRenderInstruction(filament({ state: 'unknown', targetNodeId: 'campaign:c2' }), NOW);
  assert.equal(result.geometry, 'none');
  assert.equal(result.legendText, 'Learner: status desconhecido');
});

test('stale renders a static desaturated line with an explicit age when target is known', () => {
  const result = resolveLearnerRenderInstruction(
    filament({ state: 'stale', targetNodeId: 'campaign:c2', observedAt: '2026-09-12T20:00:00Z' }),
    NOW
  );
  assert.equal(result.geometry, 'static-line');
  assert.equal(result.desaturated, true);
  assert.equal(result.ageLabel, 'há 24h');
});

test('stale with unknown target renders only a desaturated badge with age, never a line', () => {
  const result = resolveLearnerRenderInstruction(
    filament({ state: 'stale', targetNodeId: null, observedAt: '2026-09-12T20:00:00Z' }),
    NOW
  );
  assert.equal(result.geometry, 'badge');
  assert.equal(result.desaturated, true);
  assert.ok(result.ageLabel);
});

test('reference snapshot from the audit: scheduler disabled, one pending inbox item, no confirmed target', () => {
  // This is the exact state the PDF documents today: LEARNER enabled:false,
  // inbox_count:1, no confirmed downstream target. The map must show pending/disabled
  // with zero invented line and zero particle -- never "active".
  const layer = resolveLearnerLayer(
    [
      filament({
        id: 'gz-01-b02-handoff',
        sourceNodeId: 'campaign:gz-01-b02',
        targetNodeId: null,
        state: 'pending'
      })
    ],
    NOW
  );
  assert.equal(layer.length, 1);
  assert.equal(layer[0].geometry, 'badge');
  assert.equal(layer[0].animated, false);
});

test('resolveLearnerLayer is pure and does not mutate its input', () => {
  const input = [filament({ state: 'active', targetNodeId: 'x', consumptionProof: { receiptId: 'r', observedAt: '2020-01-01T00:00:00Z' } })];
  const snapshot = JSON.parse(JSON.stringify(input));
  resolveLearnerLayer(input, NOW);
  assert.deepEqual(input, snapshot);
});
