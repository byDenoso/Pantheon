import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyExecutorCandidate, classifyExecutorQueue } from '../lib/tower-eligibility.mjs';
import { deriveRoleView } from '../lib/tower-role-view.mjs';

const caps = {
  'peer.detection.d05_v1': { status: 'ACTIVE', backend: 'chatgpt_runtime', task_id: 'peer_detection_d05' },
  'science.retired': { status: 'RETIRED', backend: 'x' },
  'science.active': { status: 'ACTIVE', backend: 'nexo_runtime' },
};
const frozen = { id: 'T-1', method: 'm', decision_rule: { PASS: 'x' }, outputs: ['o'], claim_boundary: 'b' };
const row = (id, status = 'READY') => ({ id, status, owner_role: 'EXECUTOR' });

test('a stale hot-set index row is never selected: the hydrated entity decides', () => {
  // Real case 2026-09-27: 66 index rows said READY while the entity was INCONCLUSIVE / policy NONE.
  const result = classifyExecutorCandidate(row('W'), { id: 'W', owner_role: 'EXECUTOR', status: 'INCONCLUSIVE', execution_policy: 'NONE' });
  assert.equal(result.selection, 'STALE_INDEX');
});

test('READY with a scientific blocker goes to BLOCKED_INPUT at selection, not after hydration', () => {
  // Real case: WORK::T-H0HOM26-005, index READY, entity BLOCKED SCIENTIFIC_DEFINITION_MISSING.
  const drifted = classifyExecutorCandidate(row('H'), { id: 'H', owner_role: 'EXECUTOR', status: 'BLOCKED', blocker_class: 'SCIENTIFIC_DEFINITION_MISSING' });
  assert.equal(drifted.selection, 'STALE_INDEX');
  const ready = classifyExecutorCandidate(row('H2'), { id: 'H2', owner_role: 'EXECUTOR', status: 'READY', blocker_class: 'SCIENTIFIC_DEFINITION_MISSING', frozen_test: frozen });
  assert.equal(ready.selection, 'BLOCKED_INPUT');
  assert.deepEqual(ready.reasons, ['SCIENTIFIC_DEFINITION_MISSING']);
});

test('capability_id binds like task_id (peer detections were silently excluded before)', () => {
  const result = classifyExecutorCandidate(row('P'), { id: 'P', owner_role: 'EXECUTOR', status: 'READY', capability_id: 'peer.detection.d05_v1' }, { capabilities: caps });
  assert.equal(result.selection, 'RUNNABLE');
});

test('frozen refs must resolve and be complete', () => {
  const entity = { id: 'F', owner_role: 'EXECUTOR', status: 'READY', frozen_test_ref: 'entities/test/T-1.json' };
  assert.deepEqual(classifyExecutorCandidate(row('F'), entity, { frozenTests: {} }).reasons, ['FROZEN_REF_UNRESOLVED:entities/test/T-1.json']);
  assert.equal(classifyExecutorCandidate(row('F'), entity, { frozenTests: { 'entities/test/T-1.json': frozen } }).selection, 'RUNNABLE');
  assert.deepEqual(classifyExecutorCandidate(row('F'), entity, { frozenTests: { 'entities/test/T-1.json': { id: 'T-1' } } }).reasons, ['FROZEN_CONTRACT_INCOMPLETE']);
});

test('required capabilities and declared input refs (likelihoods, selection functions) gate selection', () => {
  const entity = { id: 'R', owner_role: 'EXECUTOR', status: 'READY', required_capabilities: ['science.active', 'science.retired'],
    frozen_test: { ...frozen, input_refs: ['lik/pair-a', { ref: 'selfn/b' }] } };
  const result = classifyExecutorCandidate(row('R'), entity, { capabilities: caps, resolveRef: ref => ref === 'lik/pair-a' });
  assert.deepEqual(result.reasons, ['REQUIRED_CAPABILITY_UNAVAILABLE:science.retired', 'INPUT_REF_UNRESOLVED:selfn/b']);
});

test('WAIT_DEPENDENCY that matches its entity is not-runnable, not stale', () => {
  const result = classifyExecutorCandidate(row('D', 'WAIT_DEPENDENCY'), { id: 'D', owner_role: 'EXECUTOR', status: 'WAIT_DEPENDENCY' });
  assert.equal(result.selection, 'NOT_RUNNABLE');
});

test('role view with hydrated entities queues only RUNNABLE and reports the rest', () => {
  const activeWork = { work: [row('P'), row('S'), row('H')] };
  const entities = new Map([
    ['P', { id: 'P', owner_role: 'EXECUTOR', status: 'READY', capability_id: 'peer.detection.d05_v1' }],
    ['S', { id: 'S', owner_role: 'EXECUTOR', status: 'INCONCLUSIVE', execution_policy: 'NONE' }],
    ['H', { id: 'H', owner_role: 'EXECUTOR', status: 'READY', blocker_class: 'SCIENTIFIC_DEFINITION_MISSING', frozen_test: frozen }],
  ]);
  const view = deriveRoleView({ role: 'EXECUTOR', activeWork, capabilities: caps, entities });
  assert.deepEqual(view.queue.map(item => item.id), ['P']);
  assert.deepEqual(view.selection_stats, { candidates: 3, runnable: 1, blocked_input: 1, stale_index: 1, not_runnable: 0 });
  assert.deepEqual(view.blocked_input, [{ id: 'H', status: 'BLOCKED_INPUT', reasons: ['SCIENTIFIC_DEFINITION_MISSING'] }]);
  assert.equal(view.view_model, 'DERIVED_LIVE_FROM_HYDRATED_ENTITIES');
});

test('queue stats count every executor candidate once', () => {
  const { stats } = classifyExecutorQueue([row('A'), { id: 'X', owner_role: 'ADVISOR', status: 'READY' }], {});
  assert.deepEqual(stats, { candidates: 1, runnable: 0, blocked_input: 1, stale_index: 0, not_runnable: 0 });
});
