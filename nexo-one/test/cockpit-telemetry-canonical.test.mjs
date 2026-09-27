import test from 'node:test';
import assert from 'node:assert/strict';
import { telemetryOf, canonicalTestPhase } from '../src/viewmodels/missions.ts';

const wrapped = value => ({ value, unavailable_reason: null, source_ref: 'tower://t', fingerprint: 'sha256:x' });

/** The render graph only ever carries DONE/READY/BLOCKED status_group buckets. */
const graphNode = (id, status_group) => ({ id, type: 'TEST', label: id, domain: 'SCIENCE', state: 'SNAPSHOT', status_group });

const stateWith = tests => ({
  generated_at: '2026-09-27T14:58:09.000Z',
  bus: { fingerprint: 'sha256:573f103c1c8a18a469eb900b782a79a3c63d8175e9871f106c32678ed83f34e1' },
  science_projection_v1: tests ? { tests } : undefined,
  graph: {
    nodes: [graphNode('t1', 'DONE'), graphNode('t2', 'DONE'), graphNode('t3', 'READY')],
    edges: [],
  },
});

test('canonical status maps to the same phases the Tower lanes use', () => {
  assert.equal(canonicalTestPhase(wrapped('CHECKPOINTED')), 'RUNNING');
  assert.equal(canonicalTestPhase(wrapped('READY')), 'READY');
  for (const done of ['DONE', 'VERIFIED', 'REJECTED']) assert.equal(canonicalTestPhase(wrapped(done)), 'DONE');
  assert.equal(canonicalTestPhase(wrapped('BLOCKED_INPUT')), 'BLOCKED');
  // RESULT is deliberately uncounted by lanesFromProjection; do not invent a bucket for it.
  assert.equal(canonicalTestPhase(wrapped('RESULT')), null);
  assert.equal(canonicalTestPhase('CHECKPOINTED'), 'RUNNING', 'plain strings work too');
  assert.equal(canonicalTestPhase(undefined), null);
});

test('running tests are reported, not silently flattened to zero by the render graph', () => {
  const telemetry = telemetryOf(stateWith([
    { status: wrapped('CHECKPOINTED') },
    { status: wrapped('CHECKPOINTED') },
    { status: wrapped('READY') },
    { status: wrapped('DONE') },
    { status: wrapped('VERIFIED') },
    { status: wrapped('REJECTED') },
    { status: wrapped('RESULT') },
  ]), []);
  assert.equal(telemetry.running, 2, 'CHECKPOINTED is in-flight work and must surface');
  assert.equal(telemetry.ready, 1);
  assert.equal(telemetry.done, 3);
  assert.equal(telemetry.tests, 7, 'total counts every canonical test, including uncounted phases');
});

test('headline counters never come from the graph while a canonical projection exists', () => {
  // The graph disagrees on purpose: 2 DONE / 1 READY / no RUNNING bucket at all.
  const telemetry = telemetryOf(stateWith([{ status: wrapped('CHECKPOINTED') }]), []);
  assert.equal(telemetry.running, 1);
  assert.equal(telemetry.done, 0, 'graph DONE nodes must not leak into the canonical count');
  assert.equal(telemetry.tests, 1);
});

test('falls back to the graph when no canonical projection is published', () => {
  const telemetry = telemetryOf(stateWith(null), []);
  assert.equal(telemetry.tests, 3);
  assert.equal(telemetry.done, 2);
  assert.equal(telemetry.ready, 1);
  assert.equal(telemetry.running, 0);
});
