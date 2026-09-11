import {createHash} from 'node:crypto';

const CONTRACT='NEXO_ATLAS_SSOT_V1';
const DEFAULT_URL='https://nexo-one-two.vercel.app/api/atlas-ssot';
const TTL=30000;
let cache=null;

const arr=value=>Array.isArray(value)?value:[];
const text=value=>value==null?'':String(value).trim();
const upper=value=>text(value).toUpperCase();
const unique=values=>[...new Set(values.filter(Boolean))];
const numeric=value=>{const n=Number(text(value).replace(',','.'));return Number.isFinite(n)?n:null};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const firstHeader=value=>Array.isArray(value)?value[0]:value;
const splitDomains=value=>unique(text(value).split('|').map(x=>upper(x)).filter(Boolean));
const hiddenStatus=status=>/^(SUPERSEDED|REJECTED|RETIRED|DISPROVED|ROLLED_BACK)$/.test(upper(status));

export function atlasOidcToken(req){return text(firstHeader(req?.headers?.['x-vercel-oidc-token'])||process.env.VERCEL_OIDC_TOKEN||'')}

function validate(snapshot){
 if(snapshot?.contract!==CONTRACT)throw new Error('INVALID_ATLAS_SSOT_CONTRACT');
 if(snapshot?.authority!=='GOOGLE_DRIVE'||snapshot?.projectionOnly!==true)throw new Error('INVALID_ATLAS_SSOT_AUTHORITY');
 if(typeof snapshot?.fingerprint!=='string'||!snapshot.fingerprint.startsWith('sha256:'))throw new Error('INVALID_ATLAS_SSOT_FINGERPRINT');
 for(const tab of ['THREADS','WORK','EVENTS','KNOWLEDGE','DECISIONS','SYSTEM'])if(!Array.isArray(snapshot?.sections?.[tab]))throw new Error(`INVALID_ATLAS_SSOT_SECTION:${tab}`);
 return snapshot;
}

export async function fetchLiveSsot({url=process.env.NEXO_ATLAS_SSOT_URL||DEFAULT_URL,fetcher=fetch,oidcToken='',force=false,signal}={}){
 const endpoint=new URL(url);if(force)endpoint.searchParams.set('refresh','1');
 const headers={Accept:'application/json'};const token=text(oidcToken);
 if(token){headers.Authorization=`Bearer ${token}`;headers['x-vercel-trusted-oidc-idp-token']=token}
 const response=await fetcher(endpoint.toString(),{method:'GET',headers,signal});
 if(!response?.ok)throw new Error(`ATLAS_SSOT_HTTP_${response?.status||0}`);
 return validate(await response.json());
}

export async function loadLiveSsot({req,force=false,fetcher=fetch,signal}={}){
 if(!force&&cache&&Date.now()-cache.at<TTL)return cache.snapshot;
 const snapshot=await fetchLiveSsot({fetcher,oidcToken:atlasOidcToken(req),force,signal});
 cache={at:Date.now(),snapshot};return snapshot;
}
export function liveCacheSnapshot(){return cache?.snapshot||null}

function base(snapshot){return {source:'drive',freshness:'LIVE',sourceVersion:snapshot.sourceModifiedAt||snapshot.generatedAt||'',fingerprint:snapshot.fingerprint,authority:'GOOGLE_DRIVE',projectionOnly:true,sourceRef:`https://docs.google.com/spreadsheets/d/${encodeURIComponent(snapshot.sourceFileId)}/edit`}}
function graph(snapshot,focus,nodes,edges,extra={}){return {...base(snapshot),focus,nodes,edges,total:nodes.length,hasMore:false,truncated:false,depth:1,cache:'LIVE',issues:[],...extra}}
function systemNode(id,label,summary){return {id:`system:${id}`,type:'SYSTEM',label,status:'ACTIVE',summary,metadata:{authority:'GOOGLE_DRIVE'}}}

function rootGraph(snapshot){
 const root={id:'system:NEXO',type:'SYSTEM',label:'NEXO',status:'ACTIVE',summary:'Projeção read-only do NEXO · SSOT CANONICAL no Google Drive.'};
 const children=[systemNode('SCIENCE','Ciência','Pesquisa científica, campanhas, testes e evidências referenciados pelo SSOT.'),systemNode('ENGINEERING','Engenharia','Programas, campanhas, código e runtime publicados pelo SSOT.'),systemNode('OLYMPUS','Olympus','Programas estruturados, check-ins e auditorias publicados pelo SSOT Olympus.')];
 return graph(snapshot,root.id,[root,...children],children.map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',declared:true})));
}
function scienceRows(snapshot){return arr(snapshot.projections?.Science).filter(row=>upper(row.record_type)==='CAMPAIGN')}
function scienceGraph(snapshot){
 const rows=scienceRows(snapshot),domains=unique(rows.map(row=>text(row.domain)).filter(id=>/^D\d+$|^M\d+$/i.test(id))).sort((a,b)=>{const rank=id=>/^D\d+$/i.test(id)?Number(id.slice(1)):1000+Number(id.slice(1));return rank(a)-rank(b)});
 const nodes=[systemNode('SCIENCE','Ciência','Hierarquia científica publicada no Drive')];
 for(const id of domains){const rowsFor=rows.filter(row=>text(row.domain)===id),primary=rowsFor[0]||{};nodes.push({id:`domain:${id}`,domain:id,type:'DOMAIN',label:text(primary.title)||id,status:text(primary.status),summary:text(primary.summary),metadata:{sourceRef:primary.source_ref||null,campaignCount:rowsFor.length}})}
 return graph(snapshot,'system:SCIENCE',nodes,nodes.slice(1).map(node=>({id:`contains:science:${node.id}`,source:'system:SCIENCE',target:node.id,type:'CONTAINS',declared:true})));
}
function payloadParent(row){try{return text(JSON.parse(text(row.payload_json)||'{}')?.parent_id)}catch{return ''}}
function normalizedHierarchyRows(snapshot,key){
 return arr(snapshot.projections?.[key]).map(row=>({type:upper(row.record_type||row.type),id:text(row.record_id||row.id),status:text(row.status),title:text(row.title),summary:text(row.summary||row.detail),parentId:text(row.parent_id)||payloadParent(row),sourceRef:text(row.source_ref||row.source)})).filter(row=>row.id);
}
function hierarchyGraph(snapshot,system,rootId){
 const rows=normalizedHierarchyRows(snapshot,system==='ENGINEERING'?'Engineering':'Olympus');
 const root=rows.find(row=>row.id===rootId),systemId=`system:${system}`;
 const nodes=[systemNode(system,system==='ENGINEERING'?'Engenharia':'Olympus',root?.summary||`Hierarquia ${system} publicada no Drive`)];
 for(const row of rows.filter(row=>row.type==='PROGRAM'&&row.parentId===rootId))nodes.push({id:`domain:${row.id}`,domain:row.id,type:'DOMAIN',label:row.title||row.id,status:row.status,summary:row.summary,metadata:{sourceRef:row.sourceRef||null}});
 return graph(snapshot,systemId,nodes,nodes.slice(1).map(node=>({id:`contains:${systemId}:${node.id}`,source:systemId,target:node.id,type:'CONTAINS',declared:true})));
}
function detailGraph(snapshot,rawFocus){
 const id=text(rawFocus).replace(/^domain:/,'');
 if(/^D\d+$|^M\d+$/i.test(id)){
  const rows=scienceRows(snapshot).filter(row=>text(row.domain)===id),focus=`domain:${id}`,root={id:focus,type:'DOMAIN',domain:id,label:id,status:'ACTIVE'};
  const nodes=[root,...rows.map(row=>({id:text(row.record_id),type:'CAMPAIGN',label:text(row.title)||text(row.record_id),status:text(row.status),summary:text(row.summary),domain:id,metadata:{sourceRef:row.source_ref||null}}))];
  return graph(snapshot,focus,nodes,nodes.slice(1).map(node=>({id:`contains:${focus}:${node.id}`,source:focus,target:node.id,type:'CONTAINS',declared:true})),{depth:2});
 }
 for(const key of ['Engineering','Olympus']){
  const rows=normalizedHierarchyRows(snapshot,key),parent=rows.find(row=>row.id===id);if(!parent)continue;
  const focus=`domain:${id}`,children=rows.filter(row=>row.parentId===id),root={id:focus,type:parent.type==='PROGRAM'?'PROGRAM':'DOMAIN',label:parent.title||id,status:parent.status,summary:parent.summary};
  const nodes=[root,...children.map(row=>({id:row.id,type:row.type||'ENTITY',label:row.title||row.id,status:row.status,summary:row.summary,metadata:{sourceRef:row.sourceRef||null}}))];
  return graph(snapshot,focus,nodes,nodes.slice(1).map(node=>({id:`contains:${focus}:${node.id}`,source:focus,target:node.id,type:'CONTAINS',declared:true})),{depth:2});
 }
 return graph(snapshot,`domain:${id}`,[],[],{depth:2,issues:[{level:'WARN',type:'FOCUS_NOT_IN_DRIVE_PROJECTION',focus:id}]});
}
function liveGraph(snapshot,query={}){
 const focus=text(query.focus||'system:NEXO');
 if(focus==='system:NEXO')return rootGraph(snapshot);
 if(focus==='system:SCIENCE')return scienceGraph(snapshot);
 if(focus==='system:ENGINEERING')return hierarchyGraph(snapshot,'ENGINEERING','ENG-DOM-ENGINEERING');
 if(focus==='system:OLYMPUS')return hierarchyGraph(snapshot,'OLYMPUS','OLY-DOM-OLYMPUS');
 if(focus.startsWith('domain:'))return detailGraph(snapshot,focus);
 return graph(snapshot,focus,[],[],{issues:[{level:'WARN',type:'FOCUS_NOT_IN_DRIVE_PROJECTION',focus}]});
}

function learningFromKnowledge(row){
 const domains=splitDomains(row.domain),domainA=domains[0]||'',domainB=domains.find(value=>value!==domainA)||'';
 return {id:text(row.knowledge_id),stage:upper(row.type).toLowerCase(),label:text(row.statement).split('|')[0].trim()||text(row.knowledge_id),status:text(row.status),domainA,domainB,confidence:numeric(row.confidence),evidenceCount:numeric(text(row.support).match(/-?\d+(?:[.,]\d+)?/)?.[0]),contradictionCount:numeric(text(row.contradiction).match(/-?\d+(?:[.,]\d+)?/)?.[0]),summary:text(row.statement),derivedFrom:text(row.related_ids).split('|').map(text).filter(Boolean),evidenceRefs:{relation_scope:domainA&&domainB?'CROSS_DOMAIN':'INTRA_DOMAIN',domain_a:domainA,domain_b:domainB,relation_type:upper(row.type)==='RELATION'?'declared-relation':'canonical-knowledge',provenance:text(row.evidence_refs),related_ids:text(row.related_ids)}};
}
function structuralItem(row){const domains=splitDomains(row.source_domains),domainA=domains[0]||'',domainB=domains.find(value=>value!==domainA)||'';return {id:text(row.learning_id),stage:'structural',label:text(row.title)||text(row.learning_id),status:text(row.status),domainA,domainB,confidence:numeric(row.confidence),evidenceCount:numeric(row.support_count),contradictionCount:numeric(row.contradict_count),summary:text(row.structural_pattern),derivedFrom:[],evidenceRefs:{relation_scope:domainA&&domainB?'CROSS_DOMAIN':'INTRA_DOMAIN',domain_a:domainA,domain_b:domainB,relation_type:'structural-learning',provenance:text(row.provenance)}}}
function crossItem(row){const domains=splitDomains(row.domains),domainA=domains[0]||'',domainB=domains.find(value=>value!==domainA)||'';return {id:text(row.cross_id),stage:'cross-domain',label:text(row.hypothesis).slice(0,120)||text(row.cross_id),status:text(row.status),domainA,domainB,confidence:null,evidenceCount:null,contradictionCount:null,summary:text(row.mechanism||row.hypothesis),derivedFrom:[],evidenceRefs:{relation_scope:'CROSS_DOMAIN',domain_a:domainA,domain_b:domainB,relation_type:'transfer',provenance:text(row.provenance)}}}
function liveLearning(snapshot){
 const canonical=arr(snapshot.sections?.KNOWLEDGE).filter(row=>!hiddenStatus(row.status)&&upper(row.type)!=='OBJECT').map(learningFromKnowledge);
 const structural=arr(snapshot.projections?.StructuralLearning).filter(row=>!hiddenStatus(row.status)).map(structuralItem),cross=arr(snapshot.projections?.CrossDomain).filter(row=>!hiddenStatus(row.status)).map(crossItem);
 const all=[],seen=new Set();for(const item of [...canonical,...structural,...cross])if(item.id&&!seen.has(item.id)){seen.add(item.id);all.push(item)}
 const byStage=new Map();for(const item of all){if(!byStage.has(item.stage))byStage.set(item.stage,[]);byStage.get(item.stage).push(item)}
 return {...base(snapshot),total:all.length,crossDomain:all.filter(item=>item.evidenceRefs.relation_scope==='CROSS_DOMAIN').length,ladder:[...byStage].map(([id,items])=>({id,items})),emergent:[]};
}
function liveAudit(snapshot){const issues=arr(snapshot.projections?.Integrity).map(row=>({...row})),resolved=new Set(['PASS','RESOLVED','LIVE']);const open=issues.filter(row=>!resolved.has(upper(row.status))).length;return {...base(snapshot),total:issues.length,open,resolved:issues.length-open,issues}}
function liveState(snapshot){return {...base(snapshot),projection:{...base(snapshot)},counts:{THREADS:arr(snapshot.sections?.THREADS).length,WORK:arr(snapshot.sections?.WORK).length,EVENTS:arr(snapshot.sections?.EVENTS).length,KNOWLEDGE:arr(snapshot.sections?.KNOWLEDGE).length,DECISIONS:arr(snapshot.sections?.DECISIONS).length,SYSTEM:arr(snapshot.sections?.SYSTEM).length,CAMPAIGN:scienceRows(snapshot).length},claims:{active:null,blocked:arr(snapshot.sections?.WORK).filter(row=>/BLOCK/.test(upper(row.status))).length},domains:{science:scienceRows(snapshot).length,engineering:normalizedHierarchyRows(snapshot,'Engineering').length,olympus:normalizedHierarchyRows(snapshot,'Olympus').length}}}
function workNode(row){return {id:text(row.work_id),label:text(row.question)||text(row.work_id),status:text(row.status),domain:text(row.domain),summary:text(row.next_step),updatedAt:text(row.updated_at),metadata:{kind:text(row.kind),priority:text(row.priority),authority:text(row.authority),verification_status:text(row.verification_status),result_ref:text(row.result_ref)}}}
function eventNode(row){return {id:text(row.event_id),label:text(row.event_type)||text(row.event_id),status:text(row.status),domain:text(row.domain),summary:text(row.summary),updatedAt:text(row.created_at||row.updated_at),metadata:{source_role:text(row.source_role),target_role:text(row.target_role),correlation_id:text(row.correlation_id)}}}
function liveOps(snapshot){const actions=arr(snapshot.sections?.WORK).map(workNode),events=arr(snapshot.sections?.EVENTS).map(eventNode);return {...base(snapshot),counts:{blocked:actions.filter(row=>/BLOCK/.test(upper(row.status))).length,runs:null,success:actions.filter(row=>/DONE|PASS|COMPLETE/.test(upper(row.status))).length,readbackVerified:actions.filter(row=>upper(row.metadata?.verification_status).includes('VERIFIED')).length},actions,runs:[],events}}
function allEntities(snapshot){
 const entities=[];for(const row of scienceRows(snapshot))entities.push({id:text(row.record_id),type:'CAMPAIGN',label:text(row.title),status:text(row.status),summary:text(row.summary),domain:text(row.domain),metadata:{sourceRef:text(row.source_ref)}});
 for(const key of ['Engineering','Olympus'])for(const row of normalizedHierarchyRows(snapshot,key))entities.push({id:row.id,type:row.type||'ENTITY',label:row.title,status:row.status,summary:row.summary,metadata:{sourceRef:row.sourceRef,parentId:row.parentId}});
 for(const row of arr(snapshot.sections?.KNOWLEDGE).filter(row=>!hiddenStatus(row.status)))entities.push({id:text(row.knowledge_id),type:upper(row.type)||'KNOWLEDGE',label:text(row.statement).split('|')[0].trim()||text(row.knowledge_id),status:text(row.status),summary:text(row.statement),domain:text(row.domain),metadata:{evidenceRefs:text(row.evidence_refs),relatedIds:text(row.related_ids)}});
 for(const row of arr(snapshot.sections?.WORK))entities.push(workNode(row));return entities;
}
function liveEntity(snapshot,id,view=''){const entity=allEntities(snapshot).find(row=>row.id===id)||null;if(view==='lineage')return graph(snapshot,id,entity?[entity]:[],[],{depth:1});if(view==='files')return {...base(snapshot),id,files:entity?.metadata?.sourceRef?[{ref:entity.metadata.sourceRef}]:[]};return {...base(snapshot),entity}}
function liveHealth(snapshot){return {ok:true,contract:'drive-ssot-live-v1',dataSource:{source:'drive',freshness:'LIVE',reason:'LIVE_CANONICAL_SSOT',usedFallback:false,authority:'GOOGLE_DRIVE',projectionOnly:true,sourceFileId:snapshot.sourceFileId,sourceModifiedAt:snapshot.sourceModifiedAt,fingerprint:snapshot.fingerprint}}}

export function projectLiveRoute(snapshot,route,query={}){
 validate(snapshot);
 if(route==='graph'||route==='projection'||route==='universal-projection')return liveGraph(snapshot,query);
 if(route==='health')return liveHealth(snapshot);
 if(route==='state')return liveState(snapshot);
 if(route==='learning')return liveLearning(snapshot);
 if(route==='learning-relations')return liveLearning(snapshot).ladder.flatMap(stage=>stage.items).filter(item=>item.evidenceRefs.relation_scope==='CROSS_DOMAIN');
 if(route==='audit')return liveAudit(snapshot);
 if(route==='ops')return liveOps(snapshot);
 if(route==='automation-runs')return [];
 if(route==='entity')return liveEntity(snapshot,query.id||query.focus||'',query.view||'');
 throw new Error(`LIVE_DRIVE_ROUTE_UNSUPPORTED:${route}`);
}

function signature(value){return hash(value)}
export function diffLiveSnapshots(before,after){
 validate(after);if(!before)return {outcome:'REFRESHED',revisionBefore:null,revisionAfter:after.sourceModifiedAt||null,fingerprintBefore:null,fingerprintAfter:after.fingerprint,changedSections:[],changedProjections:[],counts:{},detailAvailable:false};
 validate(before);if(before.fingerprint===after.fingerprint)return {outcome:'NO_CHANGE',revisionBefore:before.sourceModifiedAt||null,revisionAfter:after.sourceModifiedAt||null,fingerprintBefore:before.fingerprint,fingerprintAfter:after.fingerprint,changedSections:[],changedProjections:[],counts:{},detailAvailable:true};
 const changedSections=[],changedProjections=[],counts={};
 for(const key of ['THREADS','WORK','EVENTS','KNOWLEDGE','DECISIONS','SYSTEM']){const a=arr(before.sections?.[key]),b=arr(after.sections?.[key]);if(signature(a)!==signature(b))changedSections.push(key);counts[key]={before:a.length,after:b.length,delta:b.length-a.length}}
 for(const key of ['Science','Engineering','Olympus','StructuralLearning','CrossDomain','Integrity']){const a=arr(before.projections?.[key]),b=arr(after.projections?.[key]);if(signature(a)!==signature(b))changedProjections.push(key);counts[key]={before:a.length,after:b.length,delta:b.length-a.length}}
 return {outcome:'UPDATED',revisionBefore:before.sourceModifiedAt||null,revisionAfter:after.sourceModifiedAt||null,fingerprintBefore:before.fingerprint,fingerprintAfter:after.fingerprint,changedSections,changedProjections,counts,detailAvailable:true};
}

export async function syncLiveSsot({req,fetcher=fetch,signal}={}){const before=cache?.snapshot||null;const after=await fetchLiveSsot({fetcher,oidcToken:atlasOidcToken(req),force:true,signal});cache={at:Date.now(),snapshot:after};return {snapshot:after,diff:diffLiveSnapshots(before,after)}}
