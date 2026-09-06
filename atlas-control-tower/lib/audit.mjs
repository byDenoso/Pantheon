/** Migration health derived from the live projection.
 *  Every item is an observed fact about the current graph. Nothing here is a
 *  scientific entity, and nothing is repaired: issues are reported, never fixed.
 *  When the datasource is science_v1 the backend's own audit payload is used
 *  instead of this derivation — see `normalizeAudit`. */
import {state} from './model.mjs';

export const SEVERITY = Object.freeze({ERROR:'ERROR', WARN:'WARN', INFO:'INFO'});

export const AUDIT_CATEGORIES = Object.freeze([
 {id:'BROKEN_REFERENCE',   label:'Referências quebradas',        severity:SEVERITY.ERROR, detail:'Relação registrada cuja outra ponta não existe na projeção. A aresta foi descartada, não inventada.'},
 {id:'RESULT_SUBJECT',     label:'Resultado sem sujeito',        severity:SEVERITY.ERROR, detail:'Result envelope sem teste de origem explícito na fonte.'},
 {id:'UNRESOLVED_DOMAIN',  label:'Domínio não resolvido',        severity:SEVERITY.WARN,  detail:'Entidade cujo domínio não foi resolvido na fonte. Não é um domínio científico.'},
 {id:'AMBIGUOUS_MAPPING',  label:'Mapeamento ambíguo',           severity:SEVERITY.WARN,  detail:'Entidade contida por mais de um domínio ao mesmo tempo.'},
 {id:'MISSING_PROVENANCE', label:'Provenance ausente',           severity:SEVERITY.WARN,  detail:'Entidade de autoridade científica sem referência de fonte registrada.'},
 {id:'SUPERSEDED_REF',     label:'Referência substituída',       severity:SEVERITY.WARN,  detail:'Relação apontando para registro marcado como substituído ou aposentado.'},
 {id:'LEGACY_REFERENCE',   label:'Referência legada classificada',severity:SEVERITY.INFO, detail:'Registro preservado por provenance; aposentado no runtime atual.'},
 {id:'OPEN_BLOCKER',       label:'Bloqueios em aberto',          severity:SEVERITY.INFO,  detail:'Estado científico registrado como bloqueado. Não é defeito de migração; aparece aqui para triagem.'},
 {id:'OTHER',              label:'Outras ocorrências',           severity:SEVERITY.INFO,  detail:'Registros sem rótulo utilizável na fonte.'}
]);

const LEGACY_STATUS = /SUPERSEDED|RETIRED|LEGACY|DEPRECATED/i;

const ref = (n, over = {}) => ({
 id:n?.id || '', label:n?.label || '(sem rótulo)', type:n?.type || '', domain:n?.domain || '',
 status:n?.status || '', authority:n?.authority || '', ...over
});

/** @returns {{generatedAt:string,total:number,source:string,categories:Array}} */
export function auditReport(g, {sample = 12, source = 'legacy'} = {}) {
 const byId = new Map((g.nodes || []).map(n => [n.id, n]));
 const produced = new Set(), domainsOf = new Map(), referencedBy = new Map();
 for (const e of g.edges || []) {
  if (e.type === 'PRODUCES') produced.add(e.target);
  if (e.type === 'CONTAINS' && String(e.source).startsWith('domain:')) {
   if (!domainsOf.has(e.target)) domainsOf.set(e.target, new Set());
   domainsOf.get(e.target).add(e.source);
  }
  if (!referencedBy.has(e.target)) referencedBy.set(e.target, []);
  referencedBy.get(e.target).push(e);
 }
 const nodes = g.nodes || [];
 const found = {
  BROKEN_REFERENCE: (g.issues || []).filter(i => i.reason === 'UNRESOLVED_ENDPOINT')
   .map(i => ({id:i.id, label:i.missing || i.id, type:'EDGE', source:i.source, target:i.target, missing:i.missing, status:'', authority:''})),
  RESULT_SUBJECT: nodes.filter(n => n.type === 'RESULT' && !produced.has(n.id)).map(n => ref(n)),
  UNRESOLVED_DOMAIN: nodes.filter(n => n.domain === 'UNMAPPED' && n.type !== 'DOMAIN').map(n => ref(n)),
  AMBIGUOUS_MAPPING: [...domainsOf].filter(([, d]) => d.size > 1)
   .map(([id, d]) => ref(byId.get(id) || {id}, {domains:[...d]})),
  MISSING_PROVENANCE: nodes.filter(n => n.authority === 'SCIENCE_CANONICAL' && !(n.sourceRefs || []).length).map(n => ref(n)),
  SUPERSEDED_REF: [...referencedBy].filter(([target]) => LEGACY_STATUS.test(byId.get(target)?.status || ''))
   .map(([target, edges]) => ref(byId.get(target), {referencedBy: edges.slice(0, 3).map(e => e.source)})),
  LEGACY_REFERENCE: nodes.filter(n => n.type === 'AUTOMATION' && LEGACY_STATUS.test(n.status || '')).map(n => ref(n)),
  OPEN_BLOCKER: nodes.filter(n => state(n.status) === 'blocked').map(n => ref(n)),
  OTHER: nodes.filter(n => !String(n.label ?? '').trim()).map(n => ref(n))
 };
 const categories = AUDIT_CATEGORIES.map(c => ({
  ...c,
  count: found[c.id].length,
  items: found[c.id].slice(0, Math.max(0, Number(sample) || 0)).map(item => ({
   ...item,
   issueType: c.id, severity: c.severity, source, status: item.status || '', resolution: ''
  }))
 }));
 const total = categories.reduce((a, c) => a + c.count, 0);
 // Findings derived from the graph have no resolution lifecycle: they are all live.
 return {generatedAt:new Date().toISOString(), source, total, open: total, resolved: 0,
  categories: categories.map(c => ({...c, openCount: c.count, items: c.items.map(i => ({...i, open: true}))}))};
}

/** Accepts a science_v1 audit payload; falls back to the declared categories so
 *  the UI shape is identical whichever source answered. */
export function normalizeAudit(payload, {source = 'v1'} = {}) {
 const p = payload && typeof payload === 'object' ? payload : {};
 const incoming = new Map((Array.isArray(p.categories) ? p.categories : []).map(c => [c.id, c]));
 const categories = AUDIT_CATEGORIES.map(base => {
  const c = incoming.get(base.id) || {};
  const items = Array.isArray(c.items) ? c.items : [];
  return {
   ...base,
   label: c.label || base.label,
   severity: c.severity || base.severity,
   detail: c.detail || base.detail,
   count: Number.isFinite(c.count) ? c.count : items.length,
   openCount: Number.isFinite(c.openCount) ? c.openCount : items.filter(i => i.open).length,
   items: items.map(i => ({
    id:i.id || '', label:i.label || i.id || '', type:i.type || '', domain:i.domain || '',
    status:i.status || '', open:i.open !== undefined ? !!i.open : !/RESOLVED|CLOSED|ACCEPTED/i.test(String(i.status || '')),
    authority:i.authority || '', severity:i.severity || base.severity,
    issueType:i.issueType || base.id, source:i.source || source, resolution:i.resolution || i.notes || '',
    ...(i.missing ? {missing:i.missing, source:i.source, target:i.target} : {})
   }))
  };
 });
 // Categories a V1 backend adds that this build does not know about yet.
 for (const [id, c] of incoming) if (!categories.some(x => x.id === id))
  categories.push({id, label:c.label || id.replaceAll('_',' '), severity:c.severity || SEVERITY.INFO, detail:c.detail || '', count:c.count || 0, openCount:c.openCount || 0, items:c.items || []});
 const total = Number.isFinite(p.total) ? p.total : categories.reduce((a, c) => a + c.count, 0);
 const open = Number.isFinite(p.open) ? p.open : categories.reduce((a, c) => a + (c.openCount || 0), 0);
 return {generatedAt: p.generatedAt || new Date().toISOString(), source, total, open, resolved: Number.isFinite(p.resolved) ? p.resolved : total - open, categories};
}

/** Domain buckets with the unresolved bucket removed; it belongs to audit, not to science. */
export function scientificDomains(domains = {}) {
 return Object.fromEntries(Object.entries(domains).filter(([k]) => k && k !== 'UNMAPPED'));
}
