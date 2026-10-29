export interface SourceCitation {
  source_id: string;
  tower_revision: string;
  path: string;
  json_pointer: string;
  entity_version: string;
  content_sha256: string;
  hash_contract: 'ATLAS_JSON_V1';
}
export interface KnowledgeQuery {
  query?: string;
  seed_id?: string;
  domain?: string;
  topic_id?: string;
  depth?: number;
  limit?: number;
  edge_limit?: number;
  include_history?: boolean;
  expected_revision?: string;
}
export interface KnowledgeNode {
  id: string; object_id: string; kind: string; title: string; state: string;
  provisional: boolean; hop: number; citation: SourceCitation;
  semantic: {domain_id: string; subdomain_id: string | null; topic_id: string | null; basis: 'CANONICAL_FIELDS_ONLY'};
}
export interface KnowledgeView {
  contract: 'ATLAS_PRIVATE_KNOWLEDGE_V1'; access: 'PRIVATE'; source_revision: string; observed_at: string;
  derived: true; scientific_authority: false;
  writer: {can_apply: false; status: 'NOT_CONNECTED'};
  retrieval: {mode: 'LEXICAL_AND_EXPLICIT_GRAPH'; vector_cache: 'NOT_CONNECTED'; embedding_model: null; similarity_is_evidence: false};
  nodes: KnowledgeNode[];
  edges: Array<{id: string; source: string; target: string; kind: string; basis: 'EXPLICIT_SOURCE_REFERENCE'; evidence: SourceCitation}>;
  domains: Array<{id: string; count: number}>;
  unresolved_reference_count: number; quarantined_identity_count: number;
  coverage: {eligible_nodes: number; returned_nodes: number; returned_edges: number; truncated: boolean; traversal: 'BOTH_DIRECTIONS_OF_EXPLICIT_REFERENCES'; depth: number; metrics_scope: 'RETURNED_GRAPH_ONLY'};
  metrics: {components: number; cyclic_nodes: string[]; articulation_nodes: string[]};
}
export type KnowledgeRead = (action: 'browse' | 'graph', body: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;

/** Captured native fetch, two fixed read routes. No token, URL, Writer or persistence parameter. */
export function createKnowledgeTransport(nativeFetch: typeof fetch): KnowledgeRead {
  return async (action, body, signal) => {
    if (action !== 'browse' && action !== 'graph') throw new Error('KNOWLEDGE_ACTION_DENIED');
    const response = await nativeFetch(action === 'graph' ? '/api/atlas-knowledge/query' : '/api/atlas-memory/browse', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal,
    });
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(typeof value?.error === 'string' ? value.error : 'KNOWLEDGE_UNAVAILABLE'), {status: response.status});
    return value;
  };
}
