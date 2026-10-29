export type IntegrityCountKey = 'ready_verified' | 'ready_unverified' | 'queued' | 'dispatch_pending'
  | 'dispatched' | 'running_verified' | 'running_unverified' | 'completed' | 'review_unverified'
  | 'fdr_complete' | 'fdr_incomplete';
export const INTEGRITY_COUNT_KEYS: readonly IntegrityCountKey[];
export interface ExecutionIntegrityView {
  available: boolean;
  complete: boolean;
  counts: Record<IntegrityCountKey, number | null>;
  throughputPerHour: number | null;
}
export function readExecutionIntegrity(source: unknown): ExecutionIntegrityView;
