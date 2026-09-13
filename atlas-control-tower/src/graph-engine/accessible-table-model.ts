import type { GraphEdge, GraphNode } from './types';

// Pure state/data model behind the accessible table fallback. Kept entirely free of
// React/DOM so every rule here is exercised by real inputs/outputs in node:test, not
// by scanning rendered markup. The component (AccessibleGraphTable.tsx) is a thin
// wrapper around these functions -- it owns no filtering/sorting/expansion logic of
// its own.

export type TableRow = {
  id: string;
  type: 'DOMAIN' | 'CAMPAIGN';
  label: string;
  domainId: string | null;
  status: string | null;
  isChildRow: boolean;
};

export type SortKey = 'label' | 'type' | 'status';
export type SortDirection = 'asc' | 'desc';

function isDomain(node: GraphNode): boolean {
  return String(node.type || '').toUpperCase() === 'DOMAIN';
}

function isCampaign(node: GraphNode): boolean {
  return String(node.type || '').toUpperCase() === 'CAMPAIGN';
}

/**
 * Builds the domain->campaign parent map from edges, mirroring exactly the rule
 * graph-entity-contract.ts uses to decide whether a campaign has a DOMAIN parent
 * (an edge directly connecting a DOMAIN node to the campaign, in either direction).
 * Kept independent from that module (no import) so the table's own behavior is
 * verified on its own terms, not by trusting the other module transitively.
 */
function campaignParentDomain(edges: GraphEdge[], domainIds: Set<string>, campaignId: string): string | null {
  for (const edge of edges) {
    if (edge.source === campaignId && domainIds.has(edge.target)) return edge.target;
    if (edge.target === campaignId && domainIds.has(edge.source)) return edge.source;
  }
  return null;
}

/**
 * Flattens nodes/edges into a renderable row list honoring drill-down state: a
 * campaign row appears directly under its parent domain row ONLY when that domain id
 * is present in `expandedDomainIds` -- this is the table's equivalent of "focusing" a
 * domain in the 3D map. A campaign with no domain parent (the Transversais case)
 * always appears at the top level, ungated by any expansion state, since there is no
 * domain row that owns it.
 */
export function buildTableRows(nodes: GraphNode[], edges: GraphEdge[], expandedDomainIds: ReadonlySet<string>): TableRow[] {
  const domainNodes = nodes.filter(isDomain);
  const campaignNodes = nodes.filter(isCampaign);
  const domainIds = new Set(domainNodes.map(node => node.id));

  const campaignsByDomain = new Map<string, GraphNode[]>();
  const orphanCampaigns: GraphNode[] = [];
  for (const campaign of campaignNodes) {
    const parent = campaignParentDomain(edges, domainIds, campaign.id);
    if (parent) {
      if (!campaignsByDomain.has(parent)) campaignsByDomain.set(parent, []);
      campaignsByDomain.get(parent)!.push(campaign);
    } else {
      orphanCampaigns.push(campaign);
    }
  }

  const rows: TableRow[] = [];
  for (const domain of domainNodes) {
    rows.push({ id: domain.id, type: 'DOMAIN', label: domain.label, domainId: null, status: domain.status ?? null, isChildRow: false });
    if (expandedDomainIds.has(domain.id)) {
      for (const campaign of campaignsByDomain.get(domain.id) || []) {
        rows.push({ id: campaign.id, type: 'CAMPAIGN', label: campaign.label, domainId: domain.id, status: campaign.status ?? null, isChildRow: true });
      }
    }
  }
  for (const campaign of orphanCampaigns) {
    rows.push({ id: campaign.id, type: 'CAMPAIGN', label: campaign.label, domainId: null, status: campaign.status ?? null, isChildRow: false });
  }
  return rows;
}

export function toggleDomainExpansion(expanded: ReadonlySet<string>, domainId: string): Set<string> {
  const next = new Set(expanded);
  if (next.has(domainId)) next.delete(domainId);
  else next.add(domainId);
  return next;
}

export type TableFilter = { query?: string; status?: string };

/**
 * Filters rows by free-text query (label or id, case-insensitive substring) and by
 * status. A domain row whose own label doesn't match but that has a matching
 * descendant campaign among ALL rows (not just currently-expanded ones) is kept and
 * auto-expanded by the caller (see filterAndAutoExpand) so a search never hides a
 * result behind a collapsed parent.
 */
export function filterRows(rows: TableRow[], filter: TableFilter): TableRow[] {
  const query = filter.query?.trim().toLowerCase();
  const status = filter.status?.trim();
  return rows.filter(row => {
    if (status && row.status !== status) return false;
    if (query && !(row.label.toLowerCase().includes(query) || row.id.toLowerCase().includes(query))) return false;
    return true;
  });
}

/**
 * Search-aware variant of buildTableRows: when a query is present, any domain whose
 * campaigns (built from the FULL, unfiltered node set) contain a match is force-
 * expanded before filtering, so the matching campaign row is visible even if the user
 * never manually expanded that domain. Returns both the rows to render and the
 * expansion set actually used, so the caller can keep UI state consistent.
 */
export function filterAndAutoExpand(
  nodes: GraphNode[],
  edges: GraphEdge[],
  expandedDomainIds: ReadonlySet<string>,
  filter: TableFilter
): { rows: TableRow[]; expandedDomainIds: Set<string> } {
  const query = filter.query?.trim().toLowerCase();
  let effectiveExpanded = new Set(expandedDomainIds);

  if (query) {
    const allRowsFullyExpanded = buildTableRows(nodes, edges, new Set(nodes.filter(isDomain).map(n => n.id)));
    const domainIdsWithMatch = new Set(
      allRowsFullyExpanded.filter(row => row.isChildRow && (row.label.toLowerCase().includes(query) || row.id.toLowerCase().includes(query))).map(row => row.domainId!)
    );
    effectiveExpanded = new Set([...effectiveExpanded, ...domainIdsWithMatch]);
  }

  const rows = filterRows(buildTableRows(nodes, edges, effectiveExpanded), filter);
  return { rows, expandedDomainIds: effectiveExpanded };
}

export function sortRows(rows: TableRow[], key: SortKey, direction: SortDirection): TableRow[] {
  // Domain rows and their expanded campaign children must stay adjacent (a sorted
  // table that separates a domain from its own children would break the drill-down
  // affordance), so sorting only reorders top-level groups: each domain's block of
  // [domain row, ...its child rows] moves together, and each orphan campaign is its
  // own one-row block.
  const blocks: TableRow[][] = [];
  let current: TableRow[] = [];
  for (const row of rows) {
    if (!row.isChildRow) {
      if (current.length) blocks.push(current);
      current = [row];
    } else {
      current.push(row);
    }
  }
  if (current.length) blocks.push(current);

  const compare = (a: TableRow, b: TableRow) => {
    const av = String(a[key] ?? '');
    const bv = String(b[key] ?? '');
    const cmp = av.localeCompare(bv);
    return direction === 'asc' ? cmp : -cmp;
  };
  blocks.sort((a, b) => compare(a[0], b[0]));
  return blocks.flat();
}
