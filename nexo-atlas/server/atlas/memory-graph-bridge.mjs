// Offline/server composition of the existing Python retrieval result and JS graph.
// No network, subprocess, database, new truth store or Writer operation here.
import {createKnowledgeReader} from '../../worker/knowledge.mjs';

export function integrateMemoryGraph(tower, retrieval) {
  if (retrieval?.snapshot?.source_id !== tower?.stable_file_id || retrieval?.snapshot?.revision !== tower?.revision) throw new Error('MEMORY_GRAPH_SOURCE_CONFLICT');
  if (!Array.isArray(retrieval.hits) || retrieval.hits.length > 50 || !['hybrid','lexical','vector'].includes(retrieval.mode) || typeof retrieval.method !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(retrieval.method)) throw new Error('MEMORY_GRAPH_RESULT_INVALID');
  const scope = retrieval.role_scope;
  if (!scope || scope.source_revision !== tower.revision || scope.role !== retrieval.role || !['PITIA','LEARNER','ENGINEER','EXECUTOR','REFEREE_1','GUARDIAO','SENTINEL'].includes(scope.role) || !Array.isArray(scope.eligible_ids) || scope.eligible_ids.length > 100000 || scope.eligible_ids.some(id=>typeof id!=='string'||id.length>512)) throw new Error('MEMORY_GRAPH_ROLE_SCOPE_REQUIRED');
  const allowedIds = new Set(scope.eligible_ids);
  let reader;
  const query = body => (reader ??= createKnowledgeReader(tower, {allowedIds}))(body);
  const hits = [], seen = new Set(); let excluded = 0;
  for (const hit of retrieval.hits) {
    if (hits.length === 8) break;
    if (!hit || typeof hit.id !== 'string' || hit.id.length > 256 || !Number.isFinite(hit.score) || !Number.isFinite(hit.cosine)) throw new Error('MEMORY_GRAPH_RESULT_INVALID');
    if (seen.has(hit.id)) continue;seen.add(hit.id);
    const citation = hit.citation;
    if (!citation || citation.source_id !== tower.stable_file_id || citation.tower_revision !== tower.revision || citation.canonical_id !== hit.id || !/^[a-f0-9]{64}$/.test(citation.content_sha256)) throw new Error('MEMORY_GRAPH_CITATION_INVALID');
    let view;
    try {view = query({seed_id:hit.id,depth:0,limit:1});}
    catch (error) {if (error.message === 'KNOWLEDGE_TARGET_UNAVAILABLE') {excluded++;continue;}throw error;}
    const node = view.nodes[0];
    if (citation.path !== node.citation.path || citation.json_pointer !== node.citation.json_pointer || String(citation.entity_version) !== node.citation.entity_version || citation.object_id !== node.object_id) throw new Error('MEMORY_GRAPH_CITATION_INVALID');
    // Python and JavaScript encode some floats differently. Carry both declared
    // contracts; never pretend one hash is a Writer CAS precondition for the other.
    // Text/title/state come from the canonical JS read model, never the cache.
    hits.push({node,rank_score:hit.score,vector_cosine:hit.cosine,
      retrieval_citation:{...node.citation,canonical_id:node.id,object_id:node.object_id,
        content_sha256:citation.content_sha256,hash_contract:'PYTHON_JSON_V1'}});
  }
  return {contract:'ATLAS_LOCAL_MEMORY_GRAPH_V1',access:'PRIVATE',source_revision:tower.revision,
    memory_module:'nexo-memory-1.0.1',retrieval:{role:scope.role,mode:retrieval.mode,method:retrieval.method,
      model_sha256:typeof retrieval.model_sha256==='string' && /^[a-f0-9]{64}$/.test(retrieval.model_sha256)?retrieval.model_sha256:null,
      chunk_version:retrieval.chunk_version==='fields-1000-overlap120-v1'?retrieval.chunk_version:null,
      score_is_scientific_confidence:false},
    hits,excluded_hit_count:excluded,graph:hits.length?query({seed_id:hits[0].node.id,depth:1,limit:30,edge_limit:120}):null,
    graph_scope:'TOP_ELIGIBLE_HIT_ONE_HOP',derived:true,scientific_authority:false,applied:false,persisted:false,
    runtime:'LOCAL_COMPOSITION_ONLY',hosted_vector_cache:'NOT_CONNECTED'};
}
