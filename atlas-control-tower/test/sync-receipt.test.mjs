import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSyncReceipt } from '../src/core/sync.ts';

function base(overrides = {}) {
  return {
    requestId: 'req-1',
    startedAt: '2026-09-13T20:00:00Z',
    completedAt: '2026-09-13T20:00:05Z',
    beforeFingerprint: 'sha256:aaa',
    afterFingerprint: 'sha256:bbb',
    beforeSources: [{ id: 'github', state: 'READY', observedAt: '2026-09-13T19:00:00Z' }],
    afterSources: [{ id: 'github', state: 'READY', observedAt: '2026-09-13T20:00:05Z' }],
    ...overrides
  };
}

test('a changed fingerprint with clean readable sources is UPDATED and readbackVerified', () => {
  const receipt = resolveSyncReceipt(base());
  assert.equal(receipt.outcome, 'UPDATED');
  assert.equal(receipt.readbackVerified, true);
});

test('an identical before/after fingerprint is NO_CHANGE, not UPDATED', () => {
  const receipt = resolveSyncReceipt(base({ afterFingerprint: 'sha256:aaa' }));
  assert.equal(receipt.outcome, 'NO_CHANGE');
  assert.equal(receipt.readbackVerified, true);
});

test('any ERROR-severity issue forces FAILED and readbackVerified=false, regardless of fingerprints', () => {
  const receipt = resolveSyncReceipt(base({ errors: [{ code: 'X', severity: 'ERROR', message: 'boom' }] }));
  assert.equal(receipt.outcome, 'FAILED');
  assert.equal(receipt.readbackVerified, false);
});

test('an after-read source in API_ERROR/DATA_UNAVAILABLE forces FAILED, never a silent success', () => {
  const receiptApiError = resolveSyncReceipt(base({ afterSources: [{ id: 'github', state: 'API_ERROR' }] }));
  assert.equal(receiptApiError.outcome, 'FAILED');
  assert.equal(receiptApiError.readbackVerified, false);

  const receiptUnavailable = resolveSyncReceipt(base({ afterSources: [{ id: 'github', state: 'DATA_UNAVAILABLE' }] }));
  assert.equal(receiptUnavailable.outcome, 'FAILED');
  assert.equal(receiptUnavailable.readbackVerified, false);
});

test('a null/undefined afterFingerprint with otherwise-readable sources is PARTIAL, not UPDATED', () => {
  const receipt = resolveSyncReceipt(base({ afterFingerprint: null }));
  assert.equal(receipt.outcome, 'PARTIAL');
  assert.equal(receipt.readbackVerified, false);
});

test('an empty afterSources list never counts as a verified readback', () => {
  const receipt = resolveSyncReceipt(base({ afterSources: [] }));
  assert.equal(receipt.readbackVerified, false);
});

test('sources in the receipt come from the independent after-read, not the before-read', () => {
  const receipt = resolveSyncReceipt(
    base({
      beforeSources: [{ id: 'github', state: 'STALE', observedAt: 'before' }],
      afterSources: [{ id: 'github', state: 'READY', observedAt: 'after' }]
    })
  );
  assert.deepEqual(receipt.sources, [{ id: 'github', state: 'READY', observedAt: 'after' }]);
});
