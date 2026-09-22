import type { AtlasCrossLink } from './atlasAdapter.ts';

export type VisualCrossLink = AtlasCrossLink & {
  visualCount: number;
  visualRefs: string[];
};

/**
 * Maps canonical Learning relations onto a smaller set of semantic visual paths.
 *
 * Stage 1 collapses duplicate graph edges emitted for one canonical record.
 * Stage 2 bundles records that share the same semantic route.
 *
 * The returned edge still carries every canonical ref and relation count, so
 * reducing visual clutter never destroys provenance or diagnostic counts.
 */
export function projectVisualCrossLinks(
  links: AtlasCrossLink[],
  visible: ReadonlySet<string>,
): VisualCrossLink[] {
  const filtered = links.filter(link => visible.has(link.source) && visible.has(link.target));
  const out: VisualCrossLink[] = [];
  const canonicalRecords = new Map<string, AtlasCrossLink[]>();

  for (const link of filtered) {
    if (!link.isLearning) {
      out.push({ ...link, visualCount: 1, visualRefs: [] });
      continue;
    }
    const recordKey = [
      link.source,
      link.target,
      link.learningKind || 'LEARNING',
      link.learningRef || link.id,
    ].join('↔');
    const bucket = canonicalRecords.get(recordKey) || [];
    bucket.push(link);
    canonicalRecords.set(recordKey, bucket);
  }

  const recordVisuals: VisualCrossLink[] = [];
  for (const [key, bucket] of canonicalRecords) {
    bucket.sort((left, right) => left.id.localeCompare(right.id));
    const base = bucket[0]!;
    const refs = [...new Set(
      bucket.map(link => link.learningRef).filter((value): value is string => Boolean(value)),
    )];
    recordVisuals.push({
      ...base,
      id: `visual-record:${key}`,
      weight: bucket.reduce((sum, link) => sum + Number(link.weight || 0), 0) / bucket.length,
      visualCount: bucket.length,
      visualRefs: refs,
    });
  }

  const semanticBundles = new Map<string, VisualCrossLink[]>();
  for (const link of recordVisuals) {
    const semanticKey = link.learningTheme
      ? `theme:${link.learningTheme}`
      : `record:${link.learningRef || link.id}`;
    const key = [
      link.source,
      link.target,
      link.learningKind || 'LEARNING',
      semanticKey,
    ].join('↔');
    const bucket = semanticBundles.get(key) || [];
    bucket.push(link);
    semanticBundles.set(key, bucket);
  }

  for (const [key, bucket] of semanticBundles) {
    bucket.sort((left, right) => left.id.localeCompare(right.id));
    const base = bucket[0]!;
    const refs = [...new Set(bucket.flatMap(link => link.visualRefs))];
    const relationCount = bucket.reduce((sum, link) => sum + link.visualCount, 0);
    out.push({
      ...base,
      id: `visual-learning:${key}`,
      label: refs.length > 1 ? `${base.label} · ${refs.length} registros` : base.label,
      weight: bucket.reduce((sum, link) => sum + Number(link.weight || 0), 0) / bucket.length,
      visualCount: relationCount,
      visualRefs: refs,
    });
  }

  const learningPairs = new Map<string, VisualCrossLink[]>();
  for (const link of out) {
    if (!link.isLearning) continue;
    const pair = [link.source, link.target].join('→');
    const bucket = learningPairs.get(pair) || [];
    bucket.push(link);
    learningPairs.set(pair, bucket);
  }
  for (const bucket of learningPairs.values()) {
    bucket.sort((left, right) => left.id.localeCompare(right.id));
    bucket.forEach((link, index) => {
      link.bundleIndex = index;
      link.bundleCount = bucket.length;
    });
  }

  return out;
}
