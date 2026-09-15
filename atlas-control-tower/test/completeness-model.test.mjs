import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompletenessModel } from '../src/data/completeness-model.ts';

test('completeness model publishes counts and names real source gaps', () => {
  const model = buildCompletenessModel({
    observatory: { questions: [{ id: 1 }], campaigns: [{ id: 1 }, { id: 2 }], h0Stacks: [{ id: 1 }] },
    laboratory: { items: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    learning: { items: [{ id: 1 }] },
    operations: { actions: [{ id: 1 }] },
    audit: { items: [] }
  });
  assert.deepEqual(model.metrics.map(metric => metric.value), [2, 1, 3, 1, 1]);
  assert.equal(model.gaps.some(gap => gap.id === 'h0-aggregate' && gap.state === 'NOT_PUBLISHED'), true);
  assert.equal(model.gaps.every(gap => gap.label && gap.detail), true);
});

test('completeness model distinguishes unavailable surfaces from empty published lists', () => {
  const model = buildCompletenessModel({ observatory: null, laboratory: { items: [] } });
  assert.equal(model.metrics.find(metric => metric.id === 'campaigns')?.state, 'DATA_UNAVAILABLE');
  assert.equal(model.metrics.find(metric => metric.id === 'experiments')?.state, 'EMPTY');
});
