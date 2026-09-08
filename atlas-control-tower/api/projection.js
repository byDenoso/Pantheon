/** GET /api/projection — the three real graph projections.
 *
 *  ?layers=science|execution|integrity  one, two or three, comma separated
 *  ?zoom=1|2|3                          semantic zoom: macro → meso → micro
 *  ?tier= ?signal= ?authority= ?domain= ?q=   server-side view, not a client filter
 *  ?focus=<id>&direction=neighbors|ancestors|descendants|lineage&depth=n
 *
 *  Each layer is assembled from its own tables by lib/projections.mjs. A layer
 *  whose reader fails is reported as SOURCE_UNAVAILABLE with the table that
 *  failed — it is never replaced by another layer's nodes, and never by zeros. */

import {
 buildScience, buildExecution, buildIntegrity, composeProjections, applyView, traverse,
 parseLayers, PROJECTION_STATE, PROJECTION_CONTRACT, LAYERS, LAYER_IDS
} from '../lib/projections.mjs';
import {readTable, countTable, NeonReadError} from '../lib/neon-read.mjs';
import {loadCockpitIndex, cockpitMeta} from './runtime-semantic.js';

const TTL = 60000;
const cache = new Map();          // layer → {at, projection}

const RECORD_TABLES = [
 ['science_v1', 'entities'], ['science_v1', 'relations'], ['science_v1', 'provenance'],
 ['science_v1', 'assets'], ['nexo_ops', 'actions'], ['nexo_ops', 'execution_runs'],
 ['nexo_ops', 'runtime_events'], ['learning_v1', 'patterns']
];

function urlOf(req) {return new URL(req.url || '/', 'https://atlas.local')}
function queryOf(req) {
 const q = Object.fromEntries(urlOf(req).searchParams);
 delete q.route;
 return q;
}
function sendJson(res, value, status = 200) {
 res.statusCode = status;
 res.setHeader('Content-Type', 'application/json; charset=utf-8');
 res.setHeader('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
 res.setHeader('X-Content-Type-Options', 'nosniff');
 return res.end(JSON.stringify(value));
}

/** A failed layer becomes a first-class, readable state — never an empty graph
 *  that looks like "there is nothing here". */
function failedLayer(layerId, error) {
 const kind = error instanceof NeonReadError ? error.kind : 'BACKEND_ERROR';
 const state = kind === 'PERMISSION_ERROR' ? PROJECTION_STATE.PERMISSION_ERROR
  : kind === 'OIDC_NOT_AVAILABLE' ? PROJECTION_STATE.PERMISSION_ERROR
  : kind === 'SOURCE_UNAVAILABLE' ? PROJECTION_STATE.SOURCE_UNAVAILABLE
  : PROJECTION_STATE.BACKEND_ERROR;
 return {
  contract: PROJECTION_CONTRACT,
  layer: layerId,
  label: LAYERS[layerId]?.label || layerId,
  question: LAYERS[layerId]?.question || '',
  tiers: [...(LAYERS[layerId]?.tiers || [])],
  nodes: [], edges: [], clusters: [],
  state,
  error: {
   kind,
   table: error?.table ? `${error.profile}.${error.table}` : '',
   status: error?.status || 0,
   detail: String(error?.detail || error?.message || error).slice(0, 200)
  },
  metadata: {counts: {}, tiers: {}, drawnNodes: 0, edgeCount: 0, truncated: false},
  generatedAt: new Date().toISOString(),
  sourceState: {sourceVersion: '', freshness: 'UNKNOWN', readAt: new Date().toISOString()},
  integrity: {canonicalNodes: 0, derivedNodes: 0, derivedRatio: 0, unlinkedNodes: 0, truncated: false, derivations: []},
  fingerprint: ''
 };
}

/* ------------------------------------------------------------------ readers */

async function readScience(req) {
 const [
  domains, entities, entityDomains, relations, provenance,
  assets, publicationSubmissions, resultSubjects, entityDisplay
 ] = await Promise.all([
  readTable(req, 'science_v1', 'domains', {select: '*', limit: 1000}),
  readTable(req, 'science_v1', 'entities', {select: 'entity_id,entity_type,title,summary,status,current_revision_id,source_surface,source_row_key,updated_at', limit: 10000}),
  readTable(req, 'science_v1', 'entity_domains', {select: '*', limit: 10000}),
  readTable(req, 'science_v1', 'relations', {select: '*', limit: 10000}),
  readTable(req, 'science_v1', 'provenance', {select: 'provenance_id,owner_entity_id,source_kind,source_id,source_location,authority,hash,observed_at', limit: 10000}),
  readTable(req, 'science_v1', 'assets', {select: '*', limit: 2000}),
  readTable(req, 'science_v1', 'publication_submissions', {select: '*', limit: 2000}),
  readTable(req, 'science_v1', 'result_subjects', {select: '*', limit: 10000}),
  readTable(req, 'science_v1', 'entity_display', {select: 'entity_id,display_label,is_curated,naming_method,naming_version,generated_at', limit: 10000})
 ]);
 return {domains, entities, entityDomains, relations, provenance, assets, publicationSubmissions, resultSubjects, entityDisplay};
}

async function readExecution(req) {
 const [actions, runs, events, attention, currentState] = await Promise.all([
  readTable(req, 'nexo_ops', 'actions', {select: '*', order: 'updated_at.desc', limit: 1000}),
  readTable(req, 'nexo_ops', 'execution_runs', {select: '*', order: 'created_at.desc', limit: 2000}),
  readTable(req, 'nexo_ops', 'runtime_events', {select: '*', order: 'occurred_at.desc', limit: 2000}),
  readTable(req, 'nexo_ops', 'attention_items', {select: '*', limit: 1000}),
  readTable(req, 'nexo_ops', 'current_state', {select: '*', limit: 1000})
 ]);
 return {actions, runs, events, attention, currentState};
}

async function readIntegrity(req) {
 const [
  truthStates, sources, revisions, syncState, scienceBatches, learningBatches,
  entityDisplay, migrationIssues, learningIssues, runs, patterns
 ] = await Promise.all([
  readTable(req, 'nexo_ops', 'truth_states', {select: '*', limit: 200}),
  readTable(req, 'science_v1', 'sources', {select: '*', limit: 2000}),
  readTable(req, 'science_v1', 'revisions', {select: 'revision_id,entity_id,source_surface,observed_at,is_current', limit: 20000}),
  readTable(req, 'nexo_ops', 'sync_state', {select: '*', limit: 1000}),
  readTable(req, 'science_v1', 'import_batches', {select: '*', limit: 1000}),
  readTable(req, 'learning_v1', 'import_batches', {select: '*', limit: 1000}).catch(() => []),
  readTable(req, 'science_v1', 'entity_display', {select: 'entity_id,is_curated,naming_method,naming_version,generated_at', limit: 10000}),
  readTable(req, 'science_v1', 'migration_issues', {select: '*', limit: 5000}),
  readTable(req, 'learning_v1', 'migration_issues', {select: '*', limit: 5000}).catch(() => []),
  readTable(req, 'nexo_ops', 'execution_runs', {select: 'id,domain,status,artifact_hash,readback_verified,created_at', order: 'created_at.desc', limit: 2000}),
  readTable(req, 'learning_v1', 'patterns', {select: '*', limit: 5000})
 ]);
 // Counts are probed, not guessed. An unreadable count stays null rather than 0.
 const counts = await Promise.all(RECORD_TABLES.map(async ([profile, table]) => {
  const total = await countTable(req, profile, table).catch(() => null);
  return [`${profile}.${table}`, total];
 }));
 const recordCounts = Object.fromEntries(counts.filter(([, total]) => total != null));
 return {
  truthStates, sources, revisions, syncState,
  importBatches: [...scienceBatches, ...learningBatches],
  entityDisplay, migrationIssues, learningIssues, runs, patterns, recordCounts
 };
}

const BUILDERS = {
 science: {read: readScience, build: buildScience},
 execution: {read: readExecution, build: buildExecution},
 integrity: {read: readIntegrity, build: buildIntegrity}
};

async function loadLayer(req, layerId, {force = false, perTier} = {}) {
 const key = `${layerId}:${perTier || 'default'}`;
 const hit = cache.get(key);
 if (!force && hit && Date.now() - hit.at < TTL) return hit.projection;
 const {read, build} = BUILDERS[layerId];
 let projection;
 try {
  const rows = await read(req);
  const extra = layerId === 'integrity'
   ? {projection: {generatedAt: new Date().toISOString(), fingerprint: '', sourceVersion: ''}}
   : {};
  projection = build({...rows, ...extra}, {perTier});
 } catch (error) {
  console.warn('[atlas:projection]', layerId, String(error?.message || error));
  return failedLayer(layerId, error);
 }
 cache.set(key, {at: Date.now(), projection});
 return projection;
}

/** PT-BR cockpit copy is merged onto nodes that have it. The index is optional:
 *  when it cannot be read the graph still renders with its canonical labels. */
function decorate(projection, index) {
 if (!index || !projection?.nodes?.length) return projection;
 return {
  ...projection,
  nodes: projection.nodes.map(n => {
   const meta = cockpitMeta(index, n.canonicalId || n.id);
   if (!Object.keys(meta).length) return n;
   return {
    ...n,
    displayLabel: meta.short_label_pt || n.label,
    acronym: meta.acronym || '',
    metadata: {...(n.metadata || {}), ...meta}
   };
  })
 };
}

/* ----------------------------------------------------------------- handler */

export default async function handler(req, res) {
 if (req.method !== 'GET') return sendJson(res, {error: 'METHOD_NOT_ALLOWED'}, 405);
 const query = queryOf(req);

 if (query.describe === '1') {
  return sendJson(res, {
   contract: PROJECTION_CONTRACT,
   layers: LAYER_IDS.map(id => ({...LAYERS[id], tiers: [...LAYERS[id].tiers]})),
   states: Object.values(PROJECTION_STATE)
  });
 }

 const {layers, unknown} = parseLayers(query.layers || query.layer, 'science');
 const force = query.refresh === '1';
 const perTier = query.perTier ? Math.max(20, Math.min(2000, Number(query.perTier) || 400)) : undefined;

 const [built, index] = await Promise.all([
  Promise.all(layers.map(id => loadLayer(req, id, {force, perTier}))),
  loadCockpitIndex(req, force).then(x => x.cockpitIndex).catch(() => null)
 ]);

 const decorated = built.map(p => decorate(p, index));
 const composed = composeProjections(decorated);

 // Every layer failed: say so, with the reason, instead of publishing an empty map.
 const failed = decorated.filter(p => p.state !== PROJECTION_STATE.OK && p.state !== PROJECTION_STATE.NO_DATA);
 if (failed.length === decorated.length && failed.length) {
  return sendJson(res, {
   ...composed,
   state: failed[0].state,
   errors: failed.map(p => ({layer: p.layer, ...p.error})),
   requested: layers, unknownLayers: unknown
  }, 200);
 }

 const focused = query.focus
  ? {...composed, ...traverse(composed, query.focus, {direction: query.direction, depth: query.depth})}
  : composed;

 return sendJson(res, {
  ...applyView(focused, query),
  requested: layers,
  unknownLayers: unknown,
  degraded: failed.map(p => ({layer: p.layer, state: p.state, ...p.error})),
  semanticIndex: index ? {available: true, size: index.size} : {available: false, size: null}
 });
}
