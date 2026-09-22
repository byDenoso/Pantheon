import type { AtlasCrossLink, AtlasMetroModel } from './atlasAdapter.ts';

export type VisualCrossLink = AtlasCrossLink & {
  visualCount: number;
  visualRefs: string[];
  logicalSource: string;
  logicalTarget: string;
  sourceCollapsed: boolean;
  targetCollapsed: boolean;
};

export function nearestVisibleAtlasAncestor(
  model: AtlasMetroModel,
  id: string,
  visible: ReadonlySet<string>,
): string | null {
  let current = model.nodeMap.get(id);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    if (visible.has(current.id)) return current.id;
    seen.add(current.id);
    current = current.parentId ? model.nodeMap.get(current.parentId) : undefined;
  }
  return null;
}

/**
 * Maps canonical Learning relations onto a smaller set of semantic visual paths.
 *
 * Exact canonical entity endpoints remain logical leaves. When a leaf is hidden,
 * stage 0 contracts it to the nearest visible ancestor; expanding that station
 * restores the direct leaf endpoint. No fuzzy matching invents entity precision.
 *
 * Stage 1 collapses duplicate graph edges emitted for one canonical record.
 * Stage 2 bundles records that share the same semantic route.
 *
 * The returned edge still carries every canonical ref, relation count and logical
 * endpoint, so reducing visual clutter never destroys provenance or diagnostics.
 */
export function projectVisualCrossLinks(
  model: AtlasMetroModel,
  links: AtlasCrossLink[],
  visible: ReadonlySet<string>,
): VisualCrossLink[] {
  const projected: VisualCrossLink[] = [];

  for (const link of links) {
    if (!link.isLearning) {
      if (!visible.has(link.source) || !visible.has(link.target)) continue;
      projected.push({
        ...link,
        visualCount: 1,
        visualRefs: [],
        logicalSource: link.source,
        logicalTarget: link.target,
        sourceCollapsed: false,
        targetCollapsed: false,
      });
      continue;
    }

    const source = nearestVisibleAtlasAncestor(model, link.source, visible);
    const target = nearestVisibleAtlasAncestor(model, link.target, visible);
    if (!source || !target || source === target) continue;

    projected.push({
      ...link,
      source,
      target,
      visualCount: 1,
      visualRefs: link.learningRef ? [link.learningRef] : [],
      logicalSource: link.source,
      logicalTarget: link.target,
      sourceCollapsed: source !== link.source,
      targetCollapsed: target !== link.target,
    });
  }

  const out: VisualCrossLink[] = [];
  const canonicalRecords = new Map<string, VisualCrossLink[]>();
  for (const link of projected) {
    if (!link.isLearning) {
      out.push(link);
      continue;
    }
    const recordKey = [link.source, link.target, link.learningKind || 'LEARNING', link.learningRef || link.id].join('↔');
    const bucket = canonicalRecords.get(recordKey) || [];
    bucket.push(link);
    canonicalRecords.set(recordKey, bucket);
  }

  const recordVisuals: VisualCrossLink[] = [];
  for (const [key, bucket] of canonicalRecords) {
    bucket.sort((left, right) => left.id.localeCompare(right.id));
    const base = bucket[0]!;
    const refs = [...new Set(bucket.map(link => link.learningRef).filter((value): value is string => Boolean(value)))];
    recordVisuals.push({
      ...base,
      id: `visual-record:${key}`,
      weight: bucket.reduce((sum, link) => sum + Number(link.weight || 0), 0) / bucket.length,
      visualCount: bucket.length,
      visualRefs: refs,
      sourceCollapsed: bucket.some(link => link.sourceCollapsed),
      targetCollapsed: bucket.some(link => link.targetCollapsed),
    });
  }

  const semanticBundles = new Map<string, VisualCrossLink[]>();
  for (const link of recordVisuals) {
    const semanticKey = link.learningTheme ? `theme:${link.learningTheme}` : `record:${link.learningRef || link.id}`;
    const key = [link.source, link.target, link.learningKind || 'LEARNING', semanticKey].join('↔');
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
      sourceCollapsed: bucket.some(link => link.sourceCollapsed),
      targetCollapsed: bucket.some(link => link.targetCollapsed),
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
