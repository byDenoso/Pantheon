import {fingerprint, subgraph, matches, state} from './model.mjs';

export const DEFAULT_NEON_DATA_API_URL = 'https://ep-cool-lab-aw72uid0.apirest.c-12.us-east-1.aws.neon.tech/neondb/rest/v1';
const CANON='SCIENCE_CANONICAL', DERIVED='DERIVED_NOT_EVIDENCE';
const SYSTEMS=[['SCIENCE','Ciência'],['ENGINEERING','Engineering'],['OLYMPUS','Olympus'],['AUTOMATION','Black Box'],['LEARNING','Learning'],['ARTIFACTS','Arquivos']];

export function createDataApi({env=process.env,fetchImpl,timeoutMs=12000}={}){
 const doFetch=fetchImpl||((...a)=>fetch(...a));
 const base=String(env.NEON_DATA_API_URL||DEFAULT_NEON_DATA_API_URL).replace(/\/+$/,'');
 const token=()=>env.VERCEL_OIDC_TOKEN||'';
 async function select(schema,table,query={}){
  if(!token()) throw Error('VERCEL_OIDC_TOKEN_MISSING');
  const params=new URLSearchParams(Object.entries(query).filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>[k,String(v)]));
  const r=await doFetch(`${base}/${encodeURIComponent(table)}?${params}`,{signal:AbortSignal.timeout(timeoutMs),headers:{Authorization:`Bearer ${token()}`,Accept:'application/json','Accept-Profile':schema}});
  if(!r.ok) throw Error(`NEON_DATA_API_${r.status}`);
  return r.json();
 }
 return {select,get configured(){return !!token()},base};
}

const typeOf=t=>['HYPOTHESIS','DECISION_HYPOTHESIS','CLAIM'].includes(t)?'CLAIM':t;
const relationMap=r=>{
 if(r.relation_type==='PART_OF_CAMPAIGN') return {source:r.to_entity_id,target:r.from_entity_id,type:'CONTAINS'};
 if(r.relation_type==='PRODUCES_RESULT') return {source:r.from_entity_id,target:r.to_entity_id,type:'PRODUCES'};
 return {source:r.from_entity_id,target:r.to_entity_id,type:r.relation_type};
};

export function projectScienceRows({entities=[],displays=[],domains=[],entityDomains=[],relations=[],provenance=[],revisions=[]}={}){
 // entities.updated_at is almost always null in the migrated corpus; the observed date
 // lives on the current revision. imported_at is the cutover stamp, never an activity date.
 const revById=new Map(),revByEntity=new Map();
 for(const r of revisions){if(!r.observed_at)continue;if(r.revision_id)revById.set(r.revision_id,r.observed_at);
  const prev=revByEntity.get(r.entity_id);if(r.is_current||!prev||String(r.observed_at)>String(prev))revByEntity.set(r.entity_id,r.observed_at)}
 const observedAt=e=>revById.get(e.current_revision_id)||revByEntity.get(e.entity_id)||e.updated_at||'';
 const nodes=[],edges=[],display=new Map(displays.map(x=>[x.entity_id,x])),domainById=new Map(domains.map(d=>[d.domain_id,d])),assignments=new Map(),prov=new Map();
 for(const x of entityDomains){if(!assignments.has(x.entity_id))assignments.set(x.entity_id,[]);assignments.get(x.entity_id).push(x)}
 for(const p of provenance){if(!prov.has(p.owner_entity_id))prov.set(p.owner_entity_id,[]);prov.get(p.owner_entity_id).push(p)}
 nodes.push({id:'system:NEXO',type:'SYSTEM',label:'NEXO',summary:'Unified Cognitive Infrastructure · projeção read-only do Neon.',authority:DERIVED,status:'active'});
 for(const [id,label] of SYSTEMS){nodes.push({id:`system:${id}`,type:'SYSTEM',label,authority:DERIVED,status:'active'});edges.push({id:`system:NEXO:CONTAINS:system:${id}`,source:'system:NEXO',target:`system:${id}`,type:'CONTAINS',authority:DERIVED})}
 for(const d of domains){const code=d.code||d.domain_id;nodes.push({id:`domain:${code}`,type:'DOMAIN',label:d.name||code,domain:code,summary:d.description||'',status:d.status||'',authority:DERIVED,metadata:{kind:d.kind,domain_id:d.domain_id}});edges.push({id:`system:SCIENCE:CONTAINS:domain:${code}`,source:'system:SCIENCE',target:`domain:${code}`,type:'CONTAINS',authority:DERIVED})}
 for(const e of entities){const a=assignments.get(e.entity_id)||[],allCodes=[...new Set(a.map(x=>domainById.get(x.domain_id)?.code||x.domain_id).filter(Boolean))],primary=a.find(x=>x.role==='PRIMARY')||a[0],domain=primary?(domainById.get(primary.domain_id)?.code||primary.domain_id):'',d=display.get(e.entity_id),refs=(prov.get(e.entity_id)||[]).map(p=>({source:p.source_kind,sourceId:p.source_id,sourceRef:p.source_location||p.source_id,url:/^https:\/\//.test(p.source_location||'')?p.source_location:undefined,observedAt:p.observed_at}));
  nodes.push({id:e.entity_id,canonicalId:e.entity_id,type:typeOf(e.entity_type),subtype:typeOf(e.entity_type)==='CLAIM'?e.entity_type:undefined,label:d?.display_label||e.title||e.entity_id,displaySource:d?.display_label?(d.is_curated?'CURATED':'ENTITY_DISPLAY'):'CANONICAL_TITLE',canonicalTitle:e.title||'',summary:e.summary||'',status:e.status||'',domain,domains:allCodes,authority:CANON,updatedAt:observedAt(e),sourceRefs:refs,metadata:{entity_type:e.entity_type,source_surface:e.source_surface,source_row_key:e.source_row_key,legacy_domain_raw:e.legacy_domain_raw,legacy_lane_raw:e.legacy_lane_raw,imported_at:e.imported_at||'',current_revision_id:e.current_revision_id||''}});
  if(domain)edges.push({id:`domain:${domain}:CONTAINS:${e.entity_id}`,source:`domain:${domain}`,target:e.entity_id,type:'CONTAINS',authority:DERIVED});
 }
 const ids=new Set(nodes.map(n=>n.id));
 for(const r of relations){const m=relationMap(r);if(!ids.has(m.source)||!ids.has(m.target))continue;edges.push({id:r.relation_id||`${m.source}:${m.type}:${m.target}`,source:m.source,target:m.target,type:m.type,authority:CANON,status:r.status||'',evidenceClass:r.evidence_class||'',sourceRefs:r.source_ref?[{source:r.source_surface,sourceRef:r.source_ref}]:[]})}
 // Newest observation the source itself recorded, not the moment we imported it.
 const sourceVersion=entities.reduce((m,e)=>{const v=String(observedAt(e)||'');return v>m?v:m},'')||entities.reduce((m,e)=>{const v=String(e.imported_at||'');return v>m?v:m},'');
 const graph={nodes,edges,issues:[]};graph.fingerprint=fingerprint(graph);graph.sourceVersion=sourceVersion;return graph;
}

const ladderStage=(id,label,items)=>({id,label,source:`learning_v1.${id.toLowerCase()}s`,count:items.length,available:items.length>0,items});
const obsItem=o=>({id:`observation:${o.observation_id}`,stage:'OBSERVATION',relationType:o.event_type||o.summary,status:o.outcome||'OBSERVED',notes:o.summary||'',domainA:o.domain||'',evidenceRefs:JSON.stringify(o.evidence_json||{})});
const patItem=p=>({id:`pattern:${p.pattern_id}`,stage:'PATTERN',relationType:p.title,status:p.status||'',notes:p.description||'',evidenceCount:Number(p.supporting_count)||0,contradictionCount:Number(p.contradicting_count)||0,confidence:p.confidence_score==null?null:Number(p.confidence_score)});
const lessonItem=l=>({id:`lesson:${l.lesson_id}`,stage:'LESSON',relationType:l.title,status:l.status||'',notes:l.statement||'',derivedFrom:l.source_pattern_id?[`pattern:${l.source_pattern_id}`]:[]});
const strategyItem=s=>({id:`strategy:${s.strategy_id}`,stage:'STRATEGY',relationType:s.title,status:s.status||'',notes:s.description||'',derivedFrom:s.source_lesson_id?[`lesson:${s.source_lesson_id}`]:[]});
const policyItem=p=>({id:`policy:${p.policy_id}`,stage:'POLICY',relationType:p.title,status:p.status||'',notes:p.statement||'',derivedFrom:p.source_strategy_id?[`strategy:${p.source_strategy_id}`]:[]});

export function learningPayload({observations=[],patterns=[],lessons=[],strategies=[],policies=[],links=[]}={}){
 const stages=[observations.map(obsItem),patterns.map(patItem),lessons.map(lessonItem),strategies.map(strategyItem),policies.map(policyItem)],all=stages.flat(),byId=new Map(all.map(x=>[x.id,x]));
 for(const l of links){const from=`${String(l.from_kind).toLowerCase()}:${l.from_id}`,to=`${String(l.to_kind).toLowerCase()}:${l.to_id}`;if(byId.has(to)&&byId.has(from)){const x=byId.get(to);x.derivedFrom=[...new Set([...(x.derivedFrom||[]),from])]}}
 const bucket=(id,label,basis,test)=>{const items=all.filter(test);return{id,label,basis,items,count:items.length}};
 const emergent=[bucket('new','Novos padrões','status OBSERVED ou CANDIDATE',x=>/OBSERVED|CANDIDATE|EMERGING/i.test(x.status||'')),bucket('strengthening','Fortalecendo','evidência > contradição',x=>(x.evidenceCount||0)>(x.contradictionCount||0)&&(x.evidenceCount||0)>0),bucket('weakening','Enfraquecendo','contradição registrada',x=>(x.contradictionCount||0)>0),bucket('promoted','Promovidos','status VALIDATED ou ACTIVE',x=>/VALIDATED|ACTIVE/i.test(x.status||'')),bucket('contradicted','Contraditos','status DISPROVED',x=>/DISPROVED|ROLLED_BACK/i.test(x.status||'')),bucket('unresolved','Não resolvidos','sem status',x=>!String(x.status||'').trim())];
 return {generatedAt:new Date().toISOString(),source:'v1',total:all.length,ladder:[ladderStage('OBSERVATION','Observação',stages[0]),ladderStage('PATTERN','Padrão',stages[1]),ladderStage('LESSON','Lição',stages[2]),ladderStage('STRATEGY','Estratégia',stages[3]),ladderStage('POLICY','Política',stages[4])],emergent,crossDomain:0,unresolvedEvidence:[],_all:all};
}

const sev=s=>s==='BLOCKER'?'ERROR':s==='WARN'?'WARN':'INFO';
const issueCategory=t=>({UNKNOWN_DOMAIN:'UNRESOLVED_DOMAIN',UNRESOLVED_DOMAIN:'UNRESOLVED_DOMAIN',LEGACY_ALIAS:'LEGACY_REFERENCE',AMBIGUOUS_MAPPING:'AMBIGUOUS_MAPPING',BROKEN_REFERENCE:'BROKEN_REFERENCE',MISSING_PARENT:'BROKEN_REFERENCE',UNRESOLVED_RESULT_OWNER:'RESULT_SUBJECT',RESULT_SUBJECT_ISSUE:'RESULT_SUBJECT',MISSING_PROVENANCE:'MISSING_PROVENANCE',SUPERSEDED_REFERENCE:'SUPERSEDED_REF'}[t]||t||'OTHER');
const isOpen=i=>!/RESOLVED|CLOSED|ACCEPTED/i.test(String(i.status||''));
export function auditPayload(issues=[]){
 const groups=new Map();
 for(const i of issues){const id=issueCategory(i.issue_type);if(!groups.has(id))groups.set(id,[]);
  groups.get(id).push({id:i.issue_id,label:i.source_key||i.entity_id||i.issue_id,type:'MIGRATION_ISSUE',domain:'',
   status:i.status||'',open:isOpen(i),authority:'',severity:sev(i.severity),issueType:id,source:'v1',
   resolution:i.proposed_resolution||'',detail:i.detail||'',missing:i.raw_value||''})}
 const categories=[...groups].map(([id,items])=>{
  const open=items.filter(x=>x.open);
  return {id,label:id.replaceAll('_',' '),
   // Severity reflects only what is still open. A resolved BLOCKER is history, so a
   // category with nothing open raises no alarm even though its count stays visible.
   severity:open.some(x=>x.severity==='ERROR')?'ERROR':open.some(x=>x.severity==='WARN')?'WARN':'INFO',
   // Left empty on purpose: the declared taxonomy supplies the human explanation.
   detail:'',count:items.length,openCount:open.length,
   // Anything still open is shown first.
   items:[...open,...items.filter(x=>!x.open)].slice(0,24)}});
 const open=issues.filter(isOpen).length;
 return{generatedAt:new Date().toISOString(),source:'v1',total:issues.length,open,resolved:issues.length-open,categories}}

function summary(g,q={}){const nodes=g.nodes.filter(n=>matches(n,q)),count=fn=>nodes.reduce((a,n)=>{const k=fn(n);if(k)a[k]=(a[k]||0)+1;return a},{}),activity={};for(const n of nodes.filter(n=>['TEST','RESULT','CLAIM'].includes(n.type))){const d=String(n.updatedAt||'').match(/^\d{4}-\d{2}-\d{2}/)?.[0];if(d)activity[d]=(activity[d]||0)+1}return{counts:count(n=>n.type),statuses:count(n=>n.type==='TEST'?state(n.status):''),domains:count(n=>n.type==='TEST'?n.domain:''),activity,claims:count(n=>n.type==='CLAIM'?state(n.status):''),claimKinds:count(n=>n.type==='CLAIM'?n.subtype:''),total:nodes.length,sources:{neon:{status:'READ_OK',observedAt:g.sourceVersion}},projection:{fingerprint:g.fingerprint,sourceVersion:g.sourceVersion,unresolvedRelations:0,unresolvedDomain:nodes.filter(n=>n.type==='TEST'&&!n.domain).length,source:'v1',freshness:'LIVE'}}}

export function createNeonV1Reader({env=process.env,fetchImpl,ttlMs=60000}={}){
 const api=createDataApi({env,fetchImpl});let scienceCache=null,learningCache=null,health={ok:false,checkedAt:0,detail:'NOT_CHECKED'};
 async function loadScience(force=false){if(!force&&scienceCache&&Date.now()-scienceCache.at<ttlMs)return scienceCache;const [entities,displays,domains,entityDomains,relations,provenance,issues,revisions]=await Promise.all([api.select('science_v1','entities',{select:'*',limit:10000}),api.select('science_v1','entity_display',{select:'*',limit:10000}),api.select('science_v1','domains',{select:'*',limit:1000}),api.select('science_v1','entity_domains',{select:'*',limit:10000}),api.select('science_v1','relations',{select:'*',limit:10000}),api.select('science_v1','provenance',{select:'owner_entity_id,source_kind,source_id,source_location,authority,observed_at',limit:10000}),api.select('science_v1','migration_issues',{select:'*',limit:10000}),api.select('science_v1','revisions',{select:'revision_id,entity_id,observed_at,is_current',limit:20000}).catch(()=>[])]);scienceCache={at:Date.now(),graph:projectScienceRows({entities,displays,domains,entityDomains,relations,provenance,revisions}),issues};return scienceCache}
 async function loadLearning(force=false){if(!force&&learningCache&&Date.now()-learningCache.at<ttlMs)return learningCache;const [observations,patterns,lessons,strategies,policies,links]=await Promise.all(['observations','patterns','lessons','strategies','policies','links'].map(t=>api.select('learning_v1',t,{select:'*',limit:10000})));learningCache={at:Date.now(),payload:learningPayload({observations,patterns,lessons,strategies,policies,links})};return learningCache}
 async function checkHealth({force=false}={}){if(!api.configured){health={ok:false,checkedAt:Date.now(),detail:'OIDC_NOT_AVAILABLE'};return health}if(!force&&Date.now()-health.checkedAt<30000)return health;try{const x=await api.select('science_v1','entities',{select:'entity_id',limit:1});health={ok:Array.isArray(x),checkedAt:Date.now(),detail:'OK',version:'science_v1'}}catch(e){health={ok:false,checkedAt:Date.now(),detail:String(e.message||e)}}return health}
 async function graph(q={}){const {graph:g}=await loadScience(),v=subgraph(g,q);return{...v,fingerprint:g.fingerprint,sourceVersion:g.sourceVersion,source:'v1',freshness:'LIVE',cache:'HIT',issues:g.issues||[]}}
 async function entity(q={}){const {graph:g}=await loadScience();if(q.view==='lineage')return graph({focus:q.id,mode:'lineage',depth:3,limit:250});if(q.view==='files'){const linked=new Set(g.edges.filter(e=>e.source===q.id||e.target===q.id).flatMap(e=>[e.source,e.target]));return g.nodes.filter(n=>linked.has(n.id)&&['FILE','ARTIFACT','DATASET','PUBLICATION'].includes(n.type)&&n.id!==q.id).slice(0,100)}const n=g.nodes.find(n=>n.id===q.id);if(!n)return{error:'ENTITY_NOT_FOUND'};const rel=g.edges.filter(e=>e.source===q.id||e.target===q.id);return{entity:n,relations:rel.slice(0,200),relationCount:rel.length,source:'v1'}}
 async function learning(q={}){const {payload}=await loadLearning();if(!q.id){const {_all,...p}=payload;return p}const all=payload._all||[];if(q.view==='lineage'){const by=new Map(all.map(x=>[x.id,x])),node=by.get(q.id);if(!node)return{id:q.id,available:false,reason:'NOT_FOUND',ancestors:[],descendants:[]};const parents=new Map(all.map(x=>[x.id,x.derivedFrom||[]]));const walk=(id,up)=>{const seen=new Set([id]),out=[],queue=[id];while(queue.length){const cur=queue.shift(),next=up?(parents.get(cur)||[]):all.filter(x=>(parents.get(x.id)||[]).includes(cur)).map(x=>x.id);for(const x of next)if(by.has(x)&&!seen.has(x)){seen.add(x);out.push(by.get(x));queue.push(x)}}return out};const ancestors=walk(q.id,true),descendants=walk(q.id,false);return{id:q.id,node,available:!!(ancestors.length+descendants.length),reason:ancestors.length+descendants.length?'':'NO_DECLARED_LINEAGE',ancestors,descendants}}const bare=String(q.id).replace(/^[a-z_]+:/,'');return{entity:q.id,relations:all.filter(x=>String(x.evidenceRefs||'').includes(bare)),source:'v1'}}
 async function refresh(){const before=scienceCache?.graph?.fingerprint||'',next=await loadScience(true);await loadLearning(true).catch(()=>{});return{outcome:before&&before===next.graph.fingerprint?'NO_CHANGE':'UPDATED',changes:before&&before!==next.graph.fingerprint?1:0,fingerprint:next.graph.fingerprint,completedAt:new Date().toISOString(),sources:{neon:{status:'READ_OK',observedAt:next.graph.sourceVersion}}}}
 return {get configured(){return api.configured},get health(){return health},checkHealth,graph,state:async q=>summary((await loadScience()).graph,q),entity,audit:async()=>auditPayload((await loadScience()).issues),learning,refresh};
}
