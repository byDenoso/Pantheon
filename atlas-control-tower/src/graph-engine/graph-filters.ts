import type { GraphNode, GraphProjection } from './types';

// Map-context filters. Each key here must genuinely change the visible projection
// (or be surfaced as honestly unavailable in the UI) -- never a decorative no-op.
// - domain/status filter on real GraphNode fields already present in the projection.
// - authority filters on the raw AtlasNode's `authority` field (stripped out of
//   GraphNode by the projection pipeline), so the caller passes an id->authority
//   lookup built from the raw graph rather than a value invented here.
export type MapFilters = { domain?: string; status?: string; authority?: string };

function keep(node: GraphNode, focusId: string | null): boolean {
  return node.id === focusId || node.contextRole === 'ancestor' || node.contextRole === 'portal';
}

export function distinctFieldValues(nodes: GraphNode[], field: 'domain' | 'status'): string[] {
  const values = new Set<string>();
  for (const node of nodes) {
    const value = field === 'domain' ? node.domain : node.status;
    if (value) values.add(String(value));
  }
  return Array.from(values).sort();
}

export function distinctAuthorityValues(authorityById: Map<string, string | undefined>): string[] {
  const values = new Set<string>();
  for (const value of authorityById.values()) if (value) values.add(value);
  return Array.from(values).sort();
}

export function applyMapFilters(
  projection: GraphProjection,
  filters: MapFilters,
  authorityById: Map<string, string | undefined>
): GraphProjection {
  const hasDomain = Boolean(filters.domain);
  const hasStatus = Boolean(filters.status);
  const hasAuthority = Boolean(filters.authority);
  if (!hasDomain && !hasStatus && !hasAuthority) return projection;

  const matches = (node: GraphNode) => {
    if (keep(node, projection.focusId)) return true;
    if (hasDomain && String(node.domain || '').toUpperCase() !== filters.domain!.toUpperCase()) return false;
    if (hasStatus && String(node.status || '').toUpperCase() !== filters.status!.toUpperCase()) return false;
    if (hasAuthority && String(authorityById.get(node.id) || '').toUpperCase() !== filters.authority!.toUpperCase()) return false;
    return true;
  };

  const keepIds = new Set(projection.nodes.filter(matches).map(node => node.id));
  return {
    ...projection,
    nodes: projection.nodes.filter(node => keepIds.has(node.id)),
    edges: projection.edges.filter(edge => keepIds.has(edge.source) && keepIds.has(edge.target))
  };
}
