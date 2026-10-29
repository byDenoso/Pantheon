// A request-local read model. Tower remains canonical; this graph is rebuildable.
// Reuse the existing graph kernels instead of introducing another graph database.
import {canonicalDomain, resolveDomain, domainAliases, semanticDomainPath, validateDomainHierarchy} from '../src/shared/domain-identity.mjs';
import {memoryDocuments, cleanMemory} from './memory.mjs';
import {indexGraph, components, cyclicNodes, articulationPoints} from '../src/tower-web/graph.ts';

export const KNOWLEDGE_CONTRACT = 'ATLAS_PRIVATE_KNOWLEDGE_V1';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = value => Array.isArray(value) ? value : value == null ? [] : [value];
const string = value => typeof value === 'string' ? value : '';
const fold = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const fail = (message, status = 400) => {throw Object.assign(new Error(message), {status});};
const EXCLUDED = /^(?:HEALTH|BODYBUILDING|OLYMPUS|OLY|PERSONAL|PERSON|CLIENT|PEER)(?:[.:/_-]|$)/i;
const FIELD = /^(?:domain|domain_id|subdomain_id|topic_id|source_domains|target_domains|from_domain|to_domain|client_id|person_id)$/i;
function privateDomain(value) {
  if (Array.isArray(value)) return value.some(privateDomain);
  if (!object(value)) return false;
  return Object.entries(value).some(([key, item]) => FIELD.test(key) && list(item).some(v => (EXCLUDED.test(string(v)) || EXCLUDED.test(canonicalDomain(v)) || /^(?:subdomain_id|topic_id)$/i.test(key) && typeof v === 'string' && v.split('.').some(part => EXCLUDED.test(canonicalDomain(part))))) || privateDomain(item));
}
function sourceObject(tower, citation) {
  let value = tower.files[citation.path]?.value;
  for (const part of citation.json_pointer.split('/').slice(1)) value = value?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  return object(value) ? value : {};
}
const RELATIONS = {
  hypothesis_id: ['TESTS_HYPOTHESIS', 'HYPOTHESIS'], hypothesis_ids: ['RELATES_TO_HYPOTHESIS', 'HYPOTHESIS'],
  test_id: ['RELATES_TO_TEST', 'TEST'], test_ids: ['RELATES_TO_TEST', 'TEST'],
  recipe_id: ['USES_RECIPE', 'RECIPE'], recipe: ['USES_RECIPE', 'RECIPE'],
  dataset_id: ['USES_DATASET', 'DATASET'], dataset_ids: ['USES_DATASET', 'DATASET'],
  roadmap_id: ['IN_ROADMAP', 'ROADMAP'], campaign_id: ['IN_CAMPAIGN', 'CAMPAIGN'],
  depends_on: ['DEPENDS_ON', null], dependency_ids: ['DEPENDS_ON', null], parents: ['DEPENDS_ON', 'TEST'],
  supersedes: ['SUPERSEDES', null], contradicts: ['CONTRADICTS', null], contest_of: ['CONTESTS', null],
  derived_from: ['DERIVED_FROM', null], source_refs: ['REFERENCES', null], refs: ['REFERENCES', null],
};
function relationRefs(value, pointer = '', out = []) {
  if (Array.isArray(value)) value.forEach((item, i) => relationRefs(item, `${pointer}/${i}`, out));
  else if (object(value)) for (const [key, item] of Object.entries(value)) {
    const path = `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
    if (Object.hasOwn(RELATIONS, key)) list(item).forEach((ref, i) => {
      if (typeof ref === 'string') out.push({ref, kind: RELATIONS[key][0], expected: RELATIONS[key][1], field: Array.isArray(item) ? `${path}/${i}` : path});
    });
    if (item && typeof item === 'object') relationRefs(item, path, out);
  }
  return out;
}
function validate(body) {
  if (!object(body)) fail('KNOWLEDGE_QUERY_INVALID');
  const allowed = ['query','seed_id','domain','topic_id','depth','limit','edge_limit','include_history','expected_revision'];
  if (Object.keys(body).some(key => !allowed.includes(key))) fail('KNOWLEDGE_QUERY_INVALID');
  for (const key of ['query','seed_id','domain','topic_id']) if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > 256)) fail('KNOWLEDGE_QUERY_INVALID');
  for (const [key, max] of [['depth',3],['limit',100],['edge_limit',300]]) if (body[key] !== undefined && (!Number.isInteger(body[key]) || body[key] < (key === 'depth' ? 0 : 1) || body[key] > max)) fail('KNOWLEDGE_QUERY_INVALID');
  if (body.include_history !== undefined && typeof body.include_history !== 'boolean') fail('KNOWLEDGE_QUERY_INVALID');
  if (body.expected_revision !== undefined && (typeof body.expected_revision !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(body.expected_revision))) fail('KNOWLEDGE_QUERY_INVALID');
}

// Request-local reader: never cache it across requests, revisions or roles.
// Capture the scope so a caller cannot expand it by mutating its original Set.
export function createKnowledgeReader(tower, {allowedIds, includeHistory = false} = {}) {
  const revision = tower.revision, observedAt = tower.updated_at;
  allowedIds = allowedIds && new Set(allowedIds);
  const records = memoryDocuments(tower), eligible = [], sourceById = new Map();
  const rawHierarchy = Object.entries(tower.files).filter(([path, entry]) => /^contracts\/[^/]+_DOMAIN_ROUTING_V\d+\.json$/.test(path) && entry?.encoding === 'json').flatMap(([path, {value}]) => typeof value?.owner_domain === 'string' && Array.isArray(value.subdomains) ? value.subdomains.filter(child => typeof child === 'string').map(child => ({parent:canonicalDomain(value.owner_domain),child:canonicalDomain(child),path})) : []);
  const {links:hierarchy}=validateDomainHierarchy(rawHierarchy);
  let quarantined = 0;
  for (const row of records) {
    // Optional server-local role scope. Never accepted from a browser request.
    if (allowedIds && !allowedIds.has(row.canonical_id)) continue;
    const source = cleanMemory(sourceObject(tower, row.citation));
    if (privateDomain(source)) continue;
    if (row.ambiguous_identity) {quarantined++; continue;}
    if (!includeHistory && /^(?:SUPERSEDED|RETIRED|RETRACTED|INVALIDATED|TOMBSTONE|DELETED|ARCHIVED)$/.test(row.state)) continue;
    const semantic = object(source.semantic) ? source.semantic : {};
    const sourceDomain = string(semantic.domain_id || source.domain_id || source.domain) || 'UNMAPPED';
    const resolution = resolveDomain(string(source.domain || source.domain_id || semantic.domain_id) || 'UNMAPPED'), memberships = new Set([resolution.id]);
    for (const path of semanticDomainPath(source)) for (const link of hierarchy) if (path.segments.length >= 2 && canonicalDomain(path.segments[0]) === link.parent && canonicalDomain(path.segments[1]) === link.child && [link.parent,link.child].includes(resolution.id)) memberships.add(link.child);
    const pending=[...memberships];while(pending.length){const child=pending.shift();for(const link of hierarchy)if(link.child===child&&!memberships.has(link.parent)){memberships.add(link.parent);pending.push(link.parent);}}
    // A declared descendant/ancestor cannot reintroduce a private domain after the raw-source gate.
    if ([...memberships].some(id => EXCLUDED.test(id))) continue;
    eligible.push({id: row.canonical_id, object_id: row.object_id, kind: row.kind, title: row.title, state: row.state,
      provisional: row.provisional, semantic: {
        domain_id: sourceDomain, grouping_domain_id: resolution.id, domain_resolution:resolution, membership_ids:[...memberships].sort(),
        subdomain_id: string(semantic.subdomain_id || source.subdomain_id) || null,
        topic_id: string(semantic.topic_id || source.topic_id) || null,
        basis: 'CANONICAL_FIELDS_ONLY',
      }, citation: row.citation});
    sourceById.set(row.canonical_id, {source, row});
  }
  const byId = new Map(eligible.map(row => [row.id, row])), aliases = new Map();
  for (const row of eligible) {const values = aliases.get(row.object_id) || []; values.push(row); aliases.set(row.object_id, values);}
  const links = [], seen = new Set(); let unresolved = 0;
  for (const node of eligible) for (const ref of relationRefs(sourceById.get(node.id).source)) {
    const candidates = byId.has(ref.ref) ? [byId.get(ref.ref)] : (aliases.get(ref.ref) || []).filter(row => !ref.expected || row.kind === ref.expected);
    if (candidates.length !== 1 || ref.expected && candidates[0].kind !== ref.expected) {unresolved++; continue;}
    const target = candidates[0], id = JSON.stringify([node.id, target.id, ref.kind, ref.field]);
    if (seen.has(id)) continue; seen.add(id);
    links.push({id, source: node.id, target: target.id, kind: ref.kind, basis: 'EXPLICIT_SOURCE_REFERENCE',
      evidence: {...node.citation, json_pointer: node.citation.json_pointer + ref.field}});
    if (links.length > 100000) fail('KNOWLEDGE_GRAPH_TOO_LARGE', 413);
  }
  links.sort((a,b) => a.id.localeCompare(b.id));
  const adjacency = new Map();
  for (const edge of links) for (const [from,to] of [[edge.source,edge.target],[edge.target,edge.source]]) {const values = adjacency.get(from) || []; values.push(to); adjacency.set(from,values);}
  const domainMembers = new Map();
  for (const row of eligible) for (const id of row.semantic.membership_ids) {const members = domainMembers.get(id) || new Set(); members.add(row.id); domainMembers.set(id,members);}
  const domains = [...domainMembers].sort(([a],[b])=>a.localeCompare(b)).map(([id,members])=>({id,count:members.size,aliases:domainAliases(id),count_basis:'UNIQUE_ELIGIBLE_CANONICAL_IDS; EXPLICIT_DESCENDANTS_INCLUDED'}));
  return (body = {}) => {
    validate(body);
    if (body.expected_revision && body.expected_revision !== revision) fail('KNOWLEDGE_REVISION_CONFLICT', 409);
    if ((body.include_history ?? false) !== includeHistory) fail('KNOWLEDGE_HISTORY_SCOPE_CONFLICT', 409);
    const allowed = new Set(eligible.filter(row => (!body.domain || row.semantic.membership_ids.includes(canonicalDomain(body.domain))) && (!body.topic_id || row.semantic.topic_id === body.topic_id)).map(row => row.id));
    const needle = fold(body.query || '');
    let roots;
    if (body.seed_id) {
      const choices = byId.has(body.seed_id) ? [byId.get(body.seed_id)] : aliases.get(body.seed_id) || [];
      if (choices.length !== 1 || !allowed.has(choices[0].id)) fail('KNOWLEDGE_TARGET_UNAVAILABLE', 409);
      roots = choices;
    } else roots = eligible.filter(row => allowed.has(row.id) && (!needle || fold([row.id,row.title,...row.semantic.membership_ids.flatMap(domainAliases),sourceById.get(row.id).row.text].join(' ')).includes(needle)));
    const limit = body.limit ?? 30, depth = body.depth ?? (body.seed_id ? 1 : 0), edgeLimit = body.edge_limit ?? 120;
    const picked = new Map(roots.slice(0,limit).map(row => [row.id, {node:row, hop:0}]));
    let truncated = roots.length > limit;
    for (let hop = 0; hop < depth; hop++) for (const [id, entry] of [...picked]) {
      if (entry.hop !== hop) continue;
      for (const next of adjacency.get(id) || []) if (allowed.has(next) && !picked.has(next)) {
        if (picked.size === limit) {truncated=true; continue;}
        picked.set(next,{node:byId.get(next),hop:hop+1});
      }
    }
    const nodes = [...picked.values()].map(({node,hop}) => ({...node,hop,semantic:{...node.semantic,membership_ids:[...node.semantic.membership_ids],domain_resolution:{...node.semantic.domain_resolution}},citation:{...node.citation}})).sort((a,b) => a.hop-b.hop || a.id.localeCompare(b.id));
    const matchingEdges = links.filter(edge => picked.has(edge.source) && picked.has(edge.target)), edges = matchingEdges.slice(0,edgeLimit).map(edge => ({...edge,evidence:{...edge.evidence}}));
    const graph = indexGraph(nodes.map(row => row.id), edges.map(row => [row.source,row.target]));
    return {contract:KNOWLEDGE_CONTRACT,access:'PRIVATE',source_revision:revision,observed_at:observedAt,
      derived:true,scientific_authority:false,writer:{can_apply:false,status:'NOT_CONNECTED'},
      retrieval:{mode:'LEXICAL_AND_EXPLICIT_GRAPH',vector_cache:'NOT_CONNECTED',embedding_model:null,similarity_is_evidence:false},
      nodes,edges,domains:domains.map(row=>({...row,aliases:[...row.aliases]})),unresolved_reference_count:unresolved,quarantined_identity_count:quarantined,
      coverage:{eligible_nodes:eligible.length,returned_nodes:nodes.length,returned_edges:edges.length,truncated:truncated||matchingEdges.length>edgeLimit,
        traversal:'BOTH_DIRECTIONS_OF_EXPLICIT_REFERENCES',depth,metrics_scope:'RETURNED_GRAPH_ONLY'},
      metrics:{components:components(graph).length,cyclic_nodes:[...cyclicNodes(graph)].sort(),articulation_nodes:[...articulationPoints(graph)].sort()}};
  };
}

export function queryKnowledge(tower, body = {}, options = {}) {
  validate(body);
  if (body.expected_revision && body.expected_revision !== tower.revision) fail('KNOWLEDGE_REVISION_CONFLICT', 409);
  return createKnowledgeReader(tower, {...options, includeHistory:body.include_history ?? false})(body);
}

export async function knowledgeRoute(body, read) {
  try {validate(body);return {status:200,body:queryKnowledge(await read(),body)};}
  catch(error) {if(error?.status)return {status:error.status,body:{error:error.message,applied:false}};throw error;}
}
