export type SemanticNode = {
  id: string;
  type?: string;
  status?: string;
  priority?: number;
};

export type LODContext = {
  selectedId?: string | null;
  focusId?: string | null;
  visibleBudget?: number;
  labelBudget?: number;
};

const TYPE_SCORE: Record<string, number> = {
  ROOT: 8500,
  SYSTEM: 8000,
  DOMAIN: 7000,
  SUBGRAPH: 6500,
  CLAIM: 6200,
  CAMPAIGN: 6000,
  TEST: 5000,
  ACTION: 4600,
  AUTOMATION_RUN: 3600,
  RUN: 3000,
  EVIDENCE: 2300,
  RESULT: 2000,
  LEARNING_RELATION: 1800
};

export function semanticRank(node: SemanticNode, context: LODContext = {}): number {
  if (node.id === context.selectedId) return 10000;
  if (node.id === context.focusId) return 9000;
  const type = String(node.type || '').toUpperCase();
  let score = TYPE_SCORE[type] ?? 1000;
  const status = String(node.status || '').toUpperCase();
  if (type === 'CLAIM' && (status === 'BLOCKED' || status === 'ACTIVE' || status === 'OPEN')) score += 500;
  if (status === 'BLOCKED') score += 180;
  if (status === 'ACTIVE' || status === 'IN_PROGRESS') score += 100;
  if (Number.isFinite(node.priority)) score += Math.max(0, Math.min(99, Number(node.priority))) * 2;
  return score;
}

function ordered(nodes: SemanticNode[], context: LODContext): SemanticNode[] {
  return [...nodes].sort((a, b) => {
    const delta = semanticRank(b, context) - semanticRank(a, context);
    return delta || a.id.localeCompare(b.id);
  });
}

export function selectSemanticLOD(nodes: SemanticNode[], context: LODContext = {}) {
  const visibleBudget = Math.max(2, context.visibleBudget ?? 160);
  const labelBudget = Math.max(2, Math.min(visibleBudget, context.labelBudget ?? 36));
  const ranked = ordered(nodes, context);
  const visibleIds = new Set(ranked.slice(0, visibleBudget).map(node => node.id));
  const labelIds = new Set(ranked.filter(node => visibleIds.has(node.id)).slice(0, labelBudget).map(node => node.id));

  for (const protectedId of [context.focusId, context.selectedId]) {
    if (!protectedId || !nodes.some(node => node.id === protectedId)) continue;
    if (!visibleIds.has(protectedId)) {
      const last = [...visibleIds].at(-1);
      if (last) visibleIds.delete(last);
      visibleIds.add(protectedId);
    }
    if (!labelIds.has(protectedId)) {
      const last = [...labelIds].at(-1);
      if (last) labelIds.delete(last);
      labelIds.add(protectedId);
    }
  }

  return { visibleIds, labelIds };
}
