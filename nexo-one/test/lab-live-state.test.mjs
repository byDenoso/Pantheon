import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLab } from '../src/features/lab/model.ts';
import { captureReading, publishedChanges, executionNow, latestDelivery, focusEntities } from '../src/features/lab/live-state.ts';

const lab = (tests, activity = []) => buildLab({ graph: { nodes: [], edges: [] }, generated_at: '2026-09-30T12:00:00Z', read_model: { tests, activity } });

test('live activity separates running from queued, dispatched and ready', () => {
  const current = executionNow(lab({ A: { status: 'READY' }, B: { status: 'QUEUED' }, C: { status: 'DISPATCHED' }, D: { status: 'RUNNING' } }));
  assert.deepEqual(current.running.map(t => t.id), ['D']);
  assert.deepEqual(current.queued.map(t => t.id), ['B']);
  assert.deepEqual(current.dispatched.map(t => t.id), ['C']);
  assert.deepEqual(current.ready.map(t => t.id), ['A']);
  assert.equal(executionNow(lab({ A: { status: 'READY' } })).running.length, 0);
});

test('unchanged reads and missing rows do not create fake activity', () => {
  const before = lab({ A: { status: 'READY' }, B: { status: 'DONE' } });
  assert.deepEqual(publishedChanges(captureReading(before), before), []);
  assert.deepEqual(publishedChanges(captureReading(before), lab({ A: { status: 'READY' } })), []);
});

test('received changes distinguish a new test, review, execution and blocker', () => {
  const before = lab({ A: { status: 'DONE', review_state: 'PENDING_REVIEW' }, B: { status: 'QUEUED' }, C: { status: 'BLOCKED', blocker: 'input' } });
  const after = lab({ A: { status: 'DONE', review_state: 'REFUTED' }, B: { status: 'DISPATCHED' }, C: { status: 'BLOCKED', blocker: 'recipe' }, D: { status: 'READY' } });
  assert.deepEqual(publishedChanges(captureReading(before), after).map(c => [c.id, c.kind]), [['A', 'review'], ['B', 'execution'], ['C', 'dependency'], ['D', 'added']]);
});

test('last delivery uses a recorded event rather than a synthetic heartbeat', () => {
  const input = lab({}, [
    { at: '2026-09-30T10:00:00Z', role: 'EXECUTOR', event_type: 'TEST_RESULT_RECORDED', entity_id: 'A' },
    { at: '2026-09-30T11:00:00Z', role: 'PITIA', event_type: 'NEXO_THOUGHT_NOOP_RECORDED' },
  ]);
  assert.equal(latestDelivery(input).entity_id, 'A');
  assert.equal(latestDelivery(input, ['PITIA']), undefined);
});

test('a hypothesis selection highlights its actual tests and attack selects its target', () => {
  const input = lab({ A: { status: 'DONE', hypothesis_id: 'H' }, B: { status: 'READY', hypothesis_id: 'H' }, 'CONTEST-A-1': { status: 'DONE' } });
  assert.deepEqual(focusEntities(input, 'H'), ['A', 'B']);
  assert.equal(focusEntities(input, 'CONTEST-A-1')[0], 'A');
});


test('3D focus never includes hidden contest nodes and preserves single-target centering', () => {
  const input = lab({ A: { status: 'DONE' }, 'CONTEST-A-1': { status: 'DONE', hypothesis_id: 'H-ATTACK' }, 'CONTEST-A-2': { status: 'READY', hypothesis_id: 'H-ATTACK' } });
  assert.deepEqual(focusEntities(input, 'A'), ['A']);
  assert.deepEqual(focusEntities(input, 'H-ATTACK'), ['A']);
  assert.deepEqual(focusEntities(input, 'MISSING'), []);
});

test('a known row returning after a partial read is not announced as new', () => {
  const full = lab({ A: { status: 'READY' }, B: { status: 'DONE' } });
  const first = captureReading(full);
  const partial = captureReading(lab({ A: { status: 'READY' } }), first);
  assert.deepEqual(publishedChanges(partial, full), []);
});

test('review milestones and explicit readiness are changes, missing review is not', () => {
  const before = lab({ A: { status: 'DONE', review_state: 'PENDING_REVIEW' }, B: { status: 'DONE', review_state: 'CONFIRMED' }, C: { status: 'READY' } });
  const after = lab({ A: { status: 'DONE', review_state: 'REFEREE1_PASSED' }, B: { status: 'DONE' }, C: { status: 'READY', readiness: { eligible: false, reasons: [] } } });
  assert.deepEqual(publishedChanges(captureReading(before), after).map(c => [c.id, c.kind]), [['A', 'review'], ['C', 'readiness']]);
  const merged = captureReading(after, captureReading(before));
  assert.equal(merged.get('B').review, 'CONFIRMED');
});
