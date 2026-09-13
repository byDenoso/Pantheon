// Shared with src/core/sync.ts (which re-exports from here) so the api/private/sync.mjs
// Vercel function and the browser bundle compute the exact same SyncReceipt rule.

/**
 * Builds the SyncReceipt for one sync attempt. Never marks the receipt as a success by
 * assuming the refresh worked -- it recomputes readbackVerified from an INDEPENDENT
 * after-read of the same sources (beforeSources/afterSources are two separate reads,
 * not the same object reused), matching the locked "write -> readback -> verify"
 * protocol from this session's design debate. A sync that changed nothing is
 * NO_CHANGE, not UPDATED; a sync where the after-read disagrees with itself across
 * sources, or a source read fails, is never reported as readbackVerified.
 */
export function resolveSyncReceipt(params) {
  const { requestId, startedAt, completedAt, beforeFingerprint, afterFingerprint, beforeSources, afterSources, errors = [] } = params;

  const hasErrors = errors.some(issue => issue.severity === 'ERROR');
  const afterSourcesAllReadable = afterSources.length > 0 && afterSources.every(source => source.state !== 'API_ERROR' && source.state !== 'DATA_UNAVAILABLE');

  const readbackVerified = !hasErrors && afterSourcesAllReadable && afterFingerprint !== null && afterFingerprint !== undefined;

  let outcome;
  if (hasErrors || !afterSourcesAllReadable) {
    outcome = 'FAILED';
  } else if (beforeFingerprint === afterFingerprint) {
    outcome = 'NO_CHANGE';
  } else if (afterFingerprint) {
    outcome = 'UPDATED';
  } else {
    outcome = 'PARTIAL';
  }

  return {
    requestId,
    startedAt,
    completedAt,
    outcome,
    beforeFingerprint,
    afterFingerprint,
    readbackVerified: outcome === 'FAILED' ? false : readbackVerified,
    sources: afterSources.map(source => ({ id: source.id, state: source.state, observedAt: source.observedAt })),
    errors
  };
}
