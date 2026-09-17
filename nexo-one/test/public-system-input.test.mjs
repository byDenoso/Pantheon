import test from 'node:test';
import assert from 'node:assert/strict';
import {readPublicSystemInput} from '../server/compiler/public-system-input.mjs';

test('public operational projection supplies actions, human attention and learning filaments', async () => {
  const input = await readPublicSystemInput();
  assert.ok(input.actions.length > 0);
  assert.ok(input.sideQuests.length > 0);
  assert.ok(input.learningFilaments.length > 0);
  assert.equal(input.executionRuns.length, 0);
  assert.ok(input.learningFilaments.some(row => row.source_domain !== row.target_domain));
});
