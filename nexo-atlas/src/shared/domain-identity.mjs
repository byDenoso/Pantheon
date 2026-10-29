// Versioned, exact presentation aliases. This is not a scientific equivalence
// classifier: parent/child relations and membership need separate source evidence.
export const DOMAIN_ALIAS_VERSION = 'ATLAS_DOMAIN_ALIASES_V1';
const groups = [
  ['SCIENCE', 'science', 'ciência', 'ciencia'],
  ['COSMOLOGY', 'cosmology', 'cosmologia'],
  ['ASTROPHYSICS', 'astrophysics', 'astrofísica', 'astrofisica'],
  ['PHYSICS', 'physics', 'física', 'fisica'],
  ['ENGINEERING', 'engineering', 'engenharia'],
  ['PERSONAL', 'personal', 'pessoal'],
  ['HEALTH', 'health', 'saúde', 'saude'],
  ['BODYBUILDING', 'bodybuilding', 'fisiculturismo'],
  ['OLYMPUS', 'olympus'], ['NEXO', 'nexo'], ['ARTIFACT', 'artifact', 'artefato'],
  ['AI', 'ai', 'ia', 'artificial intelligence', 'inteligência artificial'],
];
const key = value => value.normalize('NFC').toLocaleLowerCase('en-US');
const aliases = new Map(groups.flatMap(([id, ...names]) => [id, ...names].map(name => [key(name), id])));
export function resolveDomain(value) {
  const input = typeof value === 'string' ? value.trim().normalize('NFC') : '';
  if (!input) return {id:'UNMAPPED', input:null, basis:'UNMAPPED', alias_version:DOMAIN_ALIAS_VERSION};
  const known = aliases.get(key(input));
  return {id:known || input, input, basis:known ? input === known ? 'CANONICAL_ID' : key(input) === key(known) ? 'CASE_ALIAS' : 'TRANSLATION_ALIAS' : 'SOURCE_ID', alias_version:DOMAIN_ALIAS_VERSION};
}
export const canonicalDomain = value => resolveDomain(value).id;
export const domainAliases = value => {const id=canonicalDomain(value);return groups.find(group=>group[0]===id)?.slice() || [id];};
export const retiredRecord = row => row?.historical === true || /^(?:ARCHIVED|RETIRED|SUPERSEDED|RETRACTED|INVALIDATED|TOMBSTONE|DELETED|CANCELLED)$/.test(String(row?.status ?? row?.state ?? '').toUpperCase());
// Match on path segments, never on prefixes such as science.cosmologyish.
export function semanticDomainPath(row) {
  const semantic = row?.semantic && typeof row.semantic === 'object' ? row.semantic : {};
  return [['semantic.subdomain_id',semantic.subdomain_id],['semantic.topic_id',semantic.topic_id],['subdomain_id',row?.subdomain_id],['topic_id',row?.topic_id]].filter(([,value])=>typeof value==='string').map(([field,value])=>({field,value,segments:value.split('.')}));
}
/** Quarantine every edge participating in a cycle; never choose a winner by order. */
export function validateDomainHierarchy(links) {
  const children=new Map();
  for(const link of links){const list=children.get(link.parent)||[];list.push(link.child);children.set(link.parent,list);}
  const reaches=(from,to)=>{const queue=[from],seen=new Set();while(queue.length){const id=queue.pop();if(id===to)return true;if(seen.has(id))continue;seen.add(id);queue.push(...(children.get(id)||[]));}return false;};
  const quarantined=links.filter(link=>reaches(link.child,link.parent)), rejected=new Set(quarantined);
  return {links:links.filter(link=>!rejected.has(link)),quarantined};
}
