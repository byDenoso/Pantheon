import {createHash} from 'node:crypto';
import {armFrame as morphFrame,armPoint as morphPoint,metricsDelta,morphologyFrom,shapeMetrics} from '../../src/viewmodels/galaxy-morphology.mjs';

export const GALAXY_CONTRACT='NEXO_ONE_GALAXY_V1';
export const GALAXY_DOMAINS=['NEXO','SCIENCE','ENGINEERING','OLYMPUS'];

const PRIORITY_WEIGHT={CRITICAL:1,HIGH:.82,NORMAL:.58,MEDIUM:.54,LOW:.34};

function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
const stable=value=>JSON.stringify(canonical(value));
const sha256=value=>'sha256:'+createHash('sha256').update(stable(value)).digest('hex');
const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase();

function fail(message){
  const error=new Error(message);
  error.code='INVALID_GALAXY_SOURCE';
  throw error;
}

function sourceTime(cursor){
  const match=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{6})Z/.exec(text(cursor));
  if(!match)return '1970-01-01T00:00:00.000Z';
  const iso=`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${match[7].slice(0,3)}Z`;
  return Number.isFinite(Date.parse(iso))?iso:'1970-01-01T00:00:00.000Z';
}

function hashFraction(value,salt=''){
  const digest=createHash('sha256').update(`${salt}\0${value}`).digest();
  return digest.readUInt32BE(0)/0xffffffff;
}

export function mapVisualDomain(value){
  const raw=upper(value);
  if(raw==='SCIENCE'||raw==='COSMOLOGY'||raw==='COSMOLOGIA')return 'SCIENCE';
  if(raw==='ENGINEERING'||raw==='AI')return 'ENGINEERING';
  if(raw==='OLYMPUS'||raw==='BODYBUILDING'||raw==='PHYSIQUE')return 'OLYMPUS';
  if(raw==='NEXO')return 'NEXO';
  return null;
}

function explicitSubdomain(item){
  const semantic=item?.semantic;
  if(semantic&&semantic.basis!=='UNMAPPED'&&text(semantic.subdomain_id)&&semantic.subdomain_id!=='UNMAPPED')return text(semantic.subdomain_id);
  const candidate=text(item?.subdomain_id||item?.subdomain);
  return candidate||null;
}

function capabilityFamily(id){
  const parts=text(id).split('.').filter(Boolean);
  if(parts.length>1)return parts.slice(0,-1).join('.');
  const token=text(id).split('_').filter(Boolean)[0];
  return token||'capability';
}

function campaignConsensus(work){
  const map=new Map();
  for(const item of work){
    const campaign=text(item?.campaign_id);
    const mapped=mapVisualDomain(item?.domain);
    if(!campaign||!mapped)continue;
    const set=map.get(campaign)||new Set();
    set.add(mapped);map.set(campaign,set);
  }
  return new Map([...map].map(([campaign,domains])=>[campaign,domains.size===1?[...domains][0]:null]));
}

const SEMANTIC_VISUAL={science:'SCIENCE',engineering:'ENGINEERING',olympus:'OLYMPUS'};
function resolveDomain(item,consensus,{kind}={}){
  const semanticDomain=SEMANTIC_VISUAL[text(item?.semantic?.domain_id)];
  if(semanticDomain)return {domain:semanticDomain,visual_domain:semanticDomain,source_domain:text(item?.domain)||null,derivation:'semantic_taxonomy'};
  const sourceDomain=text(item?.domain)||null;
  const direct=mapVisualDomain(sourceDomain);
  if(direct)return {domain:direct,visual_domain:direct,source_domain:sourceDomain,derivation:sourceDomain&&upper(sourceDomain)!==direct?'domain_alias_mapping':'direct_domain'};
  const campaign=text(item?.campaign_id);
  const inherited=campaign?consensus.get(campaign):null;
  if(inherited)return {domain:null,visual_domain:inherited,source_domain:null,derivation:'campaign_consensus_layout'};
  if(kind==='CAPABILITY')return {domain:null,visual_domain:'NEXO',source_domain:null,derivation:'capability_backbone_layout'};
  return {domain:null,visual_domain:'NEXO',source_domain:null,derivation:'unassigned_layout'};
}

function clusterFor(kind,id,item,resolved){
  const subdomain=explicitSubdomain(item);
  if(subdomain)return {id:`subdomain:${resolved.visual_domain}:${subdomain}`,label:subdomain,basis:'tower_subdomain',canonical:true};
  const campaign=text(item?.campaign_id);
  if(campaign)return {id:`cluster:${resolved.visual_domain}:campaign:${campaign}`,label:campaign,basis:'campaign_id',canonical:false};
  const testGroup=text(item?.test_group_id);
  if(testGroup)return {id:`cluster:${resolved.visual_domain}:test-group:${testGroup}`,label:testGroup,basis:'test_group_id',canonical:false};
  if(kind==='CAPABILITY'){
    const family=capabilityFamily(id);
    return {id:`cluster:NEXO:capability-family:${family}`,label:family,basis:'capability_family',canonical:false};
  }
  return {id:`cluster:${resolved.visual_domain}:${kind.toLowerCase()}`,label:kind,basis:'entity_kind',canonical:false};
}

// Barred spiral whose shape comes from the data (see galaxy-morphology.mjs).
// MORPH is set per compile before any layout runs.
let MORPH=null;
function armPoint(domain,t){return morphPoint(MORPH,domain,t);}
function armFrame(domain,t){return morphFrame(MORPH,domain,t);}
function gaussian(id,salt){
  const u=Math.max(1e-6,hashFraction(id,salt+'u')),v=hashFraction(id,salt+'v');
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}

function entityLayout(entity,indexWithinCluster,totalWithinCluster,clusterLayout){
  let point;
  if(clusterLayout.arm){
    // Dust lane: trail along the arm around the segment, thin across it.
    const span=clusterLayout.arm.span;
    const along=clusterLayout.arm.t+(hashFraction(entity.id,'dust-along')-.5)*span;
    const frame=armFrame(clusterLayout.arm.domain,Math.max(0,along));
    const width=(MORPH.arms[clusterLayout.arm.domain]?.width??10)*(1+along*.8);
    const across=gaussian(entity.id,'dust-across')*width*.45;
    point={x:frame.x+frame.nx*across,y:frame.y+frame.ny*across,z:gaussian(entity.id,'dust-z')*4};
  }else{
    // Bulge and bar: dense core stretched along the bar axis.
    const r=Math.abs(gaussian(entity.id,'bulge-r'))*MORPH.bulge.radius*2;
    const a=hashFraction(entity.id,'bulge-a')*Math.PI*2;
    point={x:Math.cos(a)*r*1.9,y:Math.sin(a)*r*.7,z:gaussian(entity.id,'bulge-z')*6};
  }
  return {
    x:round(point.x),
    y:round(point.y),
    z:round(point.z),
    cluster_id:entity.cluster_id,
    lod:entity.importance>=.8?'MEDIUM':'LOCAL',
    importance:entity.importance,
  };
}

function clusterLayout(cluster,indexWithinDomain,totalWithinDomain){
  const domain=cluster.domain;
  if(domain==='NEXO'){
    // NEXO stations sit on the bar.
    const t=totalWithinDomain<=1?0:(indexWithinDomain/(totalWithinDomain-1))*2-1;
    return {x:round(t*MORPH.bulge.bar*.72),y:round((hashFraction(cluster.id,'bar-y')-.5)*10),z:round((hashFraction(cluster.id,'z')-.5)*6),sector:'NEXO',lod:'MEDIUM'};
  }
  if(!MORPH.arms[domain])return {x:0,y:0,z:0,sector:domain,lod:'MEDIUM'};
  const span=1/Math.max(1,totalWithinDomain);
  const t=span*(indexWithinDomain+.5);
  const p=armPoint(domain,t);
  return {x:round(p.x),y:round(p.y),z:0,sector:domain,lod:'MEDIUM',arm:{domain,t:round(t),span:round(span*1.1)}};
}

function round(value){return Math.round(value*1000)/1000;}
function importanceOf(item){
  const priority=upper(item?.priority);
  if(priority&&PRIORITY_WEIGHT[priority]!==undefined)return PRIORITY_WEIGHT[priority];
  return .5;
}

function titleOf(id,item){return text(item?.title||item?.name)||id;}
function statusOf(item){return text(item?.status||item?.operational_status)||null;}

function humanReason(item){
  if(upper(item?.dependency_class)==='HUMAN_AUTH_REQUIRED')return 'HUMAN_AUTH_REQUIRED';
  const booleans=[
    ['requires_human','REQUIRES_HUMAN'],['human_action_required','HUMAN_ACTION_REQUIRED'],['manual_review','MANUAL_REVIEW'],
    ['approval_required','APPROVAL_REQUIRED'],['decision_required','DECISION_REQUIRED'],['human_gate','HUMAN_GATE'],
  ];
  for(const [field,reason] of booleans)if(item?.[field]===true)return reason;
  if(upper(item?.status)==='NEEDS_YOU'||upper(item?.operational_status)==='NEEDS_YOU')return 'NEEDS_YOU_STATUS';
  return null;
}

function sourceRef(manifest,collection,id,sourceDomain,derivation){
  return {
    authority:'TOWER_V06',
    repository:text(manifest.tower_repository)||'byDenoso/NEXO-Obsidian-Vault',
    revision:text(manifest.tower_commit),
    projection_fingerprint:text(manifest.projection_fingerprint),
    collection,
    canonical_id:id,
    source_domain:sourceDomain,
    derivation,
  };
}

function makeEntity(kind,id,item,collection,consensus,manifest){
  const resolved=resolveDomain(item,consensus,{kind});
  const cluster=clusterFor(kind,id,item,resolved);
  return {
    id:`${kind.toLowerCase()}:${id}`,
    canonical_id:id,
    kind,
    domain:resolved.domain,
    visual_domain:resolved.visual_domain,
    subdomain:explicitSubdomain(item),
    status:statusOf(item),
    title:titleOf(id,item),
    importance:importanceOf(item),
    priority:text(item?.priority)||null,
    cluster_id:cluster.id,
    relation_refs:[],
    visual_hints:{class:kind.toLowerCase(),cluster_basis:cluster.basis,lod:importanceOf(item)>=.8?'MEDIUM':'LOCAL'},
    source:sourceRef(manifest,collection,id,resolved.source_domain,resolved.derivation),
    _cluster:cluster,
    _raw:item,
  };
}

function domainDefinitions(ids=GALAXY_DOMAINS){
  return ids.map(id=>({
    id:`domain:${id}`,
    domain:id,
    kind:'DOMAIN',
    title:id,
    canonical:id!=='NEXO',
    layout:id==='NEXO'?{x:0,y:0,z:0,sector:'CORE',lod:'MACRO'}:{
      x:round(MORPH.arms[id]?armPoint(id,.12).x:0),
      y:round(MORPH.arms[id]?armPoint(id,.12).y:0),
      z:0,sector:id,lod:'MACRO',
    },
  }));
}

function relationsFromInterdomain(interdomain,manifest){
  const out=[];
  for(const item of Array.isArray(interdomain)?interdomain:[]){
    const id=text(item?.id);
    if(!id)continue;
    const sources=(Array.isArray(item.source_domains)?item.source_domains:[]).map(mapVisualDomain).filter(Boolean);
    const targets=(Array.isArray(item.target_domains)?item.target_domains:[]).map(mapVisualDomain).filter(Boolean);
    const from=sources[0]||null,to=targets[0]||null;
    if(!from||!to)continue;
    out.push({
      id:`relation:interdomain:${id}`,
      kind:text(item.relation_type)||'INTERDOMAIN',
      from:`domain:${from}`,
      to:`domain:${to}`,
      semantic:true,
      derived:false,
      status:statusOf(item),
      summary:text(item.mapping||item.prediction_or_utility||item.relation_type)||id,
      source:sourceRef(manifest,'interdomain',id,text(item.source_domains?.[0])||null,'explicit_interdomain_relation'),
    });
  }
  return out;
}

function cleanEntity(entity){
  const {_cluster,_raw,...rest}=entity;
  return rest;
}

function semanticEntity(entity){
  return {
    id:entity.id,kind:entity.kind,domain:entity.domain,visual_domain:entity.visual_domain,subdomain:entity.subdomain,
    status:entity.status,title:entity.title,importance:entity.importance,priority:entity.priority,cluster_id:entity.cluster_id,
    source:{collection:entity.source?.collection,canonical_id:entity.source?.canonical_id,source_domain:entity.source?.source_domain,derivation:entity.source?.derivation},
  };
}

export function deriveChanges(previous,currentCore,timestamp){
  if(!previous||!Array.isArray(previous.entities))return [];
  const before=new Map(previous.entities.map(entity=>[entity.id,entity]));
  const after=new Map(currentCore.entities.map(entity=>[entity.id,entity]));
  const changes=[];
  for(const [id,entity] of after){
    const old=before.get(id);
    if(!old){changes.push({timestamp,entity:id,change_type:'ADDED',summary:`${entity.kind} added`,before:null,after:semanticEntity(entity),importance:entity.importance});continue;}
    const a=semanticEntity(old),b=semanticEntity(entity);
    if(stable(a)!==stable(b))changes.push({timestamp,entity:id,change_type:'UPDATED',summary:`${entity.kind} updated`,before:a,after:b,importance:Math.max(Number(old.importance||0),Number(entity.importance||0))});
  }
  for(const [id,entity] of before)if(!after.has(id))changes.push({timestamp,entity:id,change_type:'REMOVED',summary:`${entity.kind||'ENTITY'} removed`,before:semanticEntity(entity),after:null,importance:Number(entity.importance||.5)});
  return changes.sort((a,b)=>b.importance-a.importance||a.entity.localeCompare(b.entity));
}

export function compileGalaxySnapshot({projection,manifestFile=null,interdomain=[],previousSnapshot=null}={}){
  if(!projection||typeof projection!=='object'||Array.isArray(projection))fail('projection must be an object');
  if(projection.contract!=='NEXO_PUBLIC_PROJECTION_V1')fail('projection contract must be NEXO_PUBLIC_PROJECTION_V1');
  const manifest=projection.manifest;
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))fail('projection manifest missing');
  if(manifestFile&&stable(manifestFile)!==stable(manifest))fail('manifest file differs from projection.manifest');
  if(!Array.isArray(projection.work)||!Array.isArray(projection.tests))fail('work/tests arrays missing');
  if(!projection.capabilities||typeof projection.capabilities!=='object'||Array.isArray(projection.capabilities))fail('capabilities map missing');

  const consensus=campaignConsensus(projection.work);
  const entities=[];
  for(const item of projection.work){
    const id=text(item?.id);if(id)entities.push(makeEntity('WORK',id,item,'work',consensus,manifest));
  }
  for(const item of projection.tests){
    const id=text(item?.id);if(id)entities.push(makeEntity('TEST',id,item,'tests',consensus,manifest));
  }
  for(const [id,value] of Object.entries(projection.capabilities))entities.push(makeEntity('CAPABILITY',id,value||{},'capabilities',consensus,manifest));
  for(const [collection,kind] of [['hypotheses','HYPOTHESIS'],['automations','AUTOMATION'],['results','RESULT'],['entities','OTHER']]){
    for(const item of Array.isArray(projection[collection])?projection[collection]:[]){
      const id=text(item?.id);if(id)entities.push(makeEntity(kind,id,item,collection,consensus,manifest));
    }
  }
  entities.sort((a,b)=>a.id.localeCompare(b.id));
  for(let index=1;index<entities.length;index+=1)if(entities[index-1].id===entities[index].id)fail(`duplicate entity id ${entities[index].id}`);

  const clusterMap=new Map();
  for(const entity of entities){
    const cluster=entity._cluster;
    if(!clusterMap.has(cluster.id))clusterMap.set(cluster.id,{...cluster,domain:entity.visual_domain,members:[]});
    clusterMap.get(cluster.id).members.push(entity.id);
  }
  const clusters=[...clusterMap.values()].sort((a,b)=>a.domain.localeCompare(b.domain)||a.id.localeCompare(b.id));
  const clustersByDomain=new Map();
  for(const cluster of clusters){const group=clustersByDomain.get(cluster.domain)||[];group.push(cluster);clustersByDomain.set(cluster.domain,group);}
  const counts={};
  for(const entity of entities){const c=counts[entity.visual_domain]||(counts[entity.visual_domain]={entities:0,subdomains:0});c.entities+=1;}
  for(const [domain,group] of clustersByDomain){(counts[domain]||(counts[domain]={entities:0,subdomains:0})).subdomains=group.length;}
  const bridgeCounts=new Map();
  for(const item of Array.isArray(interdomain)?interdomain:[]){
    for(const from of [].concat(item?.source_domains||[]))for(const to of [].concat(item?.target_domains||[])){
      const a=mapVisualDomain(from),b=mapVisualDomain(to);if(!a||!b||a===b)continue;
      const key=a+'>'+b;bridgeCounts.set(key,(bridgeCounts.get(key)||0)+1);
    }
  }
  MORPH=morphologyFrom({counts,core:counts.NEXO?.entities||0,bridges:[...bridgeCounts].map(([k,count])=>{const [from,to]=k.split('>');return {from,to,count};})});
  for(const [,group] of clustersByDomain)group.forEach((cluster,index)=>{cluster.layout=clusterLayout(cluster,index,group.length);});
  const clusterById=new Map(clusters.map(cluster=>[cluster.id,cluster]));
  const membersByCluster=new Map();
  for(const entity of entities){const group=membersByCluster.get(entity.cluster_id)||[];group.push(entity);membersByCluster.set(entity.cluster_id,group);}
  for(const group of membersByCluster.values())group.sort((a,b)=>a.id.localeCompare(b.id));
  for(const entity of entities){
    const group=membersByCluster.get(entity.cluster_id);
    entity.layout=entityLayout(entity,group.indexOf(entity),group.length,clusterById.get(entity.cluster_id).layout);
  }
  for(const cluster of clusters)delete cluster.layout.arm;

  const relations=[];
  for(const cluster of clusters){
    relations.push({id:`relation:domain:${cluster.domain}:${cluster.id}`,kind:'CONTAINS',from:`domain:${cluster.domain}`,to:cluster.id,semantic:false,derived:true,status:null,summary:'Presentation hierarchy from Tower-backed grouping.',source:null});
    for(const entityId of cluster.members)relations.push({id:`relation:cluster:${cluster.id}:${entityId}`,kind:'CONTAINS',from:cluster.id,to:entityId,semantic:false,derived:true,status:null,summary:'Presentation hierarchy from Tower-backed grouping.',source:null});
  }
  relations.push(...relationsFromInterdomain(interdomain,manifest));
  relations.sort((a,b)=>a.id.localeCompare(b.id));
  const refs=new Map(entities.map(entity=>[entity.id,[]]));
  for(const relation of relations){
    if(refs.has(relation.from))refs.get(relation.from).push(relation.id);
    if(refs.has(relation.to))refs.get(relation.to).push(relation.id);
  }
  for(const entity of entities)entity.relation_refs=refs.get(entity.id).sort();

  const publicEntities=entities.map(cleanEntity);
  const subdomains=clusters.map(cluster=>({
    id:cluster.id,kind:'SUBDOMAIN',title:cluster.label,domain:cluster.domain,canonical:cluster.canonical,source_basis:cluster.basis,
    entity_count:cluster.members.length,layout:cluster.layout,
  }));
  const domains=domainDefinitions([...new Set([...GALAXY_DOMAINS,...Object.keys(counts)])]);
  const needs_you=entities.map(entity=>({entity,reason:humanReason(entity._raw)})).filter(item=>item.reason).map(({entity,reason})=>({entity:entity.id,reason,status:entity.status,importance:entity.importance})).sort((a,b)=>b.importance-a.importance||a.entity.localeCompare(b.entity));
  const generated_at=text(manifest.generated_at)||sourceTime(manifest.event_cursor||projection.event_cursor);

  const crossRelations=relations.filter(relation=>!relation.derived).length;
  const metrics=shapeMetrics({entities:publicEntities,crossRelations});
  const morphology={...MORPH,metrics,metrics_delta:metricsDelta(metrics,previousSnapshot?.morphology?.metrics)};
  const core={
    domains,subdomains,entities:publicEntities,relations,needs_you,morphology,
    layout:{model:'DETERMINISTIC_SEMANTIC_GALAXY_V1',core:'NEXO',sectors:['SCIENCE','ENGINEERING','OLYMPUS'],coordinate_system:'CARTESIAN_2_5D',deterministic:true},
  };
  const fingerprint=sha256({tower_revision:text(manifest.tower_commit),projection_fingerprint:text(manifest.projection_fingerprint),...core});
  const snapshot_id=`galaxy-${text(manifest.tower_commit).slice(0,12)||'unknown'}-${fingerprint.slice(7,19)}`;
  const changes=deriveChanges(previousSnapshot,{entities:publicEntities},generated_at);
  const byKind=Object.fromEntries(['WORK','TEST','CAPABILITY','HYPOTHESIS','AUTOMATION','RESULT','OTHER'].map(kind=>[kind,publicEntities.filter(entity=>entity.kind===kind).length]));
  const byDomain=Object.fromEntries(GALAXY_DOMAINS.map(domain=>[domain,publicEntities.filter(entity=>entity.visual_domain===domain).length]));

  return {
    contract:GALAXY_CONTRACT,
    snapshot_id,
    generated_at,
    tower_revision:text(manifest.tower_commit),
    fingerprint,
    provenance:{
      authority:'TOWER_V06',
      repository:text(manifest.tower_repository)||'byDenoso/NEXO-Obsidian-Vault',
      source_contract:projection.contract,
      source_fingerprint:text(manifest.projection_fingerprint),
      event_cursor:text(manifest.event_cursor||projection.event_cursor),
      projection_only:manifest.projection_only===true,
      writeback:text(manifest.writeback),
    },
    ...core,
    changes,
    stats:{domains:domains.length,subdomains:subdomains.length,entities:publicEntities.length,relations:relations.length,needs_you:needs_you.length,changes:changes.length,by_kind:byKind,by_visual_domain:byDomain},
  };
}
