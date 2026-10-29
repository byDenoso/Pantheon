/** Read the additive Tower projection. Missing telemetry is never a zero. */
export const INTEGRITY_COUNT_KEYS = Object.freeze([
  'ready_verified', 'ready_unverified', 'queued', 'dispatch_pending', 'dispatched',
  'running_verified', 'running_unverified', 'completed', 'review_unverified',
  'fdr_complete', 'fdr_incomplete',
]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

export function readExecutionIntegrity(source) {
  const valid = object(source) && source.policy === 'SCIENTIFIC_INTEGRITY_V1'
    && source.authority === 'TOWER_DERIVED' && source.scope === 'PUBLIC_TESTS_ONLY';
  const raw = valid && object(source.counts) ? source.counts : {};
  const counts = Object.fromEntries(INTEGRITY_COUNT_KEYS.map(key => [key, count(raw[key])]));
  return {
    available: Boolean(valid),
    complete: Boolean(valid) && Object.values(counts).every(value => value !== null),
    counts,
    // A per-round quota or a lifetime count is not a measured hourly rate.
    throughputPerHour: valid && source.throughput_status === 'MEASURED'
      && typeof source.throughput_per_hour === 'number'
      && Number.isFinite(source.throughput_per_hour) && source.throughput_per_hour >= 0
      && object(source.throughput_window) && source.throughput_window.seconds > 0
      ? source.throughput_per_hour : null,
  };
}
