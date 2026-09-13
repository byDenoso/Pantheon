import type { DataIssue, SyncReceipt } from './contracts';
// Canonical implementation lives in lib/sync-receipt.mjs so the api/private/sync.mjs
// Vercel function (plain JS, no TS build step) and this browser bundle share one rule.
// eslint-disable-next-line import/extensions
import { resolveSyncReceipt as resolveSyncReceiptImpl } from '../../lib/sync-receipt.mjs';

export type SourceRead = { id: string; state: string; observedAt?: string; fingerprint?: string | null };

export function resolveSyncReceipt(params: {
  requestId: string;
  startedAt: string;
  completedAt: string;
  beforeFingerprint: string | null;
  afterFingerprint: string | null;
  beforeSources: SourceRead[];
  afterSources: SourceRead[];
  errors?: DataIssue[];
}): SyncReceipt {
  return resolveSyncReceiptImpl(params) as SyncReceipt;
}
