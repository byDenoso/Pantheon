/** Builds the Learning filament graph out of what learning_v1 declares.
 *
 *  Four kinds of relation are drawn, and nothing else:
 *   - the ladder itself (Observação → Padrão → Lição → Estratégia → Política),
 *     which is the declared shape of the projection;
 *   - a stage's membership in a domain the record itself names in `domainA`;
 *   - a cross-domain bridge, only where a record declares `domain_a`,
 *     `domain_b` and a CROSS_DOMAIN scope;
 *   - a lineage link, only where `pattern_id` / `new_pattern_id` resolves to a
 *     pattern the projection actually publishes.
 *
 *  A pattern id that points nowhere is not drawn. Similar wording is never a
 *  relation. The whole layer is DERIVED_NOT_EVIDENCE: it says how the records
 *  are connected in the projection, never that a scientific claim is supported.
 */

const AUTHORITY = 'DERIVED_NOT_EVIDENCE';

const STAGE_ORDER = ['OBSERVATION', 'PATTERN', 'LESSON', 'STRATEGY', 'POLICY'];
const STAGE_LABEL = {
 OBSERVATION: 'Observação', PATTERN: 'Padrão', LESSON: 'Lição',
 STRATEGY: 'Estratégia', POLICY: 'Política'
};

/** CROSS_DOMAIN is a scope marker on a relation, not a domain to hub. */
const NOT_A_DOMAIN = new Set(['CROSS_DOMAIN', 'UNMAPPED', 'UNKNOWN', '']);

const parseRefs = value => {
 if (!value) return {};
 if (typeof value === 'object') return value;
 try {const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {}} catch {return {}}
};

const shortDomain = name => String(name || '')
 .replace(/^NEXO_/, '').replaceAll('_', ' ')
 .toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase());

const EMPTY = Object.freeze({
 focus: 'system:LEARNING', nodes: [], edges: [], authority: AUTHORITY,
 stats: {items: 0, lineage: 0, crossDomain: 0, declaredDomains: 0, undeclaredDomain: 0, hubs: 0}
});

export function buildLearningGraph(report) {
 // No projection means no graph. An unavailable Learning read is stated as
 // unavailable; it never becomes an empty-looking but plausible diagram.
 if (!report || !Array.isArray(report.ladder)) return {...EMPTY, nodes: [], edges: []};
 const ladder = report.ladder;
 const items = ladder.flatMap(stage => (stage.items || []).map(i => ({...i, stage: i.stage || stage.id})));

 const nodes = [{
  id: 'system:LEARNING', type: 'SYSTEM', label: 'Learning',
  authority: AUTHORITY, metadata: {short_label_pt: 'Learning'}
 }];
 const edges = [];
 const push = (id, source, target, type, extra = {}) =>
  edges.push({id, source, target, type, authority: AUTHORITY, ...extra});

 /* ---------- the declared ladder ---------- */
 const present = STAGE_ORDER.filter(id => ladder.some(s => s.id === id));
 for (const id of present) {
  const stage = ladder.find(s => s.id === id);
  nodes.push({
   id: `learning-stage:${id}`, type: 'DOMAIN', label: STAGE_LABEL[id] || id,
   authority: AUTHORITY, count: stage.count ?? (stage.items || []).length,
   metadata: {short_label_pt: STAGE_LABEL[id] || id, learningStage: id}
  });
  push(`learning:CONTAINS:${id}`, 'system:LEARNING', `learning-stage:${id}`, 'CONTAINS');
 }
 for (let i = 0; i < present.length - 1; i++) {
  push(`learning:LADDER:${present[i]}:${present[i + 1]}`,
   `learning-stage:${present[i]}`, `learning-stage:${present[i + 1]}`, 'LADDER');
 }

 /* ---------- domains the records themselves name ---------- */
 const domainCount = new Map();      // domain -> records declaring it
 const stageDomain = new Map();      // "stage|domain" -> records
 let undeclaredDomain = 0;
 for (const item of items) {
  const declared = String(item.domainA || '').trim();
  if (NOT_A_DOMAIN.has(declared.toUpperCase()) || !declared) {
   if (!declared) undeclaredDomain++;
   continue;
  }
  domainCount.set(declared, (domainCount.get(declared) || 0) + 1);
  const key = `${item.stage}|${declared}`;
  stageDomain.set(key, (stageDomain.get(key) || 0) + 1);
 }
 /* ---------- which domains earn a body on the canvas ---------- */
 // Declared bridges are read first: a domain that is one end of a declared
 // CROSS_DOMAIN relation always gets a hub, even if a single record names it.
 // Otherwise a real, published bridge would silently vanish from the map.
 const bridgePairs = [];
 let crossDomain = 0;
 for (const item of items) {
  const refs = parseRefs(item.evidenceRefs);
  const a = String(refs.domain_a || '').trim(), b = String(refs.domain_b || '').trim();
  if (!a || !b || a === b || String(refs.relation_scope || '').toUpperCase() !== 'CROSS_DOMAIN') continue;
  crossDomain++;
  bridgePairs.push({a, b, relationType: refs.relation_type || '', record: item.id});
 }
 const bridgeDomains = new Set(bridgePairs.flatMap(p => [p.a, p.b]).filter(d => !NOT_A_DOMAIN.has(d.toUpperCase())));

 // a domain named by only one record, and by no bridge, stays in the counters
 const ranked = [...new Set([...domainCount.keys(), ...bridgeDomains])]
  .filter(d => domainCount.get(d) >= 2 || bridgeDomains.has(d))
  .sort((x, y) => (domainCount.get(y) || 0) - (domainCount.get(x) || 0));
 const hubs = ranked.slice(0, 8).map(d => [d, domainCount.get(d) || 1]);
 const hubIds = new Set(hubs.map(([d]) => `learning-domain:${d}`));
 for (const [domain, count] of hubs) {
  nodes.push({
   id: `learning-domain:${domain}`, type: 'CAMPAIGN', label: shortDomain(domain),
   authority: AUTHORITY, domain, domains: [domain], count,
   metadata: {short_label_pt: shortDomain(domain), declaredBy: count}
  });
 }
 for (const [key, count] of stageDomain) {
  const [stage, domain] = key.split('|');
  const target = `learning-domain:${domain}`;
  if (!hubIds.has(target) || !present.includes(stage)) continue;
  push(`learning:DECLARES:${stage}:${domain}`, `learning-stage:${stage}`, target, 'DECLARES', {weight: count});
 }

 /* ---------- declared cross-domain bridges ---------- */
 const seenBridge = new Set();
 for (const {a, b, relationType, record} of bridgePairs) {
  const key = [a, b].sort().join('|');
  if (seenBridge.has(key)) continue;
  seenBridge.add(key);
  const from = `learning-domain:${a}`, to = `learning-domain:${b}`;
  if (!hubIds.has(from) || !hubIds.has(to)) continue;
  push(`learning:BRIDGE:${key}`, from, to, 'BRIDGE', {
   relationScope: 'CROSS_DOMAIN', relationType, sourceRecord: record
  });
 }

 /* ---------- lineage links that actually resolve ---------- */
 const patternById = new Map();
 for (const item of items) {
  if (item.stage !== 'PATTERN') continue;
  patternById.set(item.id, item);
  patternById.set(String(item.id).replace(/^pattern:/, ''), item);
 }
 let lineage = 0;
 const attached = new Set();
 for (const item of items) {
  const refs = parseRefs(item.evidenceRefs);
  const ref = refs.pattern_id || refs.new_pattern_id;
  if (!ref) continue;
  const target = patternById.get(String(ref)) || patternById.get(`pattern:${ref}`);
  if (!target || target.id === item.id) continue;   // dangling ids are not relations
  lineage++;
  attached.add(item.id);
  attached.add(target.id);
  push(`learning:LINEAGE:${item.id}:${target.id}`, item.id, target.id, 'LINEAGE', {
   relationType: item.relationType || ''
  });
 }
 // only the records that carry a resolvable link become bodies on the canvas
 for (const item of items) {
  if (!attached.has(item.id)) continue;
  const domain = NOT_A_DOMAIN.has(String(item.domainA || '').toUpperCase()) ? '' : String(item.domainA || '');
  nodes.push({
   id: item.id, type: 'CLAIM', label: item.relationType || item.id,
   status: item.status || '', authority: AUTHORITY,
   ...(domain ? {domain, domains: [domain]} : {}),
   metadata: {short_label_pt: item.metadata?.short_label_pt || '', learningStage: item.stage}
  });
  push(`learning:AT:${item.id}`, `learning-stage:${item.stage}`, item.id, 'AT_STAGE');
 }

 const known = new Set(nodes.map(n => n.id));
 return {
  focus: 'system:LEARNING',
  nodes,
  edges: edges.filter(e => known.has(e.source) && known.has(e.target)),
  authority: AUTHORITY,
  stats: {
   items: items.length,
   lineage,
   crossDomain,
   declaredDomains: domainCount.size,
   undeclaredDomain,
   hubs: hubs.length
  }
 };
}
