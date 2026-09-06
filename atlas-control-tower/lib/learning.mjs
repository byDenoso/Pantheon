/** Learning projection helpers.
 *  Every bucket below is computed from fields the source actually publishes
 *  (stage, subtype, status, relation_type, support/contradiction counters, use
 *  counters, confidence, evidence_refs). No score is synthesised and no relation
 *  between a learning record and a scientific entity is created here: only
 *  explicit `evidence_refs` that resolve to an existing node are linked.
 *  A learning_v1 payload is accepted as-is through `normalizeLearning`. */

export const LEARNING_STAGES = Object.freeze([
 {id:'OBSERVATION', label:'Observação', source:'RELATION_LEDGER · status OBSERVED'},
 {id:'PATTERN',     label:'Padrão',     source:'RELATION_LEDGER · relação asserida'},
 {id:'LESSON',      label:'Lição',      source:'PROCEDURAL_MEMORY'},
 {id:'STRATEGY',    label:'Estratégia', source:'STRATEGY_REGISTRY'},
 {id:'POLICY',      label:'Política',   source:'ADAPTIVE_POLICY'}
]);

const num = v => {const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0};
const upper = v => String(v ?? '').toUpperCase();
const first = (...v) => v.find(x => x !== undefined && x !== null && x !== '');

/** Explicit stage when the source declares one; otherwise inferred from the record's own status. */
export function stageOf(node) {
 const declared = upper(node.stage || node.subtype);
 if (LEARNING_STAGES.some(s => s.id === declared)) return declared;
 if (node.type !== 'LEARNING_RELATION') return null;
 return upper(node.status) === 'OBSERVED' ? 'OBSERVATION' : 'PATTERN';
}

export function relationView(node) {
 const m = node.metadata || {};
 const confidence = Number(first(node.confidence, m.confidence));
 return {
  id: node.id,
  stage: stageOf(node),
  subtype: node.subtype || m.subtype || '',
  relationType: node.label || m.relation_type || '',
  status: node.status || '',
  // The untouched source string, kept beside the normalised status.
  sourceStatusRaw: first(node.sourceStatusRaw, m.source_status_raw, node.status, '') || '',
  scope: m.relation_scope || node.scope || '',
  domainA: m.domain_a || '', domainB: m.domain_b || '',
  nodeA: m.node_a || '', nodeB: m.node_b || '',
  crossDomain: !!(m.domain_a && m.domain_b && m.domain_a !== m.domain_b),
  evidenceCount: num(first(node.evidenceCount, m.evidence_count, m.support_count)),
  contradictionCount: num(first(node.contradictionCount, m.contradiction_count)),
  support: num(m.support_count), contradiction: num(m.contradiction_count),
  successes: num(m.successful_uses), failures: num(m.failed_uses),
  utility: m.utility || '',
  confidence: Number.isFinite(confidence) ? confidence : null,
  firstSeen: m.first_seen || '', lastSeen: m.last_seen || node.updatedAt || '',
  notes: node.summary || m.notes || '',
  evidenceRefs: String(m.evidence_refs || node.evidenceRefs || ''),
  derivedFrom: [].concat(node.derivedFrom || m.derived_from || []).filter(Boolean)
 };
}

export const EMERGENT_BUCKETS = Object.freeze([
 {id:'new',           label:'Novos padrões',  basis:'status OBSERVED ou HYPOTHESIS'},
 {id:'strengthening', label:'Fortalecendo',   basis:'evidência > contradição'},
 {id:'weakening',     label:'Enfraquecendo',  basis:'contradição registrada ou usos falhos acima dos bem-sucedidos'},
 {id:'promoted',      label:'Promovidos',     basis:'status VALIDATED'},
 {id:'contradicted',  label:'Contraditos',    basis:'relation_type CONTRADICTION ou contradição >= evidência'},
 {id:'unresolved',    label:'Não resolvidos', basis:'sem status na fonte'}
]);

/** A record may appear in more than one bucket; buckets are observations, not a ranking. */
export function emergentLearning(relations = []) {
 const views = relations.map(relationView);
 const test = {
  new: r => ['OBSERVED', 'HYPOTHESIS'].includes(upper(r.status)),
  strengthening: r => r.evidenceCount > r.contradictionCount && r.evidenceCount > 0,
  weakening: r => r.contradictionCount > 0 || r.failures > r.successes,
  promoted: r => upper(r.status) === 'VALIDATED',
  contradicted: r => upper(r.relationType) === 'CONTRADICTION' || (r.contradictionCount > 0 && r.contradictionCount >= r.evidenceCount),
  unresolved: r => !String(r.status).trim()
 };
 return EMERGENT_BUCKETS.map(b => {
  const items = views.filter(test[b.id]);
  return {...b, count: items.length, items};
 });
}

const isLearningNode = n => n.type === 'LEARNING_RELATION' || LEARNING_STAGES.some(s => s.id === upper(n.stage || n.subtype));

export function learningLadder(nodes = []) {
 const learning = (nodes || []).filter(isLearningNode);
 return LEARNING_STAGES.map(stage => {
  const items = learning.filter(n => stageOf(n) === stage.id);
  return {
   ...stage,
   count: items.length,
   available: items.length > 0,
   items: items.slice(0, 24).map(n => (n.type === 'LEARNING_RELATION' ? relationView(n) : {id:n.id, relationType:n.label, status:n.status || '', stage:stageOf(n)}))
  };
 });
}

const TOKEN = /(?:T-[A-Za-z0-9_+≈.\-]+|DH-[A-Za-z0-9_.\-]+|H-[A-Za-z0-9_.\-]+)/g;

/** Learning records that explicitly cite this entity in `evidence_refs`. */
export function learningForEntity(g, entityId) {
 const relations = (g.nodes || []).filter(isLearningNode);
 const bare = String(entityId || '').replace(/^[a-z_]+:/, '');
 if (!bare) return [];
 return relations
  .filter(n => (String(n.metadata?.evidence_refs || n.evidenceRefs || '').match(TOKEN) || []).includes(bare))
  .map(relationView);
}

/** Ancestors and descendants along declared `derived_from` links only. */
export function learningLineage(g, id) {
 const nodes = (g.nodes || []).filter(isLearningNode);
 const byId = new Map(nodes.map(n => [n.id, n]));
 const node = byId.get(id);
 if (!node) return {id, available:false, reason:'NOT_FOUND', ancestors:[], descendants:[]};
 const parents = new Map(nodes.map(n => [n.id, relationView(n).derivedFrom]));
 const walk = (start, up) => {
  const seen = new Set([start]), out = [], queue = [start];
  while (queue.length) {
   const current = queue.shift();
   const next = up
    ? (parents.get(current) || [])
    : nodes.filter(n => (parents.get(n.id) || []).includes(current)).map(n => n.id);
   for (const nid of next) if (byId.has(nid) && !seen.has(nid)) {seen.add(nid); out.push(relationView(byId.get(nid))); queue.push(nid)}
  }
  return out;
 };
 const ancestors = walk(id, true), descendants = walk(id, false);
 return {
  id, node: relationView(node),
  available: ancestors.length + descendants.length > 0,
  reason: ancestors.length + descendants.length ? '' : 'NO_DECLARED_LINEAGE',
  ancestors, descendants
 };
}

/** Evidence references that do not resolve to any node in the projection. */
export function unresolvedEvidence(g) {
 const ids = new Set((g.nodes || []).map(n => n.id));
 const out = [];
 for (const n of (g.nodes || []).filter(isLearningNode))
  for (const tokenRef of String(n.metadata?.evidence_refs || n.evidenceRefs || '').match(TOKEN) || [])
   if (!ids.has('test:' + tokenRef) && !ids.has('claim:' + tokenRef))
    out.push({id:n.id, relationType:n.label || '', missing:tokenRef});
 return out;
}

export function learningReport(g, {source = 'legacy'} = {}) {
 const relations = (g.nodes || []).filter(isLearningNode);
 return {
  generatedAt:new Date().toISOString(),
  source,
  total: relations.length,
  ladder: learningLadder(g.nodes || []),
  emergent: emergentLearning(relations),
  crossDomain: relations.map(relationView).filter(r => r.crossDomain).length,
  unresolvedEvidence: unresolvedEvidence(g).slice(0, 24)
 };
}

/** Accepts a learning_v1 payload, keeping the ladder shape stable. */
export function normalizeLearning(payload, {source = 'v1'} = {}) {
 const p = payload && typeof payload === 'object' ? payload : {};
 const incoming = new Map((Array.isArray(p.ladder) ? p.ladder : []).map(s => [s.id, s]));
 const ladder = LEARNING_STAGES.map(stage => {
  const s = incoming.get(stage.id) || {};
  const items = Array.isArray(s.items) ? s.items : [];
  return {...stage, label:s.label || stage.label, source:s.source || stage.source, count:Number.isFinite(s.count) ? s.count : items.length, available:items.length > 0, items};
 });
 const emergentIn = new Map((Array.isArray(p.emergent) ? p.emergent : []).map(b => [b.id, b]));
 const emergent = EMERGENT_BUCKETS.map(b => {
  const got = emergentIn.get(b.id) || {};
  const items = Array.isArray(got.items) ? got.items : [];
  return {...b, basis:got.basis || b.basis, count:Number.isFinite(got.count) ? got.count : items.length, items};
 });
 return {
  generatedAt:p.generatedAt || new Date().toISOString(),
  source,
  total: Number.isFinite(p.total) ? p.total : ladder.reduce((a, s) => a + s.count, 0),
  ladder, emergent,
  crossDomain: Number.isFinite(p.crossDomain) ? p.crossDomain : 0,
  unresolvedEvidence: Array.isArray(p.unresolvedEvidence) ? p.unresolvedEvidence : []
 };
}
