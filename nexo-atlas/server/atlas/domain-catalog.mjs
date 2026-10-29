import {canonicalDomain, resolveDomain, domainAliases, retiredRecord, semanticDomainPath, validateDomainHierarchy, DOMAIN_ALIAS_VERSION} from '../../src/shared/domain-identity.mjs';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const collections = {work:'WORK',tests:'TEST',hypotheses:'HYPOTHESIS',campaigns:'CAMPAIGN',roadmaps:'ROADMAP',lessons:'LESSON',interdomain:'INTERDOMAIN',artifacts:'ARTIFACT'};
/** Derived display/filter index; raw records and canonical graph IDs are untouched. */
export function compileDomainCatalog(records, {revision, sourceRef} = {}) {
  const domains = new Map(), parentLinks = [], seenLinks = new Set(), memberships = new Map();
  const cite = (row, field) => ({path:string(row?._source_path),field,source_revision:revision,source_ref:sourceRef});
  const ensure = (raw, evidence) => {
    const resolved = resolveDomain(raw), id = resolved.id;
    if (!domains.has(id)) domains.set(id,{id,aliases:domainAliases(id),observed_aliases:[],parents:[],evidence:[],members:new Map()});
    const domain = domains.get(id);
    if (resolved.input && !domain.observed_aliases.includes(resolved.input)) domain.observed_aliases.push(resolved.input);
    if (evidence) domain.evidence.push({...evidence,source_value:resolved.input,resolution:resolved.basis});
    return domain;
  };
  // Only an explicit owner_domain + subdomains contract authorizes parentage.
  for (const contract of records.domainContracts || []) {
    if (!object(contract) || !string(contract.owner_domain) || !Array.isArray(contract.subdomains)) continue;
    const parent = ensure(contract.owner_domain,cite(contract,'owner_domain')).id;
    for (const raw of contract.subdomains) {
      if (!string(raw)) continue;
      const child = ensure(raw,cite(contract,'subdomains')).id, key = JSON.stringify([parent,child]);
      if (child===parent || seenLinks.has(key)) continue;
      seenLinks.add(key);const link={parent,child,basis:'EXPLICIT_DOMAIN_CONTRACT',...cite(contract,'subdomains')};
      parentLinks.push(link);domains.get(child).parents.push(link);
    }
  }
  // Malformed cyclic taxonomy is evidence to inspect, never a rollup rule.
  const {links:validLinks,quarantined}=validateDomainHierarchy(parentLinks);
  const rejected=new Set(quarantined);parentLinks.splice(0,parentLinks.length,...validLinks);for(const domain of domains.values())domain.parents=domain.parents.filter(link=>!rejected.has(link));
  const add = (domain,id,kind,row,trace) => {
    const entry = domains.get(domain), prior = entry.members.get(id);
    const member = prior || {id,canonical_id:string(row.id),kind,retired:retiredRecord(row),historical:row.historical===true,traces:[]};
    if (!member.traces.some(item=>JSON.stringify(item)===JSON.stringify(trace))) member.traces.push(trace);
    entry.members.set(id,member);
    const list = memberships.get(id) || new Set();list.add(domain);memberships.set(id,list);
  };
  for (const [collection,kind] of Object.entries(collections)) for (const row of records[collection] || []) {
    if (!object(row) || !string(row.id) || row._derived_from_roadmap === true) continue;
    const id=kind+'::'+row.id, raw=string(row.domain)||string(row.lane)||string(row.semantic?.domain_id);
    const direct=ensure(raw,cite(row,'domain')).id;
    add(direct,id,kind,row,{basis:'DIRECT_SOURCE_DOMAIN',source_value:raw,...cite(row,row.domain?'domain':row.lane?'lane':'semantic.domain_id')});
    // A source path like science.cosmology.h0 counts only when the same parent
    // and child occur in a source contract. No title/text/vector guesses.
    for (const path of semanticDomainPath(row)) for (const link of parentLinks) {
      if (path.segments.length<2 || canonicalDomain(path.segments[0])!==link.parent || canonicalDomain(path.segments[1])!==link.child) continue;
      if (direct!==link.parent && direct!==link.child) continue; // inconsistent cross-domain metadata is not promoted
      add(link.child,id,kind,row,{basis:'EXPLICIT_SEMANTIC_PATH',source_value:path.value,contract_path:link.path,...cite(row,path.field)});
    }
    // Direct child declarations also contribute to their parent's unique total.
    // Bound traversal and keep visited nodes so malformed cycles cannot inflate it.
    const pending=[...memberships.get(id)],visited=new Set(pending);
    while(pending.length){const child=pending.shift();for(const link of domains.get(child)?.parents||[]){
      if(visited.has(link.parent))continue;visited.add(link.parent);pending.push(link.parent);
      add(link.parent,id,kind,row,{basis:'EXPLICIT_CHILD_ROLLUP',child,contract_path:link.path,...cite(row,'domain')});
    }}
    if (collection==='interdomain') for (const field of ['source_domains','target_domains']) for (const value of Array.isArray(row[field])?row[field]:[]) if(string(value)) ensure(value,cite(row,field));
  }
  // A named source surface can explain an empty reference-only navigation stub.
  // This is a display redirect, never equivalence, hierarchy or test membership.
  const surfaceOwners = new Map(), declared = new Set();
  for (const contract of records.domainContracts || []) {
    if (!object(contract) || !string(contract.owner_domain)) continue;
    const owner = canonicalDomain(contract.owner_domain); declared.add(owner);
    for (const child of Array.isArray(contract.subdomains) ? contract.subdomains : []) if (string(child)) declared.add(canonicalDomain(child));
    for (const [field,values] of [['domain_surface',[contract.domain_surface]],['domain_surfaces',contract.domain_surfaces]]) for (const value of Array.isArray(values) ? values : []) {
      if (typeof value !== 'string') continue;
      const match = /^02_DOMAINS\/([^/]+)\/?$/.exec(value);
      if (!match) continue;
      const surface = canonicalDomain(match[1]); if (surface === owner) continue;
      const list = surfaceOwners.get(surface) || [];
      list.push({owner,surface,source_value:value,basis:'EXPLICIT_CONTRACT_DOMAIN_SURFACE',...cite(contract,field)}); surfaceOwners.set(surface,list);
    }
  }
  const redirects = new Map();
  for (const domain of domains.values()) {
    const referencesOnly = domain.members.size === 0 && !declared.has(domain.id) && domain.evidence.length > 0 && domain.evidence.every(item => ['source_domains','target_domains'].includes(item.field));
    const evidence = surfaceOwners.get(domain.id) || [], owners = [...new Set(evidence.map(item=>item.owner))];
    if (referencesOnly && owners.length === 1 && domains.has(owners[0])) redirects.set(domain.id,{to:owners[0],basis:'EMPTY_REFERENCE_SURFACE',evidence:evidence.slice().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))});
  }
  const entries = [...domains.values()].map(({members,...domain})=>{
    const rows=[...members.values()].sort((a,b)=>a.id.localeCompare(b.id));
    const tests=rows.filter(row=>row.kind==='TEST'&&!row.historical), direct=tests.filter(row=>row.traces.some(trace=>trace.basis==='DIRECT_SOURCE_DOMAIN')).length;
    return {...domain,navigation_redirect:redirects.get(domain.id) ?? null,navigation_surfaces:[...redirects].filter(([,redirect])=>redirect.to===domain.id).map(([id])=>id).sort(),observed_aliases:domain.observed_aliases.sort(),evidence:domain.evidence.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
      counts:{entities:rows.length,tests:tests.length,direct_tests:direct,inherited_tests:tests.length-direct,current_tests:tests.filter(row=>!row.retired).length,retired_tests:tests.filter(row=>row.retired).length},members:rows};
  }).sort((a,b)=>a.id.localeCompare(b.id));
  return {contract:'ATLAS_PRIVATE_DOMAIN_CATALOG_V1',access:'PRIVATE',source_revision:revision,alias_version:DOMAIN_ALIAS_VERSION,
    basis:'EXACT_ALIAS_AND_EXPLICIT_SOURCE_MEMBERSHIP',collections:Object.keys(collections),synthetic_records_counted:false,scientific_authority:false,quarantined_relations:quarantined.map(link=>({...link,reason:'CYCLIC_DOMAIN_CONTRACT'})),counts_scope:'UNIQUE_CANONICAL_ID_PER_DOMAIN; PARENT_TOTALS_OVERLAP_CHILDREN; HISTORICAL_TESTS_EXCLUDED',domains:entries};
}
