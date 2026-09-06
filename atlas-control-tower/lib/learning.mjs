/** Learning projection helpers.
 *  Every bucket below is computed from fields the source actually publishes
 *  (status, relation_type, support/contradiction counters, use counters,
 *  confidence, evidence_refs). No score is synthesised and no relation between
 *  a learning record and a scientific entity is created here: only explicit
 *  `evidence_refs` that resolve to an existing node are linked. */

export const LEARNING_STAGES = Object.freeze([
 {id:'OBSERVATION', label:'Observação', source:'RELATION_LEDGER · status OBSERVED'},
 {id:'PATTERN',     label:'Padrão',     source:'RELATION_LEDGER · relação asserida'},
 {id:'LESSON',      label:'Lição',      source:'PROCEDURAL_MEMORY'},
 {id:'STRATEGY',    label:'Estratégia', source:'STRATEGY_REGISTRY'},
 {id:'POLICY',      label:'Política',   source:'ADAPTIVE_POLICY'}
]);

const num = v => {const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0};
const upper = v => String(v ?? '').toUpperCase();

/** Explicit stage when the source declares one; otherwise inferred from the record's own status. */
export function stageOf(node) {
 const declared = upper(node.stage || node.subtype);
 if (LEARNING_STAGES.some(s => s.id === declared)) return declared;
 if (node.type !== 'LEARNING_RELATION') return null;
 return upper(node.status) === 'OBSERVED' ? 'OBSERVATION' : 'PATTERN';
}

export function relationView(node) {
 const m = node.metadata || {};
 const confidence = Number(node.confidence);
 return {
  id: node.id,
  relationType: node.label || m.relation_type || '',
  status: node.status || '',
  scope: m.relation_scope || '',
  domainA: m.domain_a || '', domainB: m.domain_b || '',
  nodeA: m.node_a || '', nodeB: m.node_b || '',
  crossDomain: !!(m.domain_a && m.domain_b && m.domain_a !== m.domain_b),
  support: num(m.support_count), contradiction: num(m.contradiction_count),
  successes: num(m.successful_uses), failures: num(m.failed_uses),
  utility: m.utility || '',
  confidence: Number.isFinite(confidence) ? confidence : null,
  firstSeen: m.first_seen || '', lastSeen: m.last_seen || node.updatedAt || '',
  notes: node.summary || m.notes || '',
  evidenceRefs: String(m.evidence_refs || '')
 };
}

export const EMERGENT_BUCKETS = Object.freeze([
 {id:'new',           label:'Novos padrões',  basis:'status OBSERVED ou HYPOTHESIS'},
 {id:'strengthening', label:'Fortalecendo',   basis:'support_count > contradiction_count'},
 {id:'weakening',     label:'Enfraquecendo',  basis:'contradiction_count > 0 ou failed_uses > successful_uses'},
 {id:'promoted',      label:'Promovidos',     basis:'status VALIDATED'},
 {id:'contradicted',  label:'Contraditos',    basis:'relation_type CONTRADICTION ou contradiction_count >= support_count'},
 {id:'unresolved',    label:'Não resolvidos', basis:'sem status na fonte'}
]);

/** A record may appear in more than one bucket; buckets are observations, not a ranking. */
export function emergentLearning(relations = []) {
 const views = relations.map(relationView);
 const test = {
  new: r => ['OBSERVED', 'HYPOTHESIS'].includes(upper(r.status)),
  strengthening: r => r.support > r.contradiction && r.support > 0,
  weakening: r => r.contradiction > 0 || r.failures > r.successes,
  promoted: r => upper(r.status) === 'VALIDATED',
  contradicted: r => upper(r.relationType) === 'CONTRADICTION' || (r.contradiction > 0 && r.contradiction >= r.support),
  unresolved: r => !String(r.status).trim()
 };
 return EMERGENT_BUCKETS.map(b => {
  const items = views.filter(test[b.id]);
  return {...b, count: items.length, items};
 });
}

export function learningLadder(nodes = []) {
 const learning = nodes.filter(n => n.type === 'LEARNING_RELATION' || LEARNING_STAGES.some(s => s.id === upper(n.stage || n.subtype)));
 return LEARNING_STAGES.map(stage => {
  const items = learning.filter(n => stageOf(n) === stage.id);
  return {
   ...stage,
   count: items.length,
   available: items.length > 0,
   items: items.slice(0, 24).map(n => (n.type === 'LEARNING_RELATION' ? relationView(n) : {id:n.id, relationType:n.label, status:n.status || ''}))
  };
 });
}

const TOKEN = /(?:T-[A-Za-z0-9_+≈.\-]+|DH-[A-Za-z0-9_.\-]+|H-[A-Za-z0-9_.\-]+)/g;

/** Learning records that explicitly cite this entity in `evidence_refs`. */
export function learningForEntity(g, entityId) {
 const relations = (g.nodes || []).filter(n => n.type === 'LEARNING_RELATION');
 const bare = String(entityId || '').replace(/^[a-z_]+:/, '');
 if (!bare) return [];
 return relations
  .filter(n => {
   const refs = String(n.metadata?.evidence_refs || '').match(TOKEN) || [];
   return refs.includes(bare);
  })
  .map(relationView);
}

/** Evidence references that do not resolve to any node in the projection. */
export function unresolvedEvidence(g) {
 const ids = new Set((g.nodes || []).map(n => n.id));
 const out = [];
 for (const n of (g.nodes || []).filter(x => x.type === 'LEARNING_RELATION')) {
  for (const tokenRef of String(n.metadata?.evidence_refs || '').match(TOKEN) || [])
   if (!ids.has('test:' + tokenRef) && !ids.has('claim:' + tokenRef))
    out.push({id:n.id, relationType:n.label || '', missing:tokenRef});
 }
 return out;
}

export function learningReport(g) {
 const relations = (g.nodes || []).filter(n => n.type === 'LEARNING_RELATION');
 return {
  generatedAt: new Date().toISOString(),
  total: relations.length,
  ladder: learningLadder(g.nodes || []),
  emergent: emergentLearning(relations),
  crossDomain: relations.map(relationView).filter(r => r.crossDomain).length,
  unresolvedEvidence: unresolvedEvidence(g).slice(0, 24)
 };
}
