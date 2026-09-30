import test from 'node:test';
import assert from 'node:assert/strict';
import { readExecutionIntegrity, INTEGRITY_COUNT_KEYS } from '../src/viewmodels/execution-integrity.mjs';
const valid = () => ({ policy: 'SCIENTIFIC_INTEGRITY_V1', authority: 'TOWER_DERIVED', scope: 'PUBLIC_TESTS_ONLY',
  counts: Object.fromEntries(INTEGRITY_COUNT_KEYS.map(key => [key, 0])), throughput_status: 'NOT_MEASURED', throughput_per_hour: null });
test('absent telemetry stays unavailable, never zero', () => {
  for (const source of [undefined, null, [], '', {}]) {
    const view = readExecutionIntegrity(source);
    assert.equal(view.available, false); assert.equal(view.counts.ready_verified, null);
  }
});
test('explicit verified zero is displayed as zero', () => {
  const view = readExecutionIntegrity(valid());
  assert.equal(view.complete, true); assert.equal(view.counts.running_verified, 0);
});
test('missing fields preserve partial coverage', () => {
  const source = valid(); delete source.counts.queued;
  const view = readExecutionIntegrity(source);
  assert.equal(view.complete, false); assert.equal(view.counts.queued, null);
  assert.equal(view.counts.ready_verified, 0);
});
test('invalid counts are unavailable', () => {
  for (const value of [-1, NaN, Infinity, 1.5, '36', Number.MAX_SAFE_INTEGER + 1]) {
    const source = valid(); source.counts.completed = value;
    assert.equal(readExecutionIntegrity(source).counts.completed, null);
  }
});
test('foreign authority, private scope and unknown policy are rejected', () => {
  for (const change of [{ authority: 'OTHER' }, { scope: 'PRIVATE' }, { policy: 'future' }]) {
    assert.equal(readExecutionIntegrity({ ...valid(), ...change }).available, false);
  }
});
test('a nominal rate is not a measured rate', () => {
  assert.equal(readExecutionIntegrity({ ...valid(), throughput_per_hour: 36 }).throughputPerHour, null);
});
test('measurement without an observation window stays unavailable', () => {
  assert.equal(readExecutionIntegrity({ ...valid(), throughput_status: 'MEASURED', throughput_per_hour: 4 }).throughputPerHour, null);
});
test('measured rate with a valid window is accepted', () => {
  assert.equal(readExecutionIntegrity({ ...valid(), throughput_status: 'MEASURED', throughput_per_hour: 4,
    throughput_window: { seconds: 3600 } }).throughputPerHour, 4);
});
