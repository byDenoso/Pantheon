export const FALLBACK_REASONS = Object.freeze([
  'QUOTA_EXHAUSTED',
  'BUDGET_BLOCKED',
  'RUNNER_UNAVAILABLE',
  'QUEUE_TIMEOUT',
  'INFRASTRUCTURE_FAILURE',
]);

const FALLBACK_REASON_SET = new Set(FALLBACK_REASONS);

export function shouldFallbackAfterGithubFailure(reason) {
  return FALLBACK_REASON_SET.has(String(reason || '').toUpperCase());
}

export function chooseExecutor({
  mode = 'auto',
  github = {available: true, remainingMinutes: null},
  estimatedMinutes = 0,
  reserveMinutes = 15,
} = {}) {
  const normalizedMode = String(mode || 'auto').toLowerCase();
  if (normalizedMode === 'github') return {backend: 'github_actions', reason: 'FORCED_GITHUB'};
  if (normalizedMode === 'vercel') return {backend: 'vercel_sandbox', reason: 'FORCED_VERCEL'};
  if (normalizedMode !== 'auto') throw new Error(`INVALID_EXECUTOR_MODE:${mode}`);

  if (github?.available === false) {
    return {backend: 'vercel_sandbox', reason: 'GITHUB_UNAVAILABLE'};
  }

  const remaining = github?.remainingMinutes;
  if (Number.isFinite(remaining)) {
    const required = Math.max(0, Number(estimatedMinutes) || 0) + Math.max(0, Number(reserveMinutes) || 0);
    if (remaining < required) {
      return {backend: 'vercel_sandbox', reason: 'GITHUB_BUDGET_RESERVE'};
    }
  }

  return {backend: 'github_actions', reason: 'PRIMARY_HEALTHY'};
}
