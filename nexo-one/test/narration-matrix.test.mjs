import test from 'node:test';
import assert from 'node:assert/strict';
import { NARRATION, NARRATION_MATRIX_SIZE } from '../src/features/lab/narration.ts';

const TEST_AND_BOARD_EVENTS = [
  'BOARD_POSTED',
  'SEMANTIC_BACKFILLED',
  'TEST_ENRICHED',
  'TEST_DISPATCHED',
  'TEST_RESULT_RECORDED',
  'ROADMAP_TEST_FROZEN',
  'RESULT_CONTESTED',
  'RESULT_REFEREE1_PASSED',
  'RESULT_REFUTED',
  'RESULT_CONFIRMED',
  'TEST_BATTERY_DISPATCHED',
];

test('narration exposes a real 90x90 matrix for every event', () => {
  assert.equal(NARRATION_MATRIX_SIZE, 90);
  for (const [event, matrix] of Object.entries(NARRATION)) {
    assert.equal(matrix.heads.length, 90, event + ' heads');
    assert.equal(matrix.tails.length, 90, event + ' tails');
    assert.equal(new Set(matrix.heads).size, 90, event + ' unique heads');
    assert.equal(new Set(matrix.tails).size, 90, event + ' unique tails');
    assert.equal(matrix.heads.length * matrix.tails.length, 8100, event + ' combinations');
  }
});

test('mural and test lifecycle events are covered by the 90x90 matrix', () => {
  for (const event of TEST_AND_BOARD_EVENTS) {
    assert.ok(NARRATION[event], event + ' missing');
    assert.equal(NARRATION[event].heads.length * NARRATION[event].tails.length, 8100, event);
  }
});

test('matrix expansion does not materialize broken placeholders', () => {
  for (const matrix of Object.values(NARRATION)) {
    for (const text of [...matrix.heads, ...matrix.tails]) {
      assert.doesNotMatch(text, /undefined|null/i);
      assert.doesNotMatch(text, /\.\;/);
    }
  }
});
