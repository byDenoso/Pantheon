import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FALLBACK_REASONS,
  chooseExecutor,
  shouldFallbackAfterGithubFailure,
} from '../server/executor/fallback-router.mjs';

test('auto mode keeps GitHub Actions primary when budget covers the next shard plus reserve', () => {
  assert.deepEqual(
    chooseExecutor({
      mode: 'auto',
      github: {available: true, remainingMinutes: 120},
      estimatedMinutes: 20,
      reserveMinutes: 15,
    }),
    {backend: 'github_actions', reason: 'PRIMARY_HEALTHY'},
  );
});

test('auto mode spills to Vercel before GitHub Actions minutes are exhausted', () => {
  assert.deepEqual(
    chooseExecutor({
      mode: 'auto',
      github: {available: true, remainingMinutes: 31},
      estimatedMinutes: 20,
      reserveMinutes: 15,
    }),
    {backend: 'vercel_sandbox', reason: 'GITHUB_BUDGET_RESERVE'},
  );
});

test('auto mode falls back when GitHub Actions is unavailable even if quota is unknown', () => {
  assert.deepEqual(
    chooseExecutor({
      mode: 'auto',
      github: {available: false, remainingMinutes: null},
      estimatedMinutes: 10,
      reserveMinutes: 15,
    }),
    {backend: 'vercel_sandbox', reason: 'GITHUB_UNAVAILABLE'},
  );
});

test('forced modes are deterministic', () => {
  assert.equal(chooseExecutor({mode: 'github'}).backend, 'github_actions');
  assert.equal(chooseExecutor({mode: 'vercel'}).backend, 'vercel_sandbox');
});

test('fallback is infrastructure-only and never hides scientific/code failures', () => {
  for (const reason of FALLBACK_REASONS) {
    assert.equal(shouldFallbackAfterGithubFailure(reason), true, reason);
  }
  for (const reason of ['SCIENTIFIC_TEST_FAILED', 'ASSERTION_FAILED', 'INVALID_DATASET', 'CODE_ERROR']) {
    assert.equal(shouldFallbackAfterGithubFailure(reason), false, reason);
  }
});
