// Owner-only, request-local view of nexo-memory-1.0.1 retrieval surfaces.
// The Python LSA/BM25 cache remains rebuildable and is not copied to D1.
// Human changes are append-only Writer proposals. This module never writes Tower.
import {canonicalDomain} from '../src/shared/domain-identity.mjs';
import {canonicalDigest} from '../server/atlas/json-stream.mjs';
import {normalizePrivateTower} from '../server/atlas/private-tower-input.mjs';
import {TOWER_ID} from '../server/mcp/operational-state.mjs';
import {readCanonicalDriveTower} from './drive-source.mjs';

export const MEMORY_CONTRACT = 'ATLAS_PRIVATE_MEMORY_V1';
export const ANNOTATION_SCOPE = 'ATLAS_MEMORY_OWNER_ANNOTATION_V1';
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const hash = v => canonicalDigest(v).slice(7);
const fail = (code, status = 400) => {throw Object.assign(new Error(code), {status});};
const EXCLUDED = /^(?:HEALTH|BODYBUILDING|OLYMPUS|OLY|PERSONAL|PERSON|CLIENT|PEER)(?:[.:/_-]|$)/i;
const DOMAIN_KEY = /^(?:domain|domain_id|subdomain_id|topic_id|source_domains|target_domains|from_domain|to_domain|client_id|person_id)$/i;
function excluded(value, path = '') {
  if (path.split('/').some(x => EXCLUDED.test(x))) return true;
  if (Array.isArray(value)) return value.some(v => excluded(v));
  if (!object(value)) return false;
  for (const [key, entry] of Object.entries(value)) {
    if (DOMAIN_KEY.test(key) && (Array.isArray(entry) ? entry : [entry]).some(v => (EXCLUDED.test(String(v)) || EXCLUDED.test(canonicalDomain(v)) || /^(?:subdomain_id|topic_id)$/i.test(key) && typeof v === 'string' && v.split('.').some(part => EXCLUDED.test(canonicalDomain(part)))))) return true;
    if (entry && typeof entry === 'object' && excluded(entry)) return true;
  }
  return false;
}
const SECRET = /(?:password|passwd|secret|private.?key|api.?key|access.?token|refresh.?token|authorization|credential|cookie)/i;
export function cleanMemory(value) {
  if (Array.isArray(value)) return value.map(cleanMemory);
  if (object(value)) return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET.test(key)).map(([key, v]) => [key, cleanMemory(v)]));
  if (typeof value === 'string') return value.replace(/(https?:\/\/[^\s?]+)\?[^\s]+/gi, '$1?[query-redacted]').replace(/bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]');
  return value;
}
const text = v => typeof v === 'string' ? v : v == null ? '' : String(v);
const list = v => Array.isArray(v) ? v : v ? [v] : [];
function references(value, found = new Set()) {
  if (Array.isArray(value)) {value.forEach(v => references(v, found)); return [...found].sort();}
  if (!object(value)) return [...found].sort();
  for (const [key, v] of Object.entries(value)) {
    if (/(?:_id|_ref|_refs|_ids)$/.test(key) || ['refs', 'supersedes', 'contradicts'].includes(key)) for (const ref of list(v)) if (typeof ref === 'string') found.add(ref);
    if (v && typeof v === 'object') references(v, found);
  }
  return [...found].sort();
}
function prose(value, prefix = '') {
  if (Array.isArray(value)) return value.length > 16 && value.every(v => typeof v === 'number') ? `${prefix}: numerical array (${value.length}; read source)` : value.map(v => prose(v, prefix)).join('\n');
  if (object(value)) return Object.entries(value).filter(([k]) => !['entity_version','created_at','updated_at'].includes(k)).map(([k,v]) => prose(v, [prefix,k].filter(Boolean).join('.'))).join('\n');
  return value == null ? '' : `${prefix}: ${value}`;
}

export function memoryDocuments(tower) {
  normalizePrivateTower(tower);
  const rows = [], paths = Object.keys(tower.files).sort();
  const add = (path, value, kind, id, pointer = '') => {
    if (!object(value) || excluded(value, path)) return;
    kind = text(value.kind || kind).toUpperCase();
    if (kind.endsWith('_NOOP') || kind.startsWith('UNAPPLIED_') || ['INBOX_RECORD','OPERATOR_INTENT','ACTION'].includes(kind)) return;
    id = text(id); const canonicalId = id.startsWith(kind + '::') ? id : `${kind}::${id}`;
    const safe = cleanMemory(value), payload = object(safe.payload) ? safe.payload : {};
    const body = prose(safe), refs = references(safe);
    let state = text(safe.state || safe.status || safe.charter?.status || 'RECORDED').toUpperCase();
    if (safe.retired_at) state = 'RETIRED'; if (safe.resolved_at && kind === 'BOARD_POST') state = 'ARCHIVED'; if (safe.retracted_at) state = 'RETRACTED';
    const annotation = payload.scope === ANNOTATION_SCOPE && payload.scientific_authority === false && payload.author_kind === 'OWNER';
    rows.push({canonical_id: canonicalId, object_id: id, kind, title: text(safe.display_name || safe.title || safe.question || id).slice(0,220),
      state, topic: text(safe.semantic?.topic_id || safe.topic_id || payload.topic_id || safe.roadmap_id),
      text: body.slice(0,16000), truncated: body.length > 16000, refs,
      provisional: /PROVISIONAL|CANDIDATE|DRAFT|PROPOSED|PENDING|UNVERIFIED|CONTESTED/.test(state) || /CANDIDATE/.test(kind),
      feedback: object(payload.retrieval_feedback), annotation, annotation_type: annotation ? payload.annotation_type : null,
      annotation_text: annotation ? text(payload.text) : null, annotation_reason: annotation ? text(payload.reason) : null,
      target_id: annotation ? payload.target?.canonical_id : null, supersedes: annotation ? payload.supersedes || null : null,
      created_at: text(safe.created_at), updated_at: text(safe.updated_at),
      citation: {source_id: TOWER_ID, tower_revision: tower.revision, path, json_pointer: pointer, entity_version: text(value.entity_version || value.version || 'unversioned'), content_sha256: hash(value), hash_contract: 'ATLAS_JSON_V1'},
      _supersedes: list(safe.supersedes)});
  };
  for (const path of paths) {
    const entry = tower.files[path], value = entry?.value;
    if (entry?.encoding !== 'json' || !object(value)) continue;
    const stem = path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '');
    if (path.startsWith('entities/')) add(path, value, path.split('/')[1], value.id || value.work_id || stem);
    else if (path.startsWith('roadmaps/')) add(path, value, 'ROADMAP', stem);
    else if (path.startsWith('contracts/')) add(path, value, 'CONTRACT', stem);
    else if (path === 'evolution/board.json') list(value.posts).forEach((v,i) => add(path,v,'BOARD_POST',v?.id || String(i),`/posts/${i}`));
    else if (path === 'evolution/learning.json') list(value.rules).forEach((v,i) => add(path,v,'LEARNED_RULE',v?.id || `${v?.feature}=${v?.value}`,`/rules/${i}`));
    else if (['evolution/families.json','evolution/incidents.json','evolution/thoughts.json'].includes(path)) {
      const [key,kind] = {'evolution/families.json':['families','FAMILY'],'evolution/incidents.json':['incidents','INCIDENT'],'evolution/thoughts.json':['entries','THOUGHT']}[path];
      for (const [i,v] of Object.entries(value[key] || {})) add(path,v,kind,v?.id || v?.family_id || i,`/${key}/${i.replace(/~/g,'~0').replace(/\//g,'~1')}`);
    } else if (path === 'runtime/artifacts/meta_learning/METALEARNING_CURRENT.json') add(path,value,'PROCEDURAL_STATE','METALEARNING_CURRENT');
  }
  const byId = new Map();
  for (const row of rows) {const siblings = byId.get(row.canonical_id) || []; siblings.push(row); byId.set(row.canonical_id, siblings);}
  for (const siblings of byId.values()) if (new Set(siblings.map(v => v.citation.content_sha256)).size > 1) siblings.forEach(row => {row.ambiguous_identity = true; row.canonical_id += '#' + row.citation.content_sha256.slice(0,16);});
  for (const row of rows) for (const id of row._supersedes) for (const target of rows) if (target.canonical_id === id || target.object_id === id) target.state = 'SUPERSEDED';
  // Match Python memory 1.0.1: identical duplicates retain the first sorted
  // source path. Conflicting duplicates were already quarantined above.
  const unique = new Map();
  for (const row of rows) {delete row._supersedes;if(!unique.has(row.canonical_id))unique.set(row.canonical_id,row);}
  return [...unique.values()].sort((a,b) => a.canonical_id.localeCompare(b.canonical_id));
}

export function browseMemory(tower, body = {}) {
  const allowed = ['query','kind','status','related_id','offset','limit','expected_revision'];
  if (Object.keys(body).some(key => !allowed.includes(key))) fail('MEMORY_QUERY_INVALID');
  for (const key of ['query','kind','status','related_id']) if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > 256)) fail('MEMORY_QUERY_INVALID');
  if (body.expected_revision && body.expected_revision !== tower.revision) fail('MEMORY_REVISION_CONFLICT',409);
  const offset = body.offset ?? 0, limit = body.limit ?? 30;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) fail('MEMORY_QUERY_INVALID');
  if (body.status && !['all','provisional','feedback','annotations'].includes(body.status)) fail('MEMORY_QUERY_INVALID');
  const docs = memoryDocuments(tower), requestedId = text(body.query).trim(), needle = requestedId.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const matches = docs.filter(row => (!body.kind || body.kind === 'all' || row.kind === body.kind)
    && (!body.status || body.status === 'all' || body.status === 'provisional' && row.provisional || body.status === 'feedback' && row.feedback || body.status === 'annotations' && row.annotation)
    && (!body.related_id || row.object_id === body.related_id || row.canonical_id === body.related_id || row.refs.includes(body.related_id))
    && (!needle || [row.title,row.text,row.canonical_id,row.topic,...row.refs].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(needle)));
  // An exact identity must precede records that merely mention it. Stable sort
  // preserves the existing canonical order for all other lexical matches.
  if (requestedId) matches.sort((a,b) => Number(b.canonical_id === requestedId || b.object_id === requestedId) - Number(a.canonical_id === requestedId || a.object_id === requestedId));
  return {contract: MEMORY_CONTRACT, access:'PRIVATE', source_revision:tower.revision, observed_at:tower.updated_at,
    retrieval_module:'nexo-memory-1.0.1', view:'CANONICAL_RETRIEVAL_SURFACES', search:'LEXICAL_SOURCE_BROWSE',
    derived_cache:{status:'NOT_CONNECTED', reason:'No persisted LSA, candidate or local feedback cache is available to this Site.'},
    writer:{status:'NOT_CONNECTED', can_apply:false, reason:'EXISTING_WRITER_ROUTE_REQUIRED'},
    total:matches.length, kinds:[...new Set(docs.map(v => v.kind))].sort(), offset, next_offset:offset+limit < matches.length ? offset+limit : null, items:matches.slice(offset,offset+limit).map(row => {
      const history = docs.filter(v => v.annotation && v.target_id === row.canonical_id).sort((a,b) => a.created_at.localeCompare(b.created_at) || a.canonical_id.localeCompare(b.canonical_id));
      return {...row, history:history.slice(-100), history_total:history.length};
    })};
}

export function prepareMemoryProposal(tower, body, now = new Date().toISOString()) {
  const allowed = ['target_id','expected_revision','expected_content_sha256','annotation_type','text','reason','supersedes'];
  if (Object.keys(body).some(k => !allowed.includes(k))) fail('MEMORY_EDIT_FIELDS_INVALID');
  if (body.expected_revision !== tower.revision) fail('MEMORY_REVISION_CONFLICT',409);
  if (!['NOTE','CORRECTION','DECISION'].includes(body.annotation_type) || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 6000 || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 1500) fail('MEMORY_EDIT_INVALID');
  const docs = memoryDocuments(tower), target = docs.find(row => row.canonical_id === body.target_id);
  if (!target || target.ambiguous_identity) fail('MEMORY_TARGET_UNAVAILABLE',409);
  if (body.expected_content_sha256 !== target.citation.content_sha256) fail('MEMORY_CONTENT_CONFLICT',409);
  let previous = null;
  if (body.supersedes) {
    previous = docs.find(row => row.canonical_id === body.supersedes);
    if (!previous?.annotation || previous.target_id !== target.canonical_id || docs.some(row => row.annotation && row.supersedes === previous.canonical_id)) fail('MEMORY_ANNOTATION_CONFLICT',409);
  }
  const payload = {scope:ANNOTATION_SCOPE, scientific_authority:false, author_kind:'OWNER', annotation_type:body.annotation_type,
    text:body.text.trim(), reason:body.reason.trim(), target:{canonical_id:target.canonical_id,...target.citation},
    supersedes:previous?.canonical_id || null, refs:[target.object_id, ...(previous ? [previous.object_id] : [])]};
  const stableId = 'atlas-memory-owner-' + hash({payload,created_at:now}).slice(0,32);
  return {contract:'ATLAS_MEMORY_EDIT_REVIEW_V1', state:'DRAFT', persisted:false, applied:false, writer_status:'NOT_CONNECTED',
    blocking_reason:'EXISTING_WRITER_ROUTE_REQUIRED', expected_tower_revision:tower.revision, writer_inbox_filename:stableId + '.json',
    requires:['SAME_OWNER_AUTHORIZATION','CANONICAL_WRITER','TOWER_REVISION_CAS','APPEND_ONLY_ARTIFACT','WRITER_RECEIPT','CANONICAL_READBACK'],
    proposal:{stable_id:stableId,intent_id:stableId,kind:'LEARNING_SIGNAL',source:'ATLAS_OWNER',producer:'ATLAS',created_at:now,payload},
    changes_historical_evidence:false};
}
export async function readMemorySource({binding} = {}) {return (await readCanonicalDriveTower(binding)).tower;}
export async function memoryRoute(path, body, read) {
  // This app's existing connector grant is read_only. No generic proxy or writes.
  if (path === '/api/atlas-memory/apply') return {status:503,body:{error:'EXISTING_WRITER_ROUTE_REQUIRED',applied:false,persisted:false}};
  try {
    const tower = await read();
    return {status:200,body:path.endsWith('/browse') ? browseMemory(tower,body) : prepareMemoryProposal(tower,body)};
  } catch (error) {if (error?.status) return {status:error.status,body:{error:error.message,applied:false}}; throw error;}
}
