/** Learning projection helpers.
 * Reads only fields published by learning_v1. No confidence, relation, lesson,
 * strategy or policy is invented by the Atlas projection. */

export const LEARNING_STAGES = Object.freeze([
 {id:'OBSERVATION', label:'Observação', source:'learning_v1.observations'},
 {id:'PATTERN',     label:'Padrão',     source:'learning_v1.patterns'},
 {id:'LESSON',      label:'Lição',      source:'learning_v1.lessons'},
 {id:'STRATEGY',    label:'Estratégia', source:'learning_v1.strategies'},
 {id:'POLICY',      label:'Política',   source:'learning_v1.policies'}
]);

const num = v => {const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0};
const upper = v => String(v ?? '').toUpperCase();

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
  stage: stageOf(node),
  relationType: node.label || m.relation_type || '',
  status: node.status || '',
  scope: m.relation_scope || m.scope || '',
  domainA: m.domain_a || m.domain || '', domainB: m.domain_b || '',
  nodeA: m.node_a || '', nodeB: m.node_b || '',
  crossDomain: !!(m.domain_a && m.domain_b && m.domain_a !== m.domain_b),
  support: num(m.support_count ?? m.supporting_count),
  contradiction: num(m.contradiction_count ?? m.contradicting_count),
  successes: num(m.successful_uses ?? m.prospective_success_count),
  failures: num(m.failed_uses ?? m.prospective_failure_count),
  utility: m.utility || '',
  confidence: Number.isFinite(confidence) ? confidence : null,
  firstSeen: m.first_seen || m.first_seen_at || '',
  lastSeen: m.last_seen || m.last_seen_at || node.updatedAt || '',
  notes: node.summary || m.notes || m.description || m.statement || '',
  evidenceRefs: String(m.evidence_refs || '')
 };
}

export const EMERGENT_BUCKETS = Object.freeze([
 {id:'new',           label:'Novos padrões',  basis:'estágio OBSERVATION ou status OBSERVED/HYPOTHESIS'},
 {id:'strengthening', label:'Fortalecendo',   basis:'supporting/support_count > contradicting/contradiction_count'},
 {id:'weakening',     label:'Enfraquecendo',  basis:'contradições > 0 ou falhas prospectivas > sucessos'},
 {id:'promoted',      label:'Promovidos',     basis:'status VALIDATED'},
 {id:'contradicted',  label:'Contraditos',    basis:'CONTRADICTION ou contradições >= suporte'},
 {id:'unresolved',    label:'Não resolvidos', basis:'sem status na fonte'}
]);

export function emergentLearning(relations = []) {
 const views = relations.map(relationView);
 const test = {
  new: r => r.stage === 'OBSERVATION' || ['OBSERVED', 'HYPOTHESIS'].includes(upper(r.status)),
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
