import {createHash} from 'node:crypto';
import {armFrame,armPoint,morphologyFrom,shapeMetrics} from '../../src/viewmodels/galaxy-morphology.mjs';

// Pure, private-only views. No public projection/compiler, filesystem, network,
// publication script or clock is involved in this boundary.
const CONTRACT='NEXO_ATLAS_PRIVATE_RUNTIME_V1';
const COLLECTIONS=[['work','WORK','work_id'],['tests','TEST','test_id'],['hypotheses','HYPOTHESIS','hypothesis_id'],['campaigns','CAMPAIGN','campaign_id'],['roadmaps','ROADMAP','roadmap_id'],['lessons','LESSON','lesson_id'],['artifacts','ARTIFACT','artifact_id']];
const PRIORITY={CRITICAL:1,HIGH:.82,NORMAL:.58,MEDIUM:.54,LOW:.34};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'?value:'';
const upper=value=>text(value).toUpperCase();
const array=value=>Array.isArray(value)?value:[];
const unique=values=>[...new Set(values.filter(value=>typeof value==='string'&&value.length))].sort();
const round=value=>Math.round(value*1000)/1000;
const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>'sha256:'+createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const countBy=(rows,key)=>Object.fromEntries(unique(rows.map(key)).map(value=>[value,rows.filter(row=>key(row)===value).length]));
const familyOf=id=>id.includes('.')?id.split('.').slice(0,-1).join('.'):id.split('_')[0]||id;
const fail=message=>{throw Object.assign(new Error(message),{code:'PRIVATE_TOWER_VIEWS_INVALID'});};
const fraction=(id,salt)=>createHash('sha256').update(`${salt}\0${id}`).digest().readUInt32BE(0)/0xffffffff;
const gaussian=(id,salt)=>Math.sqrt(-2*Math.log(Math.max(1e-6,fraction(id,salt+'u'))))*Math.cos(2*Math.PI*fraction(id,salt+'v'));

function provenance(revision,sourceRef){
  const source=object(sourceRef)?sourceRef:{};
  return {
    authority:'TOWER_V06',access:'PRIVATE',source_contract:CONTRACT,
    source_ref:typeof sourceRef==='string'?sourceRef:text(source.source_ref||source.ref),
    repository:text(source.repository||source.tower_repository)||null,
    revision,source_revision:revision,source_fingerprint:revision,projection_fingerprint:revision,
    projection_only:true,writeback:'FORBIDDEN',
  };
}

function carriedText(records,basename){
  return Object.entries(object(records.texts)?records.texts:{}).filter(([path,value])=>typeof value==='string'&&(path===basename||path.endsWith('/'+basename))).sort(([a],[b])=>a.localeCompare(b));
}

// Source declarations are evidence of a declared surface, not proof that a
// transport is currently callable. Do not turn arbitrary quoted tool mentions
// or the presence of a Python file into a fabricated LIVE availability claim.
function declaredTools(source){
  const names=[];
  const registrations=/\b(?:Tool|register_tool)\s*\(\s*(?:name\s*=\s*)?["']([^"'\r\n]+)["']/g;
  for(const match of source.matchAll(registrations))names.push(match[1]);
  const decorators=/@(?:[\w.]+\.)?tool\s*\(([^)]*)\)\s*(?:async\s+)?def\s+(\w+)\s*\(/g;
  for(const match of source.matchAll(decorators)){
    const named=/\bname\s*=\s*["']([^"']+)["']/.exec(match[1]);
    const positional=/^\s*["']([^"']+)["']/.exec(match[1]);
    names.push(named?.[1]||positional?.[1]||match[2]);
  }
  return unique(names);
}

function compileTopology(records,revision,generatedAt,sourceRef){
  const source=provenance(revision,sourceRef);
  const capabilitySourcePresent=records.coverage?.capabilities?.status!=='NOT_PRESENT';
  const capabilities=Object.entries(records.capabilities).sort(([a],[b])=>a.localeCompare(b)).map(([id,value])=>({
    ...structuredClone(object(value)?value:{}),id,
    backend:text(value?.backend)||null,status:text(value?.status)||'UNKNOWN',
    scope:text(value?.scope),roles:unique(array(value?.roles)),
  }));
  const internalFiles=carriedText(records,'mcp_server.py'),remoteFiles=carriedText(records,'remote_mcp.py');
  const declarations=new Map();
  const remember=(name,transport,path,basis)=>{
    if(!text(name))return;
    const list=declarations.get(name)||[];
    list.push({transport,path,basis});declarations.set(name,list);
  };
  for(const [transport,files] of [['internal',internalFiles],['remote',remoteFiles]]){
    for(const [path,content] of files)for(const name of declaredTools(content))remember(name,transport,path,'source_registration');
  }
  // A carried canonical tools manifest may describe tools even when code isn't
  // in Tower.files. Retain an unknown transport instead of guessing remote.
  for(const [path,content] of Object.entries(records.texts||{}).sort(([a],[b])=>a.localeCompare(b))){
    if(typeof content!=='string'||!/(?:capabilit|manifest|mcp|tool)[^/]*\.json$/i.test(path))continue;
    let document;try{document=JSON.parse(content);}catch{continue;}
    if(!object(document)||(!Array.isArray(document.tools)&&!object(document.tools)))continue;
    const tools=Array.isArray(document.tools)?document.tools.map(row=>[typeof row==='string'?row:text(row?.name||row?.id),row]):Object.entries(document.tools);
    for(const [name,row] of tools){
      const transport=['internal','remote'].includes(text(row?.transport))?row.transport:'unknown';
      remember(name,transport,path,'manifest_declaration');
    }
  }
  for(const capability of capabilities){
    const tools=unique([...array(capability.tools),...array(capability.mcp_tools),capability.tool,capability.tool_name]);
    for(const name of tools)remember(name,'unknown',text(capability._source_path)||null,'capability_tool_reference');
  }
  const backends=unique(capabilities.map(row=>row.backend)),roles=unique(capabilities.flatMap(row=>row.roles)),families=unique(capabilities.map(row=>familyOf(row.id)));
  const nodes=[],links=[];
  const addLink=(from,to,kind,weight=1)=>links.push({id:'edge:'+JSON.stringify([from,to,kind]),source:from,target:to,kind,weight});
  const toolNames=[...declarations.keys()].sort();
  nodes.push({id:'mcp:nexo',label:'NEXO MCP',kind:'ROOT',group:'MCP',status:'SNAPSHOT',summary:'Private Tower-derived declarations; runtime availability is not inferred.'});
  for(const [id,label,count] of [['tools','MCP tools',toolNames.length],['capabilities','Capabilities',capabilities.length],['backends','Runtime backends',backends.length],['roles','Agent roles',roles.length]]){
    const hasSource=id==='tools'?internalFiles.length||remoteFiles.length||toolNames.length:capabilitySourcePresent;
    nodes.push({id:'layer:'+id,label,kind:'LAYER',group:'ARCHITECTURE',status:count?'DECLARED':hasSource?'NO_DECLARATIONS':'MISSING_SOURCE'});addLink('mcp:nexo','layer:'+id,'OWNS');
  }
  for(const [transport,files] of [['internal',internalFiles],['remote',remoteFiles]]){
    const paths=unique([...files.map(([path])=>path),...toolNames.flatMap(name=>declarations.get(name).filter(row=>row.transport===transport).map(row=>row.path))]);
    nodes.push({id:'transport:'+transport,label:transport==='internal'?'Internal MCP':'Remote MCP',kind:'TRANSPORT',group:'MCP',status:paths.length?'SOURCE_PRESENT':'MISSING_SOURCE',summary:paths.length?'Source declarations only; live availability unverified.':'Transport source was not carried in this Tower generation.',meta:{availability:'UNKNOWN',source_paths:paths}});
    addLink('mcp:nexo','transport:'+transport,'DESCRIBES');
  }
  for(const name of toolNames){
    const evidence=declarations.get(name).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const transports=unique(evidence.map(row=>row.transport));
    nodes.push({id:'tool:'+name,label:name,kind:'TOOL',group:'TOOLS',status:'DECLARED',summary:'Declared in carried Tower source; callable availability unverified.',meta:{remote:transports.includes('remote'),internal:transports.includes('internal'),transports,availability:'UNKNOWN',evidence}});
    addLink('layer:tools','tool:'+name,'CONTAINS',.74);
    for(const transport of transports.filter(value=>value!=='unknown'))addLink('transport:'+transport,'tool:'+name,'DECLARES',.92);
  }
  for(const family of families){nodes.push({id:'family:'+family,label:family,kind:'FAMILY',group:'CAPABILITIES',status:'DERIVED'});addLink('layer:capabilities','family:'+family,'GROUPS',.7);}
  for(const backend of backends){nodes.push({id:'backend:'+backend,label:backend,kind:'BACKEND',group:'RUNTIME',status:'DECLARED',meta:{availability:'UNKNOWN'}});addLink('layer:backends','backend:'+backend,'CONTAINS',.72);}
  for(const role of roles){nodes.push({id:'role:'+role,label:role,kind:'ROLE',group:'GOVERNANCE',status:'DECLARED'});addLink('layer:roles','role:'+role,'CONTAINS',.72);}
  for(const capability of capabilities){
    const id='cap:'+capability.id;
    nodes.push({id,label:capability.id,kind:'CAPABILITY',group:'CAPABILITIES',status:capability.status,summary:[capability.scope,capability.backend].filter(Boolean).join(' · '),meta:{...capability,backend_source:capability.backend?'DECLARED':'MISSING_SOURCE'}});
    addLink('family:'+familyOf(capability.id),id,'CONTAINS',.78);
    if(capability.backend)addLink(id,'backend:'+capability.backend,'RUNS_ON',.64);
    for(const role of capability.roles)addLink(id,'role:'+role,'AVAILABLE_TO',.42);
  }
  nodes.sort((a,b)=>a.id.localeCompare(b.id));links.sort((a,b)=>a.id.localeCompare(b.id));
  const manifestPaths=unique([...array(records.coverage?.capabilities?.paths),...capabilities.map(row=>row._source_path),...carriedText(records,'capabilities.json').map(([path])=>path)]);
  const internalKnown=internalFiles.length>0||toolNames.some(name=>declarations.get(name).some(row=>row.transport==='internal'));
  const remoteKnown=remoteFiles.length>0||toolNames.some(name=>declarations.get(name).some(row=>row.transport==='remote'));
  const topology={
    contract:'NEXO_MCP_TOPOLOGY_V1',access:'PRIVATE',generated_at:generatedAt,tower_revision:revision,
    provenance:source,
    source:{...source,commit:revision,tower_revision:revision,source_state_fingerprint:revision,manifest:manifestPaths[0]||null,manifest_paths:manifestPaths,mcp_server:internalFiles[0]?.[0]||null,remote_mcp:remoteFiles[0]?.[0]||null,
      source_status:{capabilities:capabilitySourcePresent?'SOURCE_PRESENT':'MISSING_SOURCE',mcp_server:internalFiles.length?'SOURCE_PRESENT':'MISSING_SOURCE',remote_mcp:remoteFiles.length?'SOURCE_PRESENT':'MISSING_SOURCE'}},
    stats:{nodes:nodes.length,links:links.length,tools:internalKnown||remoteKnown||toolNames.length?toolNames.length:null,
      remote_tools:remoteKnown?toolNames.filter(name=>declarations.get(name).some(row=>row.transport==='remote')).length:null,
      internal_tools:internalKnown?toolNames.filter(name=>declarations.get(name).some(row=>row.transport==='internal')).length:null,
      unassigned_tools:toolNames.filter(name=>declarations.get(name).every(row=>row.transport==='unknown')).length,
      capabilities:capabilitySourcePresent?capabilities.length:null,backends:capabilitySourcePresent?backends.length:null,roles:capabilitySourcePresent?roles.length:null,families:capabilitySourcePresent?families.length:null,
      status_counts:countBy(capabilities,row=>row.status),backend_counts:countBy(capabilities,row=>row.backend),capabilities_without_backend:capabilities.filter(row=>!row.backend).length},nodes,links,
  };
  return {...topology,fingerprint:digest(topology)};
}

function humanReason(item){
  const state=upper(item.operational_status||item.status||item.state),gate=object(item.human_gate)?item.human_gate:{};
  if(item.human_gate===false||['DONE','COMPLETE','COMPLETED','CLOSED','CANCELLED','ARCHIVED','RETIRED','SUPERSEDED','VERIFIED','APPLIED','NO_OP_ALREADY_APPLIED'].includes(state)||['RESOLVED','APPROVED','SATISFIED','CLOSED'].includes(upper(gate.state)))return null;
  if(upper(item.dependency_class)==='HUMAN_AUTH_REQUIRED')return 'HUMAN_AUTH_REQUIRED';
  const dependencies=array(item.remaining_dependencies||item.dependencies).filter(row=>!['SATISFIED','RESOLVED','DONE','CLOSED'].includes(upper(row?.status||row?.state)));
  const classes=[...array(item.dependency_classes),item.dependency_class,...dependencies.map(row=>row?.dependency_class)];
  const dependency=classes.find(value=>/^HUMAN_/.test(upper(value)));if(dependency)return dependency;
  for(const field of ['requires_human','needs_human','human_action_required','manual_review','approval_required','decision_required','human_gate'])if(item[field]===true)return field.toUpperCase();
  if(Object.keys(gate).length&&gate.required!==false)return 'HUMAN_GATE';
  return ['NEEDS_YOU','AWAITING_HUMAN','WAIT_HUMAN','WAITING_HUMAN','NEEDS_HUMAN'].includes(state)?'EXPLICIT_HUMAN_STATUS':null;
}

function evolutionGates(records,system){
  const raw=system?.evolution?.gate||system?.evolution_partial?.gate||records.evolution?.gate?.gate||records.evolution?.gate||records.snapshot?.evolution?.gate||{};
  return ['charters_waiting','canaries_waiting'].flatMap(collection=>array(raw[collection]).map(value=>({collection,item:object(value)?value:{id:text(value)}})));
}

function entityGroup(entity,item){
  const semantic=object(item.semantic)?item.semantic:{};
  const subdomain=text(item.subdomain_id||item.subdomain)||(semantic.basis!=='UNMAPPED'&&semantic.subdomain_id!=='UNMAPPED'?text(semantic.subdomain_id):'');
  const group=subdomain?['subdomain',subdomain,'tower_subdomain',true]:text(item.campaign_id)?['campaign',item.campaign_id,'campaign_id',false]:text(item.test_group_id)?['test-group',item.test_group_id,'test_group_id',false]:entity.kind==='CAPABILITY'?['capability-family',familyOf(entity.canonical_id),'capability_family',false]:['kind',entity.kind,'entity_kind',false];
  return {id:'cluster:'+JSON.stringify([entity.visual_domain,group[0],group[1]]),label:group[1],basis:group[2],canonical:group[3],domain:entity.visual_domain,subdomain:subdomain||null,members:[]};
}

function compileGalaxy(records,system,revision,generatedAt,sourceRef){
  const source=provenance(revision,sourceRef),entities=[],rawById=new Map(),clusters=new Map();
  const add=(collection,kind,id,item)=>{
    if(!text(id))fail(`Missing identity for ${collection} record`);
    const domain=text(item.domain||item.lane||item.semantic?.domain_id)||null,visualDomain=domain||'NEXO';
    const entity={
      ...structuredClone(item),id:kind.toLowerCase()+':'+id,canonical_id:id,kind,domain,visual_domain:visualDomain,
      title:text(item.title||item.name||item.display_name)||id,
      status:text(item.status||item.operational_status||item.state)||null,
      scientific_state:text(item.scientific_state)||(kind==='TEST'?'UNKNOWN':null),
      attempt_state:text(item.attempt_state||item.execution_phase)||null,review_state:text(item.review_state)||null,
      campaign_id:text(item.campaign_id)||null,test_group_id:text(item.test_group_id)||null,
      plain:text(item.semantic?.question_plain||item.question||item.statement||item.semantic?.why_it_matters)||null,
      meaning:text(item.semantic?.result_meaning||item.result_summary)||null,
      importance:PRIORITY[upper(item.priority)]??.5,priority:text(item.priority)||null,
      source:{...source,collection,canonical_id:id,path:text(item._source_path)||null,source_domain:domain,derivation:domain?'direct_domain':'unassigned_layout'},relation_refs:[],
      observation:{access:'PRIVATE',source_revision:revision,projection_fingerprint:revision,observed_at:generatedAt,scientific_state:text(item.scientific_state)||'UNKNOWN',attempt_state:text(item.attempt_state||item.execution_phase)||null,review_state:text(item.review_state)||null,decision_required:!!humanReason(item)},
    };
    if(rawById.has(entity.id))fail(`Duplicate entity id ${entity.id}`);
    const group=entityGroup(entity,item);
    entity.cluster_id=group.id;entity.subdomain=group.subdomain;
    entity.visual_hints={class:kind.toLowerCase(),cluster_basis:group.basis,lod:entity.importance>=.8?'MEDIUM':'LOCAL'};
    if(!clusters.has(group.id))clusters.set(group.id,group);
    clusters.get(group.id).members.push(entity.id);entities.push(entity);rawById.set(entity.id,item);
  };
  for(const [collection,kind,idField] of COLLECTIONS)for(const item of array(records[collection])){
    if(!object(item))fail(`Invalid ${collection} record`);
    add(collection,kind,text(item[idField]||(kind==='TEST'?item.test_record_id:null)||item.id||item.entity_id||item._source_path),item);
  }
  for(const [id,item] of Object.entries(records.capabilities))add('capabilities','CAPABILITY',id,object(item)?item:{});
  entities.sort((a,b)=>a.id.localeCompare(b.id));
  const entityById=new Map(entities.map(entity=>[entity.id,entity]));
  const canonicalIds=new Map();for(const entity of entities){const ids=canonicalIds.get(entity.canonical_id)||[];ids.push(entity.id);canonicalIds.set(entity.canonical_id,ids);}
  const resolve=value=>{
    if(entityById.has(value))return value;
    if(text(value).startsWith('action:')&&entityById.has('work:'+value.slice(7)))return 'work:'+value.slice(7);
    const ids=canonicalIds.get(value);return ids?.length===1?ids[0]:null;
  };
  const relations=[],relationIds=new Set();
  const addRelation=relation=>{if(!relationIds.has(relation.id)){relationIds.add(relation.id);relations.push(relation);}};
  const groups=[...clusters.values()].sort((a,b)=>a.id.localeCompare(b.id));
  const interdomain=array(records.interdomain),gates=evolutionGates(records,system);
  const domainNames=unique(['NEXO',...entities.map(entity=>entity.visual_domain),...interdomain.flatMap(row=>[...array(row.source_domains),...array(row.target_domains)]),...gates.map(({item})=>item.domain)]);
  const knownNode=id=>entityById.has(id)||domainNames.some(domain=>'domain:'+domain===id);
  for(const edge of array(system?.graph?.edges)){
    const from=resolve(edge.from)||(knownNode(edge.from)?edge.from:null),to=resolve(edge.to)||(knownNode(edge.to)?edge.to:null);
    if(!from||!to)continue;
    addRelation({...structuredClone(edge),id:text(edge.id)||'relation:'+JSON.stringify([from,to,edge.kind]),from,to,kind:text(edge.kind)||'RELATED',semantic:edge.derived!==true,derived:edge.derived===true,source:{...source,derivation:'private_system_graph'}});
  }
  for(const row of interdomain){
    const id=text(row.id||row._source_path);if(!id)fail('Missing interdomain record identity');
    for(const from of unique(array(row.source_domains)))for(const to of unique(array(row.target_domains))){
      addRelation({id:'relation:interdomain:'+JSON.stringify([id,from,to]),from:'domain:'+from,to:'domain:'+to,kind:text(row.relation_type)||'INTERDOMAIN',status:text(row.status)||null,summary:text(row.mapping||row.prediction_or_utility)||id,semantic:true,derived:false,source:{...source,collection:'interdomain',canonical_id:id,path:text(row._source_path)||null},record:structuredClone(row)});
    }
  }
  const referenceFields=[['campaign_id','CAMPAIGN'],['roadmap_id','ROADMAP'],['hypothesis_id','HYPOTHESIS'],['test_id','TEST'],['capability_id','CAPABILITY'],['test_ids','TEST'],['hypothesis_ids','HYPOTHESIS'],['work_ids','WORK']];
  for(const entity of entities)for(const [field,kind] of referenceFields){
    for(const value of [].concat(rawById.get(entity.id)[field]||[])){
      const target=kind.toLowerCase()+':'+value;if(!entityById.has(target)||target===entity.id)continue;
      addRelation({id:'relation:record:'+JSON.stringify([entity.id,field,target]),from:entity.id,to:target,kind:'REFERENCES',semantic:true,derived:false,source:{...entity.source,field},summary:`Explicit ${field} reference.`});
    }
  }
  const counts=Object.fromEntries(domainNames.map(domain=>[domain,{entities:entities.filter(entity=>entity.visual_domain===domain).length,subdomains:groups.filter(group=>group.domain===domain).length}]));
  const bridgeMap=new Map();
  const domainOf=id=>entityById.get(id)?.visual_domain||(id.startsWith('domain:')?id.slice(7):null);
  for(const relation of relations.filter(row=>row.semantic)){
    const from=domainOf(relation.from),to=domainOf(relation.to);if(!from||!to||from===to)continue;
    const key=JSON.stringify([from,to]);bridgeMap.set(key,(bridgeMap.get(key)||0)+1);
  }
  const bridges=[...bridgeMap].sort(([a],[b])=>a.localeCompare(b)).map(([key,count])=>{const [from,to]=JSON.parse(key);return {from,to,count};});
  const morph=morphologyFrom({counts,core:counts.NEXO?.entities||0,bridges});
  for(const domain of domainNames){
    const domainGroups=groups.filter(group=>group.domain===domain);
    domainGroups.forEach((group,index)=>{
      const t=(index+.5)/domainGroups.length;
      const angle=(index/domainGroups.length)*Math.PI*2+fraction(group.id,'ring')*.4;
      const radius=morph.bulge.radius*(.9+.5*fraction(group.id,'ring-r'));
      const position=domain==='NEXO'?{x:Math.cos(angle)*radius,y:Math.sin(angle)*radius}:armPoint(morph,domain,t);
      group.layout={x:round(position.x),y:round(position.y),z:0,sector:domain,lod:'MEDIUM'};
      for(const id of group.members){
        const entity=entityById.get(id);let x,y,z;
        if(domain==='NEXO'){
          const r=Math.abs(gaussian(id,'bulge-r'))*morph.bulge.radius*2,a=fraction(id,'bulge-a')*Math.PI*2,strength=morph.bulge.bar_strength;
          x=Math.cos(a)*r*(1+.9*strength);y=Math.sin(a)*r*(1-.3*strength);z=gaussian(id,'bulge-z')*6;
        }else{
          const along=Math.max(0,t+(fraction(id,'dust-along')-.5)*1.1/domainGroups.length),frame=armFrame(morph,domain,along);
          const across=gaussian(id,'dust-across')*(morph.arms[domain]?.width||10)*(1+along*.8)*.45;
          x=frame.x+frame.nx*across;y=frame.y+frame.ny*across;z=gaussian(id,'dust-z')*4;
        }
        entity.layout={x:round(x),y:round(y),z:round(z),cluster_id:group.id,lod:entity.visual_hints.lod,importance:entity.importance};
        if(![x,y,z].every(Number.isFinite))fail('Non-finite private galaxy layout');
      }
    });
  }
  for(const group of groups){
    addRelation({id:'relation:domain:'+group.id,kind:'CONTAINS',from:'domain:'+group.domain,to:group.id,semantic:false,derived:true,source:null});
    for(const id of group.members)addRelation({id:'relation:cluster:'+JSON.stringify([group.id,id]),kind:'CONTAINS',from:group.id,to:id,semantic:false,derived:true,source:null});
  }
  relations.sort((a,b)=>a.id.localeCompare(b.id));
  for(const relation of relations){if(entityById.has(relation.from))entityById.get(relation.from).relation_refs.push(relation.id);if(entityById.has(relation.to))entityById.get(relation.to).relation_refs.push(relation.id);}
  const needsYou=new Map();
  for(const entity of entities){const reason=humanReason(rawById.get(entity.id));if(reason)needsYou.set(entity.id,{entity:entity.id,reason,status:entity.status,importance:entity.importance});}
  for(const gate of array(system?.inbox)){
    const entity=resolve(gate.entity_id)||resolve(gate.action_id);if(entity&&!needsYou.has(entity))needsYou.set(entity,{entity,reason:'EXPLICIT_SYSTEM_INBOX',status:entityById.get(entity).status,importance:entityById.get(entity).importance,source_id:gate.id});
  }
  for(const {collection,item} of gates){
    const canonicalId=text(item.roadmap_id||item.gene||item.id),entity=resolve(canonicalId),id='gate:'+JSON.stringify([collection,canonicalId||digest(item)]);
    if(entity&&needsYou.has(entity))continue;
    needsYou.set(entity||id,{id,entity:entity||null,canonical_id:canonicalId||null,reason:'HUMAN_GATE',status:text(item.status||item.state)||null,importance:1,domain:text(item.domain)||entityById.get(entity)?.visual_domain||null,title:text(item.question||item.title)||canonicalId||collection,source:{...source,collection:'evolution.gate.'+collection}});
  }
  const needs_you=[...needsYou.values()].sort((a,b)=>b.importance-a.importance||text(a.entity||a.id).localeCompare(text(b.entity||b.id)));
  for(const item of needs_you)if(item.entity)entityById.get(item.entity).observation.decision_required=true;
  const events=needs_you.map(item=>{
    const entity=entityById.get(item.entity),kind=item.importance>=.9||/HUMAN|AUTH/.test(item.reason)?'SUPERNOVA':'NOVA';
    const domain=entity?.visual_domain||item.domain||'NEXO',position=entity?.layout||armPoint(morph,domain,.22);
    return {id:kind.toLowerCase()+':'+(item.entity||item.id),kind,domain,entity:entity?.id||null,label:entity?.title||item.title,reason:item.reason,x:round(position.x),y:round(position.y),z:round(position.z||0),intensity:kind==='SUPERNOVA'?1:.6};
  });
  // Running task status alone is not a scientific execution attempt.
  for(const domain of domainNames){
    const tests=entities.filter(entity=>entity.visual_domain===domain&&entity.kind==='TEST'&&['RUNNING','IN_PROGRESS','EXECUTING'].includes(upper(entity.attempt_state)));
    if(tests.length){const point=domain==='NEXO'?{x:0,y:0}:armPoint(morph,domain,.08);events.push({id:'agn:'+domain,kind:'AGN',domain,label:`${tests.length} testes em andamento`,x:round(point.x),y:round(point.y),z:0,intensity:round(1-Math.exp(-tests.length/10))});}
  }
  const subdomains=groups.map(group=>({id:group.id,kind:'SUBDOMAIN',title:group.label,domain:group.domain,canonical:group.canonical,source_basis:group.basis,entity_count:group.members.length,layout:group.layout}));
  for(const sub of subdomains){const n=entities.filter(entity=>entity.kind==='TEST'&&entity.cluster_id===sub.id&&upper(entity.status)==='READY').length;if(n>=3)events.push({id:'hii:'+sub.id,kind:'HII',domain:sub.domain,label:`${n} testes prontos em ${sub.title}`,x:sub.layout.x,y:sub.layout.y,z:0,intensity:round(1-Math.exp(-n/8))});}
  events.sort((a,b)=>b.intensity-a.intensity||a.id.localeCompare(b.id));
  const domains=domainNames.map(domain=>{const point=domain==='NEXO'?{x:0,y:0}:armPoint(morph,domain,.12);return {id:'domain:'+domain,domain,kind:'DOMAIN',title:domain,canonical:entities.some(entity=>entity.domain===domain),layout:{x:round(point.x),y:round(point.y),z:0,sector:domain==='NEXO'?'CORE':domain,lod:'MACRO'}};});
  const byKind=Object.fromEntries([...COLLECTIONS.map(([,kind])=>kind),'CAPABILITY'].map(kind=>[kind,entities.filter(entity=>entity.kind===kind).length]));
  const snapshot={contract:'NEXO_ONE_GALAXY_V1',access:'PRIVATE',generated_at:generatedAt,tower_revision:revision,provenance:source,
    domains,subdomains,entities,relations,needs_you,events,changes:[],
    morphology:{...morph,metrics:shapeMetrics({entities,crossRelations:relations.filter(row=>row.semantic).length}),metrics_delta:null},
    layout:{model:'DETERMINISTIC_SEMANTIC_GALAXY_V1',core:'NEXO',sectors:domainNames.filter(domain=>domain!=='NEXO'),coordinate_system:'CARTESIAN_2_5D',deterministic:true},
    stats:{domains:domains.length,subdomains:subdomains.length,entities:entities.length,relations:relations.length,needs_you:needs_you.length,events:events.length,changes:0,source_events:array(records.events).length,by_kind:byKind,by_visual_domain:countBy(entities,entity=>entity.visual_domain)},
  };
  const fingerprint=digest(snapshot);
  return {...snapshot,fingerprint,snapshot_id:`galaxy-private-${revision.slice(7,19)}-${fingerprint.slice(7,19)}`};
}

export function compilePrivateTowerViews({records,system,revision,generatedAt,sourceRef}={}){
  if(!object(records)||!object(records.capabilities))fail('Private Tower records/capabilities missing');
  if(typeof revision!=='string'||!/^sha256:[a-f0-9]{64}$/i.test(revision))fail('Private Tower revision must be its state fingerprint');
  if(typeof generatedAt!=='string'||!Number.isFinite(Date.parse(generatedAt)))fail('Private Tower updated_at missing');
  for(const [collection] of COLLECTIONS)if(records[collection]!==undefined&&!Array.isArray(records[collection]))fail(`Invalid ${collection} collection`);
  if(system?.bus?.fingerprint&&system.bus.fingerprint!==revision)fail('Private system generation differs from Tower');
  return {topology:compileTopology(records,revision,generatedAt,sourceRef),galaxy:compileGalaxy(records,system,revision,generatedAt,sourceRef)};
}
