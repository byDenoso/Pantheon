/** Migration health derived from the live projection.
 *  Every item is an observed fact about the current graph. Nothing here is a
 *  scientific entity, and nothing is repaired: issues are reported, never fixed. */

export const AUDIT_CATEGORIES = Object.freeze([
 {id:'BROKEN_REFERENCE',   label:'Referências quebradas',      detail:'Relação registrada cuja outra ponta não existe na projeção. A aresta foi descartada, não inventada.'},
 {id:'UNRESOLVED_DOMAIN',  label:'Domínio não resolvido',      detail:'Entidade cujo domínio não foi resolvido na fonte. Não é um domínio científico.'},
 {id:'UNRESOLVED_OWNER',   label:'Resultado sem dono',         detail:'Result envelope sem teste de origem explícito na fonte.'},
 {id:'AMBIGUOUS_MAPPING',  label:'Mapeamento ambíguo',         detail:'Entidade contida por mais de um domínio ao mesmo tempo.'},
 {id:'LEGACY_ALIAS',       label:'Alias legado',               detail:'Registro preservado por provenance; aposentado no runtime atual.'},
 {id:'OTHER',              label:'Outras ocorrências',         detail:'Registros sem rótulo utilizável na fonte.'}
]);

const ref = n => ({id:n.id, label:n.label || '(sem rótulo)', type:n.type, domain:n.domain || ''});

/** @returns {{generatedAt:string,total:number,categories:Array}} */
export function auditReport(g, {sample = 12} = {}) {
 const byId = new Map((g.nodes || []).map(n => [n.id, n]));
 const produced = new Set(), domainsOf = new Map();
 for (const e of g.edges || []) {
  if (e.type === 'PRODUCES') produced.add(e.target);
  if (e.type === 'CONTAINS' && String(e.source).startsWith('domain:')) {
   if (!domainsOf.has(e.target)) domainsOf.set(e.target, new Set());
   domainsOf.get(e.target).add(e.source);
  }
 }
 const found = {
  BROKEN_REFERENCE: (g.issues || [])
   .filter(i => i.reason === 'UNRESOLVED_ENDPOINT')
   .map(i => ({id:i.id, label:i.missing || i.id, type:'EDGE', source:i.source, target:i.target, missing:i.missing})),
  UNRESOLVED_DOMAIN: (g.nodes || []).filter(n => n.domain === 'UNMAPPED' && n.type !== 'DOMAIN').map(ref),
  UNRESOLVED_OWNER: (g.nodes || []).filter(n => n.type === 'RESULT' && !produced.has(n.id)).map(ref),
  AMBIGUOUS_MAPPING: [...domainsOf].filter(([, d]) => d.size > 1)
   .map(([id, d]) => ({...ref(byId.get(id) || {id}), domains:[...d]})),
  LEGACY_ALIAS: (g.nodes || []).filter(n => n.type === 'AUTOMATION' && /LEGACY/i.test(n.status || '')).map(ref),
  OTHER: (g.nodes || []).filter(n => !String(n.label ?? '').trim()).map(ref)
 };
 const categories = AUDIT_CATEGORIES.map(c => ({
  ...c,
  count: found[c.id].length,
  items: found[c.id].slice(0, Math.max(0, Number(sample) || 0))
 }));
 return {
  generatedAt: new Date().toISOString(),
  total: categories.reduce((a, c) => a + c.count, 0),
  categories
 };
}

/** Domain buckets with the unresolved bucket removed; it belongs to audit, not to science. */
export function scientificDomains(domains = {}) {
 return Object.fromEntries(Object.entries(domains).filter(([k]) => k && k !== 'UNMAPPED'));
}
