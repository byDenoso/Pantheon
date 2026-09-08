/** Graph Projections — SCIENCE, EXECUTION and INTEGRITY.
 *
 *  Three genuinely different readings of the Neon truth owners, each assembled
 *  from its own tables. This is not one array filtered three ways: a layer that
 *  has no rows says NO_DATA, a layer whose reader failed says SOURCE_UNAVAILABLE,
 *  and neither is ever silently replaced by the other layer's nodes.
 *
 *  Every node declares where it came from:
 *    SCIENCE_CANONICAL      a science_v1 row, read as written
 *    OPERATIONAL_CANONICAL  a nexo_ops / olympus row, read as written
 *    DERIVED_NOT_EVIDENCE   a grouping or resolution this file computed
 *
 *  A derived node also carries `derivation`, naming the exact rule that produced
 *  it, so the UI can label it as derived instead of presenting it as source.
 *  Unknown values stay null and set `unknown:true` — they are never zero-filled.
 *
 *  The builders here are pure: rows in, projection out. The API layer owns the
 *  fetching, so every rule below is unit-testable without a network. */

export const PROJECTION_CONTRACT = 'projection-v1';

export const AUTHORITY = Object.freeze({
 SCIENCE: 'SCIENCE_CANONICAL',
 OPERATIONAL: 'OPERATIONAL_CANONICAL',
 DERIVED: 'DERIVED_NOT_EVIDENCE'
});

/** Why a projection can be empty. The UI renders a different surface for each,
 *  because "there is nothing" and "we could not read" are not the same answer. */
export const PROJECTION_STATE = Object.freeze({
 OK: 'OK',
 NO_DATA: 'NO_DATA',                       // reader succeeded, the layer has no rows
 FILTER_EMPTY: 'FILTER_EMPTY',             // rows exist, this filter excludes all of them
 BACKEND_ERROR: 'BACKEND_ERROR',           // the projection builder itself failed
 SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE', // a truth owner could not be read
 SYNCING: 'SYNCING',                       // a refresh is in flight, nothing published yet
 GRAPH_BUILDING: 'GRAPH_BUILDING',         // rows read, projection not assembled yet
 PERMISSION_ERROR: 'PERMISSION_ERROR'      // the reader was refused
});

/** Semantic zoom bands. A node declares the earliest band it belongs to, so
 *  zooming in adds detail instead of reshuffling the whole map. */
export const ZOOM = Object.freeze({MACRO: 1, MESO: 2, MICRO: 3});

/** Tier order is depth order: index drives Z, opacity and edge bundling. */
export const LAYERS = Object.freeze({
 science: Object.freeze({
  id: 'science', label: 'Ciência', accent: 'science',
  question: 'O que sabemos, o que testamos e o que isso produziu.',
  tiers: Object.freeze(['DOMAIN','CAMPAIGN','HYPOTHESIS','CLAIM','TEST','EVIDENCE','DATASET','PAPER','RESULT'])
 }),
 execution: Object.freeze({
  id: 'execution', label: 'Execução', accent: 'execution',
  question: 'O que rodou, onde rodou, o que produziu e o que travou.',
  tiers: Object.freeze(['CAMPAIGN','TASK','TEST','RUN','AGENT','RUNTIME','ARTIFACT','DEPENDENCY','BLOCKER','WRITEBACK'])
 }),
 integrity: Object.freeze({
  id: 'integrity', label: 'Integridade', accent: 'integrity',
  question: 'De onde a verdade vem e se a projeção ainda corresponde a ela.',
  tiers: Object.freeze(['TRUTH_OWNER','SOURCE','SOURCE_VERSION','INGESTION','TRANSFORMATION','NEON_RECORD','ATLAS_PROJECTION','VALIDATION','READBACK','CONTRADICTION','LEARNING'])
 })
});

export const LAYER_IDS = Object.freeze(Object.keys(LAYERS));

const TIER_ZOOM = Object.freeze({
 DOMAIN: ZOOM.MACRO, CAMPAIGN: ZOOM.MACRO, TRUTH_OWNER: ZOOM.MACRO, ATLAS_PROJECTION: ZOOM.MACRO,
 HYPOTHESIS: ZOOM.MESO, CLAIM: ZOOM.MESO, TEST: ZOOM.MESO, TASK: ZOOM.MESO, RUN: ZOOM.MESO,
 SOURCE: ZOOM.MESO, INGESTION: ZOOM.MESO, VALIDATION: ZOOM.MESO, BLOCKER: ZOOM.MESO,
 AGENT: ZOOM.MESO, RUNTIME: ZOOM.MESO, NEON_RECORD: ZOOM.MESO, LEARNING: ZOOM.MESO,
 EVIDENCE: ZOOM.MICRO, DATASET: ZOOM.MICRO, PAPER: ZOOM.MICRO, RESULT: ZOOM.MICRO,
 ARTIFACT: ZOOM.MICRO, DEPENDENCY: ZOOM.MICRO, WRITEBACK: ZOOM.MICRO,
 SOURCE_VERSION: ZOOM.MICRO, TRANSFORMATION: ZOOM.MICRO, READBACK: ZOOM.MICRO, CONTRADICTION: ZOOM.MICRO
});

/* ------------------------------------------------------------------ helpers */

const str = v => (v == null ? '' : String(v));
const nonEmpty = v => str(v).trim();
const list = v => (Array.isArray(v) ? v : []);
const uniq = xs => [...new Set(xs)];

export function fnv(text) {
 let h = 2166136261;
 for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
 return (h >>> 0).toString(16);
}

/** Collapses the unbounded free-text status vocabulary in science_v1 into the
 *  signal buckets the UI draws. The raw value always travels beside it, because
 *  `COMPLETE_VALIDATED__PASS_...` carries meaning this bucket cannot. */
export function signalOf(status = '') {
 const s = String(status).toUpperCase();
 if (!s.trim()) return 'unknown';
 if (/NEGATIVE|KILLED|CONTRADICT|DISPROVED|REJECT|NO_GO|FALSIFIED/.test(s)) return 'negative';
 if (/SUPERSEDED|RETIRED|LEGACY|DUPLICATE/.test(s)) return 'legacy';
 if (/BLOCKED|BLOCKER|FAIL|ERROR|INVALID|NONCONVERG/.test(s)) return 'blocked';
 if (/PARTIAL|CONDITIONAL|CHECKPOINT|DEFERRED|CANARY|PROVISIONAL|PENDING|INCOMPLETE|STRESS/.test(s)) return 'partial';
 if (/PASS|COMPLETE|SUPPORTED|SURVIVES|VALIDATED|CONFIRMED|ACCEPTED|SYNCED|SUCCESS/.test(s)) return 'supported';
 if (/ACTIVE|RUNNING|READY|OPEN|OBSERVED|CANDIDATE|IN_PROGRESS|LIVE|SUBMITTED/.test(s)) return 'active';
 return 'unknown';
}

/** A node's place in its layer. tier drives Z; zoom drives when it appears. */
function place(layerId, tier) {
 const tiers = LAYERS[layerId].tiers;
 const index = tiers.indexOf(tier);
 const span = Math.max(1, tiers.length - 1);
 return {
  layer: layerId,
  tier,
  tierIndex: index < 0 ? 0 : index,
  // -1 (front) .. 1 (back): real depth, not a decorative offset
  z: index < 0 ? 0 : Number(((index / span) * 2 - 1).toFixed(4)),
  zoom: TIER_ZOOM[tier] || ZOOM.MESO
 };
}

/** Tiers whose rows have no status column at all. A dataset, a runtime or a
 *  naming method is not "missing its status" — it never had one. Counting those
 *  as unknown would turn a complete read into a false integrity warning, so they
 *  declare `statusDeclared:false` and are excluded from that count. */
const STATUSLESS_TIERS = new Set([
 'DATASET', 'EVIDENCE', 'RUNTIME', 'AGENT', 'ARTIFACT', 'DEPENDENCY',
 'NEON_RECORD', 'SOURCE_VERSION', 'TRANSFORMATION', 'ATLAS_PROJECTION'
]);

function node(layerId, tier, id, fields = {}) {
 const {derivation = null, authority = AUTHORITY.DERIVED, ...rest} = fields;
 return {
  id,
  ...place(layerId, tier),
  type: tier,
  authority,
  derivation: authority === AUTHORITY.DERIVED ? (derivation || 'GROUPING') : null,
  signal: signalOf(rest.status),
  statusDeclared: !STATUSLESS_TIERS.has(tier),
  ...rest
 };
}

function edge(layerId, source, target, type, {authority = AUTHORITY.DERIVED, derivation = null, ...rest} = {}) {
 return {
  id: `${source}|${type}|${target}`,
  layer: layerId, source, target, type, authority,
  derivation: authority === AUTHORITY.DERIVED ? (derivation || 'STRUCTURAL') : null,
  ...rest
 };
}

/** Caps a tier without lying about it: the declared total travels with the cut. */
function cap(rows, limit) {
 const total = rows.length;
 return {rows: limit > 0 && total > limit ? rows.slice(0, limit) : rows, total, truncated: limit > 0 && total > limit};
}

const latest = values => values.map(str).filter(Boolean).sort().at(-1) || '';

/** Turns a SCREAMING_SNAKE code into something a map label can hold.
 *  `BLOCKED_SOURCE_EMBARGOED_PENDING_DESI_DR2_RELEASE` → `Source embargoed pending`.
 *  The untouched code always travels in metadata: this is how the value is
 *  displayed, never a replacement for it. */
export function humanCode(value, words = 4) {
 const parts = nonEmpty(value).replace(/^BLOCKED?_/i, '').split(/[_\s]+/).filter(Boolean);
 if (!parts.length) return nonEmpty(value);
 const kept = parts.slice(0, words).join(' ').toLowerCase();
 return kept.charAt(0).toUpperCase() + kept.slice(1) + (parts.length > words ? '…' : '');
}

/* ----------------------------------------------------------------- SCIENCE */

/** Domain → Campaign → Hypothesis → Claim → Test → Evidence → Dataset → Paper → Result.
 *
 *  CLAIM is the one derived tier: science_v1 has no CLAIM entity type, so a claim
 *  is the resolution a HYPOTHESIS reached once its status stopped being open.
 *  Those nodes are marked DERIVED_NOT_EVIDENCE with derivation
 *  HYPOTHESIS_STATUS_RESOLUTION, and the hypothesis they came from stays on the
 *  map beside them. Every other tier is a table read as written. */
export function buildScience(rows = {}, options = {}) {
 const {
  domains = [], entities = [], entityDomains = [], relations = [], provenance = [],
  assets = [], publicationSubmissions = [], resultSubjects = [], entityDisplay = []
 } = rows;
 const perTier = Number(options.perTier) || 400;
 const nodes = [], edges = [], clusters = [], tierMeta = {};
 const L = 'science';

 const displayBy = new Map(entityDisplay.map(d => [d.entity_id, d]));
 const domainById = new Map(domains.map(d => [d.domain_id, d]));
 const domainCodeOf = id => nonEmpty(domainById.get(id)?.code) || nonEmpty(id);
 const primaryDomain = new Map();
 const domainMembers = new Map();
 for (const a of entityDomains) {
  const code = domainCodeOf(a.domain_id);
  if (!code) continue;
  if (a.role === 'PRIMARY' || !primaryDomain.has(a.entity_id)) primaryDomain.set(a.entity_id, code);
  if (!domainMembers.has(code)) domainMembers.set(code, new Set());
  domainMembers.get(code).add(a.entity_id);
 }

 const provByOwner = new Map();
 for (const p of provenance) {
  if (!provByOwner.has(p.owner_entity_id)) provByOwner.set(p.owner_entity_id, []);
  provByOwner.get(p.owner_entity_id).push(p);
 }
 const refsOf = id => (provByOwner.get(id) || []).slice(0, 8).map(p => ({
  source: nonEmpty(p.source_kind), sourceId: nonEmpty(p.source_id),
  sourceRef: nonEmpty(p.source_location) || nonEmpty(p.source_id),
  url: /^https:\/\//.test(str(p.source_location)) ? p.source_location : undefined,
  authority: nonEmpty(p.authority), observedAt: nonEmpty(p.observed_at)
 }));
 const labelOf = e => nonEmpty(displayBy.get(e.entity_id)?.display_label) || nonEmpty(e.title) || e.entity_id;

 const byType = new Map();
 for (const e of entities) {
  if (!byType.has(e.entity_type)) byType.set(e.entity_type, []);
  byType.get(e.entity_type).push(e);
 }
 const of = type => byType.get(type) || [];

 const emitTier = (tier, rows, make, {declared = null} = {}) => {
  const cut = cap(rows, perTier);
  tierMeta[tier] = {
   declared: declared == null ? cut.total : declared,
   drawn: cut.rows.length,
   truncated: cut.truncated || (declared != null && declared > cut.rows.length)
  };
  for (const row of cut.rows) {
   const built = make(row);
   if (built) nodes.push(built);
  }
  return cut.rows;
 };

 // DOMAIN — science_v1.domains, read as written.
 emitTier('DOMAIN', domains, d => {
  const code = nonEmpty(d.code) || d.domain_id;
  return node(L, 'DOMAIN', `domain:${code}`, {
   authority: AUTHORITY.SCIENCE, label: nonEmpty(d.name) || code, canonicalId: d.domain_id,
   status: nonEmpty(d.status), summary: nonEmpty(d.description), domain: code,
   members: domainMembers.get(code)?.size ?? 0,
   metadata: {kind: nonEmpty(d.kind), source: 'science_v1.domains'}
  });
 });

 const entityNode = (tier, e, extra = {}) => node(L, tier, e.entity_id, {
  authority: AUTHORITY.SCIENCE, canonicalId: e.entity_id, label: labelOf(e),
  canonicalTitle: nonEmpty(e.title), status: nonEmpty(e.status), summary: nonEmpty(e.summary),
  domain: primaryDomain.get(e.entity_id) || '', updatedAt: nonEmpty(e.updated_at),
  sourceRefs: refsOf(e.entity_id),
  metadata: {
   entity_type: e.entity_type, source_surface: nonEmpty(e.source_surface),
   source_row_key: nonEmpty(e.source_row_key), current_revision_id: nonEmpty(e.current_revision_id),
   source: 'science_v1.entities'
  },
  ...extra
 });

 emitTier('CAMPAIGN', of('CAMPAIGN'), e => entityNode('CAMPAIGN', e));
 const hypotheses = emitTier('HYPOTHESIS', of('HYPOTHESIS'), e => entityNode('HYPOTHESIS', e));

 // CLAIM — DECISION_HYPOTHESIS rows are canonical claims. Hypotheses whose status
 // has resolved are projected as claims too, marked as derived, never as source.
 const decisions = of('DECISION_HYPOTHESIS');
 const resolved = hypotheses.filter(e => ['supported', 'negative'].includes(signalOf(e.status)));
 const claimRows = [
  ...decisions.map(e => ({e, derived: false})),
  ...resolved.map(e => ({e, derived: true}))
 ];
 emitTier('CLAIM', claimRows, ({e, derived}) => {
  if (!derived) return entityNode('CLAIM', e);
  const claimId = `claim:${e.entity_id}`;
  edges.push(edge(L, e.entity_id, claimId, 'RESOLVES_TO', {derivation: 'HYPOTHESIS_STATUS_RESOLUTION'}));
  return node(L, 'CLAIM', claimId, {
   label: labelOf(e), status: nonEmpty(e.status), summary: nonEmpty(e.summary),
   domain: primaryDomain.get(e.entity_id) || '', updatedAt: nonEmpty(e.updated_at),
   derivation: 'HYPOTHESIS_STATUS_RESOLUTION', derivedFrom: [e.entity_id],
   sourceRefs: refsOf(e.entity_id),
   metadata: {
    basis: 'A hipótese alcançou um estado resolvido; a claim é essa leitura, não um registro próprio.',
    resolved_signal: signalOf(e.status), origin_entity: e.entity_id, source: 'science_v1.entities'
   }
  });
 }, {declared: claimRows.length});

 emitTier('TEST', of('TEST'), e => entityNode('TEST', e));
 emitTier('RESULT', of('RESULT'), e => entityNode('RESULT', e));

 // EVIDENCE — provenance rows whose authority declares them evidence-grade.
 const EVIDENCE_AUTHORITY = new Set(['CANONICAL_EVIDENCE_BYTES', 'CANONICAL_RESULT', 'SUPPLEMENTAL_ROBUSTNESS', 'DERIVED_SCIENTIFIC_RESULT']);
 const evidenceRows = provenance.filter(p => EVIDENCE_AUTHORITY.has(nonEmpty(p.authority)));
 emitTier('EVIDENCE', evidenceRows, p => {
  const id = `evidence:${p.provenance_id || `${p.owner_entity_id}:${p.hash || p.source_id}`}`;
  if (p.owner_entity_id) edges.push(edge(L, p.owner_entity_id, id, 'EVIDENCED_BY', {
   authority: AUTHORITY.SCIENCE, derivation: null
  }));
  return node(L, 'EVIDENCE', id, {
   authority: AUTHORITY.SCIENCE, label: nonEmpty(p.source_location) || nonEmpty(p.source_id) || id,
   status: nonEmpty(p.authority), updatedAt: nonEmpty(p.observed_at),
   summary: `${nonEmpty(p.source_kind)} · ${nonEmpty(p.authority)}`,
   sourceRefs: [{
    source: nonEmpty(p.source_kind), sourceId: nonEmpty(p.source_id),
    sourceRef: nonEmpty(p.source_location) || nonEmpty(p.source_id),
    url: /^https:\/\//.test(str(p.source_location)) ? p.source_location : undefined,
    authority: nonEmpty(p.authority), observedAt: nonEmpty(p.observed_at)
   }],
   metadata: {owner_entity_id: nonEmpty(p.owner_entity_id), hash: nonEmpty(p.hash), source: 'science_v1.provenance'}
  });
 });

 // DATASET — science_v1.assets. These rows carry no entity link in the database
 // (science_v1.entity_assets is empty), so they are projected as a declared
 // catalogue and marked unlinked rather than attached to a guessed owner.
 emitTier('DATASET', assets, a => node(L, 'DATASET', `asset:${a.asset_id}`, {
  authority: AUTHORITY.SCIENCE, canonicalId: a.asset_id,
  label: nonEmpty(a.display_name) || a.asset_id, status: nonEmpty(a.authority),
  updatedAt: nonEmpty(a.observed_at) || nonEmpty(a.imported_at),
  summary: nonEmpty(a.origin),
  unlinked: true,
  sourceRefs: a.drive_file_id
   ? [{source: 'GOOGLE_DRIVE', sourceId: a.drive_file_id, sourceRef: a.drive_file_id,
       url: `https://drive.google.com/open?id=${encodeURIComponent(a.drive_file_id)}`}]
   : (a.uri ? [{source: 'ASSET_URI', sourceRef: a.uri, url: /^https:\/\//.test(str(a.uri)) ? a.uri : undefined}] : []),
  metadata: {
   mime_type: nonEmpty(a.mime_type), sha256: nonEmpty(a.sha256),
   size_bytes: a.size_bytes == null ? null : Number(a.size_bytes),
   origin: nonEmpty(a.origin), revision: nonEmpty(a.revision), source: 'science_v1.assets',
   link_state: 'NO_ENTITY_LINK_DECLARED'
  }
 }));

 // PAPER — PUBLICATION entities plus the submission ledger they are tracked in.
 const submissionRows = publicationSubmissions.map(s => ({s}));
 emitTier('PAPER', [...of('PUBLICATION').map(e => ({e})), ...submissionRows], row => {
  if (row.e) return entityNode('PAPER', row.e);
  const s = row.s;
  return node(L, 'PAPER', `submission:${s.submission_id}`, {
   authority: AUTHORITY.SCIENCE, canonicalId: s.submission_id,
   label: nonEmpty(s.manuscript) || s.submission_id, status: nonEmpty(s.status) || nonEmpty(s.external_status),
   summary: [nonEmpty(s.journal), nonEmpty(s.scientific_scope)].filter(Boolean).join(' · '),
   updatedAt: nonEmpty(s.imported_at),
   metadata: {
    journal: nonEmpty(s.journal), external_id: nonEmpty(s.external_id),
    external_status: nonEmpty(s.external_status), canonical_test_id: nonEmpty(s.canonical_test_id),
    rating: nonEmpty(s.rating), source: 'science_v1.publication_submissions'
   }
  });
 });

 const drawn = new Set(nodes.map(n => n.id));

 // Declared relations, read as written. PART_OF_CAMPAIGN is stored child→parent.
 for (const r of relations) {
  const canonical = r.relation_type === 'PART_OF_CAMPAIGN'
   ? {source: r.to_entity_id, target: r.from_entity_id, type: 'CONTAINS'}
   : {source: r.from_entity_id, target: r.to_entity_id, type: r.relation_type};
  if (!drawn.has(canonical.source) || !drawn.has(canonical.target)) continue;
  edges.push(edge(L, canonical.source, canonical.target, canonical.type, {
   authority: AUTHORITY.SCIENCE, derivation: null,
   status: nonEmpty(r.status), evidenceClass: nonEmpty(r.evidence_class),
   sourceRefs: r.source_ref ? [{source: nonEmpty(r.source_surface), sourceRef: nonEmpty(r.source_ref)}] : []
  }));
 }

 // Result → subject, resolved in the database with its own classification basis.
 for (const s of resultSubjects) {
  if (!drawn.has(s.result_entity_id) || !drawn.has(s.resolved_entity_id)) continue;
  edges.push(edge(L, s.resolved_entity_id, s.result_entity_id, 'PRODUCES', {
   authority: AUTHORITY.SCIENCE, derivation: null,
   metadata: {classification_basis: nonEmpty(s.classification_basis), subject_type: nonEmpty(s.subject_type)}
  }));
 }

 // Domain membership, from the assignment table.
 for (const a of entityDomains) {
  const code = domainCodeOf(a.domain_id);
  const domainId = `domain:${code}`;
  if (!code || !drawn.has(domainId) || !drawn.has(a.entity_id)) continue;
  if (a.role && a.role !== 'PRIMARY') continue;
  edges.push(edge(L, domainId, a.entity_id, 'CONTAINS', {
   authority: AUTHORITY.SCIENCE, derivation: null,
   metadata: {mapping_basis: nonEmpty(a.mapping_basis), confidence: nonEmpty(a.confidence)}
  }));
 }

 for (const d of domains) {
  const code = nonEmpty(d.code) || d.domain_id;
  clusters.push({
   id: `domain:${code}`, layer: L, label: nonEmpty(d.name) || code, tier: 'DOMAIN',
   count: domainMembers.get(code)?.size ?? 0, basis: 'science_v1.entity_domains'
  });
 }

 const sourceVersion = latest([
  ...entities.map(e => e.updated_at),
  ...provenance.map(p => p.observed_at),
  ...assets.map(a => a.observed_at)
 ]);
 return finish(L, {nodes, edges, clusters, tierMeta, sourceVersion, options});
}

/* --------------------------------------------------------------- EXECUTION */

/** Campaign → Task → Test → Run → Agent → Runtime → Artifact → Dependency → Blocker → Writeback.
 *
 *  Everything here is nexo_ops read as written, except AGENT, RUNTIME, ARTIFACT
 *  and DEPENDENCY, which are groupings of values that already exist on the run
 *  and event rows. Those four are marked derived; the rows behind them are not. */
export function buildExecution(rows = {}, options = {}) {
 const {actions = [], runs = [], events = [], attention = [], currentState = []} = rows;
 const perTier = Number(options.perTier) || 400;
 const nodes = [], edges = [], clusters = [], tierMeta = {};
 const L = 'execution';
 const push = (tier, all, make) => {
  const cut = cap(all, perTier);
  tierMeta[tier] = {declared: cut.total, drawn: cut.rows.length, truncated: cut.truncated};
  for (const row of cut.rows) {const built = make(row); if (built) nodes.push(built)}
 };

 // CAMPAIGN here is the operational domain a task belongs to, not a science campaign.
 const domains = uniq(actions.map(a => nonEmpty(a.domain)).filter(Boolean));
 push('CAMPAIGN', domains, d => node(L, 'CAMPAIGN', `ops-domain:${d}`, {
  label: d, status: 'ACTIVE', derivation: 'DISTINCT_ACTION_DOMAIN',
  summary: `${actions.filter(a => a.domain === d).length} tarefas declaradas neste domínio operacional.`,
  metadata: {source: 'nexo_ops.actions.domain'}
 }));

 push('TASK', actions, a => node(L, 'TASK', `action:${a.id}`, {
  authority: AUTHORITY.OPERATIONAL, canonicalId: str(a.id), label: nonEmpty(a.title) || str(a.id),
  status: nonEmpty(a.status), summary: nonEmpty(a.blocker_reason),
  domain: nonEmpty(a.domain), updatedAt: nonEmpty(a.updated_at) || nonEmpty(a.created_at),
  metadata: {
   priority: a.priority == null ? null : Number(a.priority),
   blocker_reason: nonEmpty(a.blocker_reason), source_ref: nonEmpty(a.source_ref),
   source: 'nexo_ops.actions', ...(a.metadata || {})
  }
 }));

 push('RUN', runs, r => node(L, 'RUN', `run:${r.id}`, {
  authority: AUTHORITY.OPERATIONAL, canonicalId: str(r.id),
  label: `${nonEmpty(r.domain) || 'RUN'} · ${nonEmpty(r.status) || 'unknown'}`,
  status: nonEmpty(r.status), summary: nonEmpty(r.execution_log).slice(0, 400),
  domain: nonEmpty(r.domain), updatedAt: nonEmpty(r.created_at),
  metadata: {
   action_id: nonEmpty(r.action_id), runtime_env: nonEmpty(r.runtime_env),
   artifact_hash: nonEmpty(r.artifact_hash), readback_verified: !!r.readback_verified,
   source: 'nexo_ops.execution_runs', ...(r.metadata || {})
  }
 }));

 // AGENT — the component that recorded runtime events. Derived grouping.
 const components = uniq(events.map(e => nonEmpty(e.component)).filter(Boolean));
 push('AGENT', components, c => node(L, 'AGENT', `agent:${c}`, {
  label: c, status: 'ACTIVE', derivation: 'DISTINCT_EVENT_COMPONENT',
  summary: `${events.filter(e => e.component === c).length} eventos de runtime registrados por este componente.`,
  metadata: {source: 'nexo_ops.runtime_events.component'}
 }));

 // RUNTIME — the declared execution environment of each run. Derived grouping.
 const runtimes = uniq(runs.map(r => nonEmpty(r.runtime_env)).filter(Boolean));
 push('RUNTIME', runtimes, env => node(L, 'RUNTIME', `runtime:${fnv(env)}`, {
  label: env, status: 'ACTIVE', derivation: 'DISTINCT_RUNTIME_ENV',
  summary: `${runs.filter(r => r.runtime_env === env).length} execuções declararam este runtime.`,
  metadata: {runtime_env: env, source: 'nexo_ops.execution_runs.runtime_env'}
 }));

 // ARTIFACT — the hash a run published. Derived grouping of a recorded value.
 const artifacts = uniq(runs.map(r => nonEmpty(r.artifact_hash)).filter(Boolean));
 push('ARTIFACT', artifacts, hash => node(L, 'ARTIFACT', `artifact:${hash}`, {
  label: hash.slice(0, 24), status: 'RECORDED', derivation: 'DISTINCT_ARTIFACT_HASH',
  summary: `Hash publicado por ${runs.filter(r => r.artifact_hash === hash).length} execução(ões).`,
  metadata: {artifact_hash: hash, source: 'nexo_ops.execution_runs.artifact_hash'}
 }));

 // DEPENDENCY — the external systems a runtime string names. Derived reading of
 // a declared value; it is a parse of text the operator wrote, not an inventory.
 const deps = uniq(runs.flatMap(r => String(r.runtime_env || '')
  .split(/[+,;]| and /i).map(x => x.trim()).filter(x => x && x.length < 40)));
 push('DEPENDENCY', deps, d => node(L, 'DEPENDENCY', `dependency:${fnv(d)}`, {
  label: d, status: 'DECLARED', derivation: 'RUNTIME_ENV_TOKEN_SPLIT',
  summary: 'Sistema citado na declaração de runtime da execução.',
  metadata: {token: d, basis: 'Texto declarado pelo operador, não um inventário verificado.', source: 'nexo_ops.execution_runs.runtime_env'}
 }));

 // BLOCKER — real blocker rows, from tasks and from the attention queue.
 const blockers = [
  ...actions.filter(a => nonEmpty(a.blocker_reason)).map(a => ({kind: 'action', row: a})),
  ...attention.filter(a => nonEmpty(a.blocker_code)).map(a => ({kind: 'attention', row: a}))
 ];
 push('BLOCKER', blockers, ({kind, row}) => kind === 'action'
  // The blocker reason is a paragraph an operator wrote. It is the summary, not
  // the label: a map label built from it collapses into initials and stops being
  // readable, so the task's own title names the node and the reason is kept whole.
  ? node(L, 'BLOCKER', `blocker:action:${row.id}`, {
     authority: AUTHORITY.OPERATIONAL, label: nonEmpty(row.title) || `Bloqueio ${str(row.id).slice(0, 8)}`,
     status: nonEmpty(row.status), domain: nonEmpty(row.domain), updatedAt: nonEmpty(row.updated_at),
     summary: nonEmpty(row.blocker_reason),
     metadata: {action_id: str(row.id), blocker_reason: nonEmpty(row.blocker_reason), source: 'nexo_ops.actions.blocker_reason'}
    })
  : node(L, 'BLOCKER', `blocker:item:${row.item_id}`, {
     authority: AUTHORITY.OPERATIONAL, label: humanCode(row.blocker_code),
     status: nonEmpty(row.status), domain: nonEmpty(row.domain), updatedAt: nonEmpty(row.updated_at),
     summary: nonEmpty(row.title) || nonEmpty(row.blocker_code),
     metadata: {
      item_id: nonEmpty(row.item_id), blocker_code: nonEmpty(row.blocker_code),
      priority: nonEmpty(row.priority), action_id: nonEmpty(row.action_id), source: 'nexo_ops.attention_items'
     }
    }));

 // WRITEBACK — a run that verified its own readback. The write→readback→verify rule,
 // as recorded. Runs that did not verify are not counted as if they had.
 const verified = runs.filter(r => r.readback_verified);
 push('WRITEBACK', verified, r => node(L, 'WRITEBACK', `writeback:${r.id}`, {
  authority: AUTHORITY.OPERATIONAL, label: `Readback · ${nonEmpty(r.domain) || 'RUN'}`,
  status: 'VERIFIED', updatedAt: nonEmpty(r.created_at), domain: nonEmpty(r.domain),
  summary: nonEmpty(r.artifact_hash),
  metadata: {run_id: str(r.id), artifact_hash: nonEmpty(r.artifact_hash), source: 'nexo_ops.execution_runs.readback_verified'}
 }));

 // TEST — the science entities this layer's tasks and events actually name.
 const namedTests = uniq([
  ...actions.map(a => nonEmpty(a.source_ref)),
  ...events.map(e => nonEmpty(e.source_ref))
 ].filter(ref => /^T-[A-Z0-9]/.test(ref)));
 push('TEST', namedTests, id => node(L, 'TEST', id, {
  authority: AUTHORITY.SCIENCE, label: id, status: 'REFERENCED',
  summary: 'Teste científico citado por uma tarefa ou evento operacional.',
  metadata: {source: 'nexo_ops source_ref → science_v1.entities', cross_layer: 'science'}
 }));

 const drawn = new Set(nodes.map(n => n.id));
 const link = (source, target, type, extra) => {
  if (drawn.has(source) && drawn.has(target)) edges.push(edge(L, source, target, type, extra));
 };

 for (const a of actions) {
  link(`ops-domain:${nonEmpty(a.domain)}`, `action:${a.id}`, 'CONTAINS', {derivation: 'DISTINCT_ACTION_DOMAIN'});
  if (nonEmpty(a.blocker_reason)) link(`action:${a.id}`, `blocker:action:${a.id}`, 'BLOCKED_BY', {authority: AUTHORITY.OPERATIONAL});
  if (/^T-[A-Z0-9]/.test(nonEmpty(a.source_ref))) link(`action:${a.id}`, nonEmpty(a.source_ref), 'EXECUTES', {authority: AUTHORITY.OPERATIONAL});
 }
 for (const r of runs) {
  if (r.action_id) link(`action:${r.action_id}`, `run:${r.id}`, 'EXECUTED_AS', {authority: AUTHORITY.OPERATIONAL});
  if (nonEmpty(r.runtime_env)) link(`run:${r.id}`, `runtime:${fnv(nonEmpty(r.runtime_env))}`, 'RAN_ON', {authority: AUTHORITY.OPERATIONAL});
  if (nonEmpty(r.artifact_hash)) link(`run:${r.id}`, `artifact:${nonEmpty(r.artifact_hash)}`, 'PRODUCED', {authority: AUTHORITY.OPERATIONAL});
  if (r.readback_verified) link(`run:${r.id}`, `writeback:${r.id}`, 'VERIFIED_BY', {authority: AUTHORITY.OPERATIONAL});
  for (const token of String(r.runtime_env || '').split(/[+,;]| and /i).map(x => x.trim()).filter(Boolean))
   link(`runtime:${fnv(nonEmpty(r.runtime_env))}`, `dependency:${fnv(token)}`, 'REQUIRES', {derivation: 'RUNTIME_ENV_TOKEN_SPLIT'});
 }
 for (const e of events) {
  if (nonEmpty(e.component) && nonEmpty(e.action_id)) link(`agent:${nonEmpty(e.component)}`, `action:${e.action_id}`, 'OBSERVED', {authority: AUTHORITY.OPERATIONAL});
 }
 for (const s of currentState) {
  if (nonEmpty(s.action_id)) link(`action:${s.action_id}`, `ops-domain:${nonEmpty(s.domain)}`, 'REPORTS_TO', {derivation: 'CURRENT_STATE_DOMAIN'});
 }

 for (const d of domains) clusters.push({
  id: `ops-domain:${d}`, layer: L, label: d, tier: 'CAMPAIGN',
  count: actions.filter(a => a.domain === d).length, basis: 'nexo_ops.actions.domain'
 });

 const sourceVersion = latest([
  ...actions.map(a => a.updated_at), ...runs.map(r => r.created_at), ...events.map(e => e.occurred_at)
 ]);
 return finish(L, {nodes, edges, clusters, tierMeta, sourceVersion, options});
}

/* --------------------------------------------------------------- INTEGRITY */

/** Truth Owner → Source → Source Version → Ingestion → Transformation → Neon Record
 *  → Atlas Projection → Validation → Readback → Contradiction → Learning.
 *
 *  This layer answers one question: does the picture still match the thing it
 *  claims to describe. ATLAS_PROJECTION is the Atlas declaring itself — a
 *  projection, never a truth owner. */
export function buildIntegrity(rows = {}, options = {}) {
 const {
  truthStates = [], sources = [], revisions = [], syncState = [], importBatches = [],
  entityDisplay = [], migrationIssues = [], learningIssues = [], runs = [],
  patterns = [], recordCounts = {}, projection = {}
 } = rows;
 const perTier = Number(options.perTier) || 400;
 const nodes = [], edges = [], clusters = [], tierMeta = {};
 const L = 'integrity';
 const push = (tier, all, make) => {
  const cut = cap(all, perTier);
  tierMeta[tier] = {declared: cut.total, drawn: cut.rows.length, truncated: cut.truncated};
  for (const row of cut.rows) {const built = make(row); if (built) nodes.push(built)}
 };

 push('TRUTH_OWNER', truthStates, t => node(L, 'TRUTH_OWNER', `truth:${nonEmpty(t.domain)}`, {
  authority: AUTHORITY.OPERATIONAL, label: nonEmpty(t.domain), status: 'DECLARED',
  updatedAt: nonEmpty(t.updated_at), summary: nonEmpty(t.owner_resource),
  metadata: {
   owner_resource: nonEmpty(t.owner_resource), canonical_hash: nonEmpty(t.canonical_hash),
   source: 'nexo_ops.truth_states', ...(t.metadata || {})
  }
 }));

 push('SOURCE', sources, s => node(L, 'SOURCE', `source:${s.source_id}`, {
  authority: AUTHORITY.SCIENCE, canonicalId: s.source_id, label: nonEmpty(s.name) || s.source_id,
  status: nonEmpty(s.trust_state), summary: nonEmpty(s.role), updatedAt: nonEmpty(s.imported_at),
  sourceRefs: s.url ? [{source: nonEmpty(s.source_type), sourceRef: s.url, url: s.url}] : [],
  metadata: {
   source_type: nonEmpty(s.source_type), trust_state: nonEmpty(s.trust_state),
   verified_raw: nonEmpty(s.verified_raw), source_surface: nonEmpty(s.source_surface),
   source: 'science_v1.sources'
  }
 }));

 // SOURCE VERSION — revisions grouped by surface. The full 5k rows are the fact;
 // the group is the reading, and it carries the count it was computed from.
 const bySurface = new Map();
 for (const r of revisions) {
  const key = nonEmpty(r.source_surface) || 'UNDECLARED';
  if (!bySurface.has(key)) bySurface.set(key, {surface: key, count: 0, current: 0, observedAt: ''});
  const g = bySurface.get(key);
  g.count += 1;
  if (r.is_current) g.current += 1;
  if (str(r.observed_at) > g.observedAt) g.observedAt = str(r.observed_at);
 }
 push('SOURCE_VERSION', [...bySurface.values()], g => node(L, 'SOURCE_VERSION', `revision-surface:${fnv(g.surface)}`, {
  label: g.surface, status: g.current ? 'CURRENT' : 'HISTORICAL', updatedAt: g.observedAt,
  derivation: 'REVISIONS_GROUPED_BY_SOURCE_SURFACE',
  summary: `${g.count} revisões, ${g.current} marcadas como atuais.`,
  metadata: {revisions: g.count, current: g.current, surface: g.surface, source: 'science_v1.revisions'}
 }));

 const ingestion = [
  ...syncState.map(s => ({kind: 'sync', row: s})),
  ...importBatches.map(b => ({kind: 'batch', row: b}))
 ];
 push('INGESTION', ingestion, ({kind, row}) => kind === 'sync'
  ? node(L, 'INGESTION', `sync:${nonEmpty(row.source_key)}`, {
     authority: AUTHORITY.OPERATIONAL, label: nonEmpty(row.source_key),
     status: nonEmpty(row.sync_status), updatedAt: nonEmpty(row.last_synced_at),
     summary: nonEmpty(row.error_text) || nonEmpty(row.source_ref),
     error: nonEmpty(row.error_text) || null,
     metadata: {
      source_kind: nonEmpty(row.source_kind), source_id: nonEmpty(row.source_id),
      source_ref: nonEmpty(row.source_ref), source_revision: nonEmpty(row.source_revision),
      fingerprint: nonEmpty(row.fingerprint), observed_at: nonEmpty(row.observed_at),
      source: 'nexo_ops.sync_state'
     }
    })
  : node(L, 'INGESTION', `batch:${nonEmpty(row.batch_id)}`, {
     authority: AUTHORITY.SCIENCE, label: nonEmpty(row.batch_id), status: nonEmpty(row.status),
     updatedAt: nonEmpty(row.created_at), summary: nonEmpty(row.source_file_id) || nonEmpty(row.source_scope),
     metadata: {payload_hash: nonEmpty(row.payload_hash), source_observed_at: nonEmpty(row.source_observed_at), source: 'science_v1.import_batches'}
    }));

 // TRANSFORMATION — the naming methods that produced display labels, grouped
 // with the version that produced them and how many rows each one covers.
 const byMethod = new Map();
 for (const d of entityDisplay) {
  const key = `${nonEmpty(d.naming_method) || 'UNDECLARED'}@${nonEmpty(d.naming_version) || '—'}`;
  if (!byMethod.has(key)) byMethod.set(key, {key, method: nonEmpty(d.naming_method), version: nonEmpty(d.naming_version), count: 0, curated: 0, generatedAt: ''});
  const g = byMethod.get(key);
  g.count += 1;
  if (d.is_curated) g.curated += 1;
  if (str(d.generated_at) > g.generatedAt) g.generatedAt = str(d.generated_at);
 }
 push('TRANSFORMATION', [...byMethod.values()], g => node(L, 'TRANSFORMATION', `naming:${fnv(g.key)}`, {
  label: g.method || 'Sem método declarado', status: g.version ? 'VERSIONED' : 'UNVERSIONED',
  updatedAt: g.generatedAt, derivation: 'ENTITY_DISPLAY_GROUPED_BY_NAMING_METHOD',
  summary: `${g.count} rótulos gerados, ${g.curated} curados manualmente.`,
  metadata: {naming_method: g.method, naming_version: g.version, labels: g.count, curated: g.curated, source: 'science_v1.entity_display'}
 }));

 push('NEON_RECORD', Object.entries(recordCounts), ([table, count]) => node(L, 'NEON_RECORD', `record:${table}`, {
  authority: AUTHORITY.OPERATIONAL, label: table, status: count > 0 ? 'POPULATED' : 'EMPTY',
  summary: count > 0 ? `${count} registros lidos.` : 'Tabela declarada e vazia.',
  metadata: {table, count: Number(count) || 0, source: 'Neon Data API'}
 }));

 // The Atlas declaring itself: a projection of the owners above, never an owner.
 nodes.push(node(L, 'ATLAS_PROJECTION', 'atlas:projection', {
  label: 'Projeção Atlas', status: 'PROJECTION', derivation: 'SELF_DECLARED_PROJECTION',
  updatedAt: nonEmpty(projection.generatedAt),
  summary: 'O Atlas é projeção. A verdade permanece nos truth owners acima.',
  metadata: {
   fingerprint: nonEmpty(projection.fingerprint), contract: PROJECTION_CONTRACT,
   source_version: nonEmpty(projection.sourceVersion), basis: 'Esta resposta.'
  }
 }));
 tierMeta.ATLAS_PROJECTION = {declared: 1, drawn: 1, truncated: false};

 const allIssues = [
  ...migrationIssues.map(i => ({...i, schema: 'science_v1'})),
  ...learningIssues.map(i => ({...i, schema: 'learning_v1'}))
 ];
 const isOpen = i => !/RESOLVED|CLOSED|ACCEPTED/i.test(nonEmpty(i.status));
 push('VALIDATION', allIssues, i => node(L, 'VALIDATION', `issue:${i.schema}:${i.issue_id}`, {
  authority: AUTHORITY.SCIENCE, label: nonEmpty(i.issue_type),
  status: nonEmpty(i.status), updatedAt: nonEmpty(i.resolved_at) || nonEmpty(i.created_at),
  summary: nonEmpty(i.detail) || nonEmpty(i.source_key),
  open: isOpen(i), severity: nonEmpty(i.severity),
  metadata: {
   schema: i.schema, issue_type: nonEmpty(i.issue_type), severity: nonEmpty(i.severity),
   source_surface: nonEmpty(i.source_surface), entity_id: nonEmpty(i.entity_id),
   proposed_resolution: nonEmpty(i.proposed_resolution), source: `${i.schema}.migration_issues`
  }
 }));

 push('READBACK', runs.filter(r => r.readback_verified != null), r => node(L, 'READBACK', `readback:${r.id}`, {
  authority: AUTHORITY.OPERATIONAL,
  label: `${nonEmpty(r.domain) || 'RUN'} · ${r.readback_verified ? 'verificado' : 'não verificado'}`,
  status: r.readback_verified ? 'VERIFIED' : 'UNVERIFIED', updatedAt: nonEmpty(r.created_at),
  summary: nonEmpty(r.artifact_hash),
  metadata: {run_id: str(r.id), readback_verified: !!r.readback_verified, source: 'nexo_ops.execution_runs'}
 }));

 // CONTRADICTION — open validation issues, plus patterns that record more
 // contradicting than supporting observations. Both are recorded counts.
 const contradictions = [
  ...allIssues.filter(isOpen).map(i => ({kind: 'issue', row: i})),
  ...patterns.filter(p => Number(p.contradicting_count) > 0).map(p => ({kind: 'pattern', row: p}))
 ];
 push('CONTRADICTION', contradictions, ({kind, row}) => kind === 'issue'
  ? node(L, 'CONTRADICTION', `contradiction:${row.schema}:${row.issue_id}`, {
     authority: AUTHORITY.SCIENCE, label: nonEmpty(row.issue_type), status: nonEmpty(row.status),
     summary: nonEmpty(row.detail), updatedAt: nonEmpty(row.created_at),
     metadata: {schema: row.schema, severity: nonEmpty(row.severity), source: `${row.schema}.migration_issues`}
    })
  : node(L, 'CONTRADICTION', `contradiction:pattern:${row.pattern_id}`, {
     authority: AUTHORITY.OPERATIONAL, label: nonEmpty(row.title) || row.pattern_id,
     status: nonEmpty(row.status), updatedAt: nonEmpty(row.updated_at),
     summary: `${row.supporting_count ?? 0} a favor · ${row.contradicting_count ?? 0} contra.`,
     metadata: {
      supporting: Number(row.supporting_count) || 0, contradicting: Number(row.contradicting_count) || 0,
      confidence: row.confidence_score == null ? null : Number(row.confidence_score),
      source: 'learning_v1.patterns'
     }
    }));

 push('LEARNING', patterns, p => node(L, 'LEARNING', `pattern:${p.pattern_id}`, {
  authority: AUTHORITY.OPERATIONAL, canonicalId: p.pattern_id, label: nonEmpty(p.title) || p.pattern_id,
  status: nonEmpty(p.status), updatedAt: nonEmpty(p.updated_at), summary: nonEmpty(p.description),
  metadata: {
   pattern_type: nonEmpty(p.pattern_type),
   supporting: Number(p.supporting_count) || 0, contradicting: Number(p.contradicting_count) || 0,
   confidence: p.confidence_score == null ? null : Number(p.confidence_score),
   source: 'learning_v1.patterns'
  }
 }));

 const drawn = new Set(nodes.map(n => n.id));
 const link = (source, target, type, extra) => {
  if (drawn.has(source) && drawn.has(target)) edges.push(edge(L, source, target, type, extra));
 };

 // The lineage spine: owner → source → version → ingestion → transformation →
 // record → projection → validation → readback → contradiction → learning.
 for (const s of sources) link('truth:SCIENCE', `source:${s.source_id}`, 'OWNS', {derivation: 'SOURCE_SURFACE_OWNERSHIP'});
 for (const g of bySurface.values()) {
  const surfaceNode = `revision-surface:${fnv(g.surface)}`;
  link('truth:SCIENCE', surfaceNode, 'VERSIONS', {derivation: 'REVISIONS_GROUPED_BY_SOURCE_SURFACE'});
 }
 for (const s of syncState) link(`sync:${nonEmpty(s.source_key)}`, 'record:science_v1.entities', 'INGESTS_INTO', {authority: AUTHORITY.OPERATIONAL});
 for (const b of importBatches) link(`batch:${nonEmpty(b.batch_id)}`, 'record:science_v1.entities', 'INGESTS_INTO', {authority: AUTHORITY.SCIENCE});
 for (const g of byMethod.values()) link('record:science_v1.entities', `naming:${fnv(g.key)}`, 'TRANSFORMED_BY', {derivation: 'ENTITY_DISPLAY_GROUPED_BY_NAMING_METHOD'});
 for (const table of Object.keys(recordCounts)) link(`record:${table}`, 'atlas:projection', 'PROJECTED_AS', {derivation: 'SELF_DECLARED_PROJECTION'});
 for (const i of allIssues) link('atlas:projection', `issue:${i.schema}:${i.issue_id}`, 'VALIDATED_BY', {authority: AUTHORITY.SCIENCE});
 for (const r of runs) if (r.readback_verified != null) link('atlas:projection', `readback:${r.id}`, 'READ_BACK_BY', {authority: AUTHORITY.OPERATIONAL});
 for (const i of allIssues.filter(isOpen)) link(`issue:${i.schema}:${i.issue_id}`, `contradiction:${i.schema}:${i.issue_id}`, 'RAISES', {authority: AUTHORITY.SCIENCE});
 for (const p of patterns) {
  if (Number(p.contradicting_count) > 0) link(`contradiction:pattern:${p.pattern_id}`, `pattern:${p.pattern_id}`, 'FEEDS', {authority: AUTHORITY.OPERATIONAL});
  link('truth:LEARNING', `pattern:${p.pattern_id}`, 'OWNS', {authority: AUTHORITY.OPERATIONAL});
 }
 for (const t of truthStates) clusters.push({
  id: `truth:${nonEmpty(t.domain)}`, layer: L, label: nonEmpty(t.domain), tier: 'TRUTH_OWNER',
  count: 0, basis: 'nexo_ops.truth_states'
 });

 const sourceVersion = latest([
  ...truthStates.map(t => t.updated_at), ...syncState.map(s => s.last_synced_at),
  ...sources.map(s => s.imported_at)
 ]);
 return finish(L, {nodes, edges, clusters, tierMeta, sourceVersion, options});
}

/* ------------------------------------------------------------------ finish */

function finish(layerId, {nodes, edges, clusters, tierMeta, sourceVersion, options = {}}) {
 const ids = new Set(nodes.map(n => n.id));
 // A renderer must never receive an edge it cannot place.
 const placeable = edges.filter(e => ids.has(e.source) && ids.has(e.target));
 const seen = new Set();
 const deduped = placeable.filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true)));

 const counts = {};
 for (const n of nodes) counts[n.tier] = (counts[n.tier] || 0) + 1;
 const signals = {};
 for (const n of nodes) signals[n.signal] = (signals[n.signal] || 0) + 1;
 const derived = nodes.filter(n => n.authority === AUTHORITY.DERIVED).length;
 const linked = new Set(deduped.flatMap(e => [e.source, e.target]));
 const orphans = nodes.filter(n => !linked.has(n.id)).length;
 const declared = Object.values(tierMeta).reduce((a, t) => a + (t.declared || 0), 0);
 const truncated = Object.values(tierMeta).some(t => t.truncated);

 return {
  contract: PROJECTION_CONTRACT,
  layer: layerId,
  label: LAYERS[layerId].label,
  question: LAYERS[layerId].question,
  tiers: [...LAYERS[layerId].tiers],
  nodes, edges: deduped, clusters,
  state: nodes.length ? PROJECTION_STATE.OK : PROJECTION_STATE.NO_DATA,
  metadata: {
   counts, signals, tiers: tierMeta,
   declaredNodes: declared, drawnNodes: nodes.length, edgeCount: deduped.length,
   truncated, perTier: Number(options.perTier) || 400
  },
  generatedAt: options.now || new Date().toISOString(),
  sourceState: {
   sourceVersion,
   freshness: sourceVersion ? 'LIVE' : 'UNKNOWN',
   readAt: options.now || new Date().toISOString()
  },
  integrity: {
   // What share of this picture the Atlas computed rather than read.
   canonicalNodes: nodes.length - derived,
   derivedNodes: derived,
   derivedRatio: nodes.length ? Number((derived / nodes.length).toFixed(3)) : 0,
   unlinkedNodes: orphans,
   // Only rows that were supposed to carry a status and did not. A tier that
   // has no status column is not a gap in the read.
   unknownSignal: nodes.filter(n => n.statusDeclared && n.signal === 'unknown').length,
   statuslessNodes: nodes.filter(n => !n.statusDeclared).length,
   truncated,
   derivations: uniq(nodes.filter(n => n.derivation).map(n => n.derivation)).sort()
  },
  fingerprint: fnv(JSON.stringify([
   layerId, sourceVersion,
   nodes.map(n => [n.id, n.status, n.updatedAt]),
   deduped.map(e => e.id)
  ]))
 };
}

/* ---------------------------------------------------------------- composing */

/** One, two or three layers in a single scene. Layers keep their own Z band, so
 *  composition reads as depth rather than as one flattened pile, and a node that
 *  appears in more than one layer is reported instead of being silently merged. */
export function composeProjections(projections = []) {
 const live = projections.filter(Boolean);
 if (!live.length) {
  return {
   contract: PROJECTION_CONTRACT, layers: [], nodes: [], edges: [], clusters: [],
   state: PROJECTION_STATE.NO_DATA, metadata: {counts: {}, layerStates: {}},
   generatedAt: new Date().toISOString(), sourceState: {}, integrity: {}, bridges: []
  };
 }
 if (live.length === 1) return {...live[0], layers: [live[0].layer], bridges: []};

 const span = live.length;
 const nodes = [], edges = [], clusters = [];
 const byId = new Map();
 const bridges = [];

 live.forEach((p, band) => {
  // Each layer occupies its own slice of Z, so depth separates layers first and
  // tiers second. With one layer the band is the whole space.
  const lo = (band / span) * 2 - 1, hi = ((band + 1) / span) * 2 - 1;
  for (const n of p.nodes) {
   const zBand = lo + ((n.z + 1) / 2) * (hi - lo);
   const placed = {...n, z: Number(zBand.toFixed(4)), band, bandOf: p.layer};
   if (byId.has(n.id)) {
    const first = byId.get(n.id);
    first.alsoInLayers = uniq([...(first.alsoInLayers || []), p.layer]);
    bridges.push({id: n.id, layers: [first.layer, p.layer], label: n.label || n.id});
    continue;
   }
   byId.set(n.id, placed);
   nodes.push(placed);
  }
  for (const e of p.edges) edges.push({...e, band});
  for (const c of p.clusters) clusters.push({...c, band});
 });

 const ids = new Set(nodes.map(n => n.id));
 const placeable = edges.filter(e => ids.has(e.source) && ids.has(e.target));
 const counts = {};
 for (const n of nodes) counts[n.tier] = (counts[n.tier] || 0) + 1;
 const layerStates = Object.fromEntries(live.map(p => [p.layer, p.state]));
 const derived = nodes.filter(n => n.authority === AUTHORITY.DERIVED).length;

 return {
  contract: PROJECTION_CONTRACT,
  layers: live.map(p => p.layer),
  label: live.map(p => p.label).join(' + '),
  tiers: uniq(live.flatMap(p => p.tiers)),
  nodes, edges: placeable, clusters,
  // A composition is only as empty as all of its layers.
  state: nodes.length ? PROJECTION_STATE.OK : PROJECTION_STATE.NO_DATA,
  bridges,
  metadata: {
   counts, layerStates,
   drawnNodes: nodes.length, edgeCount: placeable.length,
   bridgeCount: bridges.length,
   truncated: live.some(p => p.metadata?.truncated),
   perLayer: Object.fromEntries(live.map(p => [p.layer, p.metadata]))
  },
  generatedAt: new Date().toISOString(),
  sourceState: {
   sourceVersion: latest(live.map(p => p.sourceState?.sourceVersion)),
   freshness: live.every(p => p.sourceState?.freshness === 'LIVE') ? 'LIVE' : 'MIXED',
   perLayer: Object.fromEntries(live.map(p => [p.layer, p.sourceState]))
  },
  integrity: {
   canonicalNodes: nodes.length - derived,
   derivedNodes: derived,
   derivedRatio: nodes.length ? Number((derived / nodes.length).toFixed(3)) : 0,
   crossLayerNodes: bridges.length,
   truncated: live.some(p => p.integrity?.truncated),
   perLayer: Object.fromEntries(live.map(p => [p.layer, p.integrity]))
  },
  fingerprint: fnv(live.map(p => `${p.layer}:${p.fingerprint}`).join('|'))
 };
}

/** Applies the request's semantic zoom and filters to an assembled projection.
 *  An empty result reports FILTER_EMPTY, never NO_DATA: the difference between
 *  "there is nothing" and "you filtered it all out" is the whole point. */
export function applyView(projection, query = {}) {
 if (!projection) return projection;
 const zoom = Math.max(ZOOM.MACRO, Math.min(ZOOM.MICRO, Number(query.zoom) || ZOOM.MICRO));
 const tier = nonEmpty(query.tier);
 const signal = nonEmpty(query.signal);
 const authority = nonEmpty(query.authority);
 const domain = nonEmpty(query.domain);
 const terms = nonEmpty(query.q).toLowerCase().split(/\s+/).filter(Boolean);
 const active = tier || signal || authority || domain || terms.length || zoom < ZOOM.MICRO;
 if (!active) return projection;

 const keep = n => {
  if (n.zoom > zoom) return false;
  if (tier && n.tier !== tier) return false;
  if (signal && n.signal !== signal) return false;
  if (authority && n.authority !== authority) return false;
  if (domain && n.domain !== domain) return false;
  if (!terms.length) return true;
  const haystack = `${n.id} ${n.label || ''} ${n.summary || ''} ${n.status || ''} ${n.domain || ''}`.toLowerCase();
  return terms.every(t => haystack.includes(t));
 };

 const nodes = projection.nodes.filter(keep);
 const ids = new Set(nodes.map(n => n.id));
 const edges = projection.edges.filter(e => ids.has(e.source) && ids.has(e.target));
 const counts = {};
 for (const n of nodes) counts[n.tier] = (counts[n.tier] || 0) + 1;

 // Integrity is recomputed over what is actually on screen. Reporting the whole
 // layer's figures next to a filtered node count would describe two different
 // populations as if they were one.
 const linked = new Set(edges.flatMap(e => [e.source, e.target]));
 const derived = nodes.filter(n => n.authority === 'DERIVED_NOT_EVIDENCE').length;
 const integrity = {
  ...projection.integrity,
  canonicalNodes: nodes.length - derived,
  derivedNodes: derived,
  derivedRatio: nodes.length ? Number((derived / nodes.length).toFixed(3)) : 0,
  unlinkedNodes: nodes.filter(n => !linked.has(n.id)).length,
  unknownSignal: nodes.filter(n => n.statusDeclared && n.signal === 'unknown').length,
  statuslessNodes: nodes.filter(n => n.statusDeclared === false).length,
  derivations: uniq(nodes.filter(n => n.derivation).map(n => n.derivation)).sort(),
  // The full-layer figures stay available, explicitly labelled as such.
  ofLayer: projection.integrity
 };

 return {
  ...projection,
  nodes, edges, integrity,
  state: nodes.length
   ? PROJECTION_STATE.OK
   : (projection.nodes.length ? PROJECTION_STATE.FILTER_EMPTY : PROJECTION_STATE.NO_DATA),
  view: {zoom, tier, signal, authority, domain, q: nonEmpty(query.q)},
  metadata: {
   ...projection.metadata,
   counts,
   drawnNodes: nodes.length,
   edgeCount: edges.length,
   hiddenByView: projection.nodes.length - nodes.length
  }
 };
}

/** Neighbourhood, ancestry, descent and full lineage inside an assembled
 *  projection. Used by entity focus and by cross-layer traversal. */
export function traverse(projection, id, {direction = 'neighbors', depth = 2} = {}) {
 if (!projection || !id) return {focus: id, nodes: [], edges: [], state: PROJECTION_STATE.NO_DATA};
 const out = new Map(), incoming = new Map();
 for (const e of projection.edges) {
  if (!out.has(e.source)) out.set(e.source, []);
  out.get(e.source).push(e.target);
  if (!incoming.has(e.target)) incoming.set(e.target, []);
  incoming.get(e.target).push(e.source);
 }
 const step = node => direction === 'ancestors' ? (incoming.get(node) || [])
  : direction === 'descendants' ? (out.get(node) || [])
  : [...(out.get(node) || []), ...(incoming.get(node) || [])];

 const maxDepth = direction === 'lineage' ? 8 : Math.max(1, Math.min(6, Number(depth) || 2));
 const seen = new Set([id]);
 let frontier = [id];
 for (let level = 0; level < maxDepth && frontier.length; level++) {
  const next = [];
  for (const current of frontier) for (const neighbour of step(current)) {
   if (seen.has(neighbour)) continue;
   seen.add(neighbour);
   next.push(neighbour);
  }
  frontier = next;
 }
 const nodes = projection.nodes.filter(n => seen.has(n.id));
 const edges = projection.edges.filter(e => seen.has(e.source) && seen.has(e.target));
 return {
  focus: id, direction, depth: maxDepth, nodes, edges,
  state: nodes.length ? PROJECTION_STATE.OK : PROJECTION_STATE.NO_DATA,
  layers: uniq(nodes.map(n => n.layer))
 };
}

/** Parses `layer=` / `layers=` into a validated, de-duplicated, ordered list.
 *  An unknown name is reported rather than quietly dropped. */
export function parseLayers(value, fallback = 'science') {
 const raw = String(value ?? '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
 const requested = raw.length ? raw : [fallback];
 const valid = [], unknown = [];
 for (const name of requested) {
  if (!LAYER_IDS.includes(name)) {unknown.push(name); continue}
  if (!valid.includes(name)) valid.push(name);
 }
 return {layers: valid.length ? valid : [fallback], unknown};
}
