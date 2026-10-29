export type VectorQuality = 'low' | 'medium' | 'high';

/** Decorative environment only: never apply this stride to published test IDs. */
export const ENVIRONMENT_POINT_BUDGET: Readonly<Record<VectorQuality, number>> = {
  low: 6_000, medium: 42_000, high: 84_000,
};

export function environmentStride(count: number, quality: VectorQuality): number {
  if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Invalid particle count');
  const baseline = quality === 'low' ? 3 : quality === 'medium' ? 2 : 1;
  return Math.max(baseline, Math.ceil(count / ENVIRONMENT_POINT_BUDGET[quality]));
}
