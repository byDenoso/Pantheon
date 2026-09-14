import type { GraphEdge, GraphNode, GraphProjection } from './types';

// Product contract (locked): the map renders exactly Universo -> Dominio -> Campanha.
// Campaign is terminal. Tests, claims, datasets, artifacts, results and evidence are
// content for Pesquisa/Atividade/Laboratorio/inspector, never graph nodes/edges.
//
// PROGRAM and ACTION are included here too -- not new invented map levels, but the
// REAL structural types Engineering/Olympus/Operations already publish in place of
// Science's DOMAIN/CAMPAIGN (Engineering/Olympus: Sistema -> Programa -> Campanha;
// Operations: Sistema -> Ação, no campaign layer at all). Stripping them (the
// previous behavior) left every non-Science system rendering as a single lone SYSTEM
// dot with no children -- confirmed via a real browser repro on /mapa's Engenharia,
// Olympus and Operação routes, not a guess. PROGRAM occupies the same "cluster"
// visual role as DOMAIN and ACTION the same terminal role as CAMPAIGN (colorFor/
// drill-in in Canvas25DGraph.tsx); neither is relabeled or given fabricated data --
// their real type/id/label/status are unchanged, only which existing map contract
// they render under.
export const MAP_ENTITY_TYPES = new Set(['SYSTEM', 'ROOT', 'DOMAIN', 'CAMPAIGN', 'PROGRAM', 'ACTION']);
export const TRANSVERSAL_GROUP_ID = 'group:transversais';
export const TRANSVERSAL_GROUP_TYPE = 'DERIVED_NAVIGATION_GROUP';

export type GraphContractIssueCode = 'REJECTED_NODE_TYPE' | 'REJECTED_EDGE_TYPE' | 'ORPHAN_CAMPAIGN_GROUPED';

export type GraphContractIssue = {
  code: GraphContractIssueCode;
  nodeId?: string;
  edgeId?: string;
  nodeType?: string;
  message: string;
};

export type GraphContractResult = {
  projection: GraphProjection;
  issues: GraphContractIssue[];
};

function isCampaign(node: GraphNode): boolean {
  return String(node.type || '').toUpperCase() === 'CAMPAIGN';
}

// DOMAIN (Science) and PROGRAM (Engineering/Olympus) both play the cluster/parent
// role one level under SYSTEM. Only CAMPAIGN needs the orphan check below: a
// campaign with no DOMAIN/PROGRAM parent is cross-domain and gets grouped under
// "Transversais" instead of dropped. ACTION (Operations) is intentionally excluded
// -- Operations has no domain/campaign concept at all (Sistema -> Ação directly is
// its real, complete structure), so an ACTION attached straight to SYSTEM is not an
// orphan needing synthetic grouping, unlike a campaign with no domain.
function isClusterEntity(node: GraphNode): boolean {
  const type = String(node.type || '').toUpperCase();
  return type === 'DOMAIN' || type === 'PROGRAM';
}

/**
 * Enforces the locked map contract on a live GraphProjection:
 *  - only SYSTEM/ROOT (Universo), DOMAIN and CAMPAIGN survive as nodes;
 *  - every other type (TEST, CLAIM, DATASET, ARTIFACT, RESULT, EVIDENCE, HYPOTHESIS,
 *    RUN, DOCUMENT, PUBLICATION, ...) is stripped and reported as an issue instead of
 *    silently vanishing;
 *  - a campaign with no DOMAIN parent among the surviving edges is regrouped under the
 *    derived "Transversais" navigation group instead of being dropped or mislabeled as
 *    a canonical domain.
 * This is a pure function: it never mutates the input and never fabricates a node type
 * it wasn't given.
 */
export function enforceGraphEntityContract(projection: GraphProjection): GraphContractResult {
  const issues: GraphContractIssue[] = [];
  const rejectedIds = new Set<string>();

  const keptNodes: GraphNode[] = [];
  for (const node of projection.nodes) {
    const type = String(node.type || '').toUpperCase();
    if (MAP_ENTITY_TYPES.has(type)) {
      keptNodes.push(node);
      continue;
    }
    rejectedIds.add(node.id);
    issues.push({
      code: 'REJECTED_NODE_TYPE',
      nodeId: node.id,
      nodeType: type,
      message: `Node "${node.id}" has type ${type || 'UNKNOWN'}, which is not a graph entity under the locked contract (only SYSTEM/DOMAIN/CAMPAIGN render in the map). It stays reachable from Pesquisa/Atividade/Laboratorio/inspector.`
    });
  }

  const keptEdges: GraphEdge[] = [];
  for (const edge of projection.edges) {
    if (rejectedIds.has(edge.source) || rejectedIds.has(edge.target)) {
      issues.push({
        code: 'REJECTED_EDGE_TYPE',
        edgeId: edge.id,
        message: `Edge "${edge.id}" touches a rejected non-map entity and was dropped from the map projection.`
      });
      continue;
    }
    keptEdges.push(edge);
  }

  const clusterIds = new Set(keptNodes.filter(isClusterEntity).map(node => node.id));
  const campaignHasDomainParent = new Map<string, boolean>();
  for (const node of keptNodes) {
    if (isCampaign(node)) campaignHasDomainParent.set(node.id, false);
  }
  for (const edge of keptEdges) {
    if (clusterIds.has(edge.source) && campaignHasDomainParent.has(edge.target)) {
      campaignHasDomainParent.set(edge.target, true);
    } else if (clusterIds.has(edge.target) && campaignHasDomainParent.has(edge.source)) {
      campaignHasDomainParent.set(edge.source, true);
    }
  }

  const orphanCampaignIds = [...campaignHasDomainParent.entries()]
    .filter(([, hasParent]) => !hasParent)
    .map(([id]) => id);

  let finalNodes = keptNodes;
  let finalEdges = keptEdges;

  if (orphanCampaignIds.length > 0) {
    const transversalGroup: GraphNode = {
      id: TRANSVERSAL_GROUP_ID,
      label: 'Transversais',
      type: TRANSVERSAL_GROUP_TYPE,
      summary: 'Agrupamento visual derivado para campanhas sem domínio único. Não é um domínio canônico.'
    };
    finalNodes = [...keptNodes, transversalGroup];
    for (const campaignId of orphanCampaignIds) {
      finalEdges = [
        ...finalEdges,
        {
          id: `${TRANSVERSAL_GROUP_ID}:${campaignId}`,
          source: TRANSVERSAL_GROUP_ID,
          target: campaignId,
          type: 'DERIVED_GROUPING',
          declared: true
        }
      ];
      issues.push({
        code: 'ORPHAN_CAMPAIGN_GROUPED',
        nodeId: campaignId,
        message: `Campaign "${campaignId}" has no DOMAIN parent in this projection; grouped under the derived "Transversais" navigation group.`
      });
    }
  }

  return {
    projection: { ...projection, nodes: finalNodes, edges: finalEdges },
    issues
  };
}
