const arr=value=>Array.isArray(value)?value:[];
const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase();
const unique=values=>[...new Set(values.filter(Boolean))];
const nullable=value=>text(value)||null;

const HUMAN_AUTHORITY={GITHUB:'GitHub',GOOGLE_DRIVE:'Google Drive',PROJECTION:'Projeção'};
const HUMAN_EVIDENCE={PROJECTION:'Projeção autorizada',DERIVED:'Derivado',PUBLISHED:'Publicado',UNKNOWN:'Desconhecido'};

function projectionMeta(state){
 const {authority,payload,fingerprint}=state;
 const meta=payload?.meta||{};
 const sourceVersion=text(meta.sourceModifiedAt||meta.generatedAt||authority.ref||'main');
 return {
  source:'github',
  effectiveSource:'github-projection',
  freshness:meta.generatedAt||meta.sourceModifiedAt?'SNAPSHOT':'UNKNOWN',
  sourceVersion,
  canonicalVersion:authority.ref||'main',
  schemaVersion:text(meta.schemaVersion)||'unknown',
  generatedAt:nullable(meta.generatedAt),
  sourceModifiedAt:nullable(meta.sourceModifiedAt),
  fingerprint,
  authority:'GITHUB',
  authorityLabel:HUMAN_AUTHORITY.GITHUB,
  projectionAuthority:meta.authority||'PROJECTION',
  projectionAuthorityLabel:HUMAN_AUTHORITY[meta.authority]||text(meta.authority)||HUMAN_AUTHORITY.PROJECTION,
  projectionOnly:true,
  sourceRef:`https://github.com/${authority.repository}/blob/${authority.ref}/${authority.projection.transportPath}`
 };
}
function provenance(state,{sourceRef=null,evidenceClass='PROJECTION',derivation=null}={}){
 const base=projectionMeta(state);
 return [{
  authority:base.authority,
  authorityLabel:base.authorityLabel,
  projectionAuthority:base.projectionAuthority,
  source:base.effectiveSource,
  sourceRef:sourceRef||base.sourceRef,
  sourceVersion:base.sourceVersion,
  schemaVersion:base.schemaVersion,
  freshness:base.freshness,
  generatedAt:base.generatedAt,
  sourceModifiedAt:base.sourceModifiedAt,
  evidenceClass,
  evidenceClassLabel:HUMAN_EVIDENCE[evidenceClass]||evidenceClass,
  derivation:derivation||null
 }];
}
const graph=(state,focus,nodes,edges,extra={})=>({...projectionMeta(state),contract:'nexo-graph-v2',focus,nodes,edges,total:nodes.length,hasMore:false,truncated:false,depth:1,cache:'SNAPSHOT',issues:[],...extra});
const systemNode=(id,label,summary)=>({id:`system:${id}`,canonicalId:`system:${id}`,type:'SYSTEM',label,status:'ACTIVE',summary,metadata:{authority:'GITHUB'}});

function campaignFields(row){
 const raw=text(row?.summary);
 const q=raw.match(/(?:^|\s)Pergunta:\s*(.*?)(?=\s+Mecanismo:|$)/i)?.[1]?.trim()||'';
 const m=raw.match(/(?:^|\s)Mecanismo:\s*(.*?)(?=\s+\d+\s+test_ids|$)/i)?.[1]?.trim()||'';
 return {what:q||null,how:m||null,why:null};
}
function scienceRows(state){return arr(state.payload?.science);}
function domainContext(state,id){
 const rows=scienceRows(state).filter(row=>text(row.domain)===id);
 const primary=rows[0]||{};
 const semantic=text(primary.title);
 return {
  id,
  label:semantic?`${id} · ${semantic}`:id,
  domainLabel:semantic?`${id} · ${semantic}`:id,
  semanticSource:semantic?'DERIVED_FROM_CAMPAIGN':'CANONICAL_ID_ONLY',
  rows
 };
}

function rootGraph(state){
 const root={id:'system:NEXO',canonicalId:'system:NEXO',type:'SYSTEM',label:'NEXO',status:'ACTIVE',summary:'Estado canônico versionado no GitHub.'};
 const children=[
  systemNode('SCIENCE','Ciência','Campanhas e evidências publicadas pelo control plane.'),
  systemNode('ENGINEERING','Engenharia','Programas, código e runtime publicados pelo control plane.'),
  systemNode('OLYMPUS','Olympus','Estrutura Olympus autorizada pelo control plane; dados privados permanecem fora do GitHub.'),
  systemNode('OPERATIONS','Operação','Ações e estado operacional publicados pela projeção autorizada pelo GitHub.')
 ];
 return graph(state,root.id,[root,...children],children.map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',declared:true})));
}
function scienceGraph(state){
 const domains=unique(scienceRows(state).map(row=>text(row.domain))).sort();
 const nodes=[systemNode('SCIENCE','Ciência','Hierarquia científica canônica')];
 for(const id of domains){
  const ctx=domainContext(state,id),primary=ctx.rows[0]||{};
  nodes.push({id:`domain:${id}`,canonicalId:`domain:${id}`,domain:id,domainLabel:ctx.domainLabel,type:'DOMAIN',label:ctx.label,status:text(primary.status)||'UNKNOWN',summary:nullable(primary.summary),metadata:{campaignCount:ctx.rows.length,sourceRef:primary.sourceRef||null,labelAuthority:ctx.semanticSource}});
 }
 return graph(state,'system:SCIENCE',nodes,nodes.slice(1).map(node=>({id:`contains:science:${node.id}`,source:'system:SCIENCE',target:node.id,type:'CONTAINS',declared:true})));
}
function hierarchyGraph(state,system,rows,rootId){
 const systemId=`system:${system}`,programs=arr(rows).filter(row=>upper(row.type)==='PROGRAM'&&text(row.parentId)===rootId),nodes=[systemNode(system,system==='ENGINEERING'?'Engenharia':'Olympus',`Hierarquia ${system} canônica`)];
 for(const row of programs)nodes.push({id:`domain:${row.id}`,canonicalId:`domain:${row.id}`,domain:row.id,domainLabel:row.title||row.id,type:'DOMAIN',label:row.title||row.id,status:row.status||'UNKNOWN',summary:nullable(row.summary),metadata:{sourceRef:row.sourceRef||null}});
 return graph(state,systemId,nodes,nodes.slice(1).map(node=>({id:`contains:${systemId}:${node.id}`,source:systemId,target:node.id,type:'CONTAINS',declared:true})));
}
function operationsGraph(state){
 const actions=arr(state.payload.actions),root=systemNode('OPERATIONS','Operação','Ações publicadas pela projeção autorizada pelo GitHub.');
 const children=actions.slice(0,96).map(row=>({id:row.id,canonicalId:row.id,type:'WORK',label:row.title||row.id,status:row.status||'UNKNOWN',summary:nullable(row.summary),updatedAt:row.updatedAt||'',metadata:{authority:'GITHUB'}}));
 return graph(state,root.id,[root,...children],children.map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',declared:true})),{depth:2});
}
function detailGraph(state,raw){
 const id=text(raw).replace(/^domain:/,''),p=state.payload;
 if(/^D\d+$|^M\d+$/i.test(id)){
  const ctx=domainContext(state,id),focus=`domain:${id}`,root={id:focus,canonicalId:focus,type:'DOMAIN',domain:id,domainLabel:ctx.domainLabel,label:ctx.label,status:ctx.rows[0]?.status||'UNKNOWN',summary:nullable(ctx.rows[0]?.summary),metadata:{labelAuthority:ctx.semanticSource}};
  const nodes=[root,...ctx.rows.map(row=>({id:row.id,canonicalId:row.id,type:'CAMPAIGN',label:row.title||row.id,status:row.status||'UNKNOWN',summary:nullable(row.summary),domain:id,domainLabel:ctx.domainLabel,metadata:{sourceRef:row.sourceRef||null}}))];
  return graph(state,focus,nodes,nodes.slice(1).map(node=>({id:`contains:${focus}:${node.id}`,source:focus,target:node.id,type:'CONTAINS',declared:true})),{depth:2});
 }
 for(const rows of [p.engineering,p.olympus]){
  const parent=arr(rows).find(row=>row.id===id);if(!parent)continue;
  const focus=`domain:${id}`,children=arr(rows).filter(row=>text(row.parentId)===id),root={id:focus,canonicalId:focus,type:upper(parent.type)||'DOMAIN',domain:id,domainLabel:parent.title||id,label:parent.title||id,status:parent.status||'UNKNOWN',summary:nullable(parent.summary)};
  const nodes=[root,...children.map(row=>({id:row.id,canonicalId:row.id,type:upper(row.type)||'ENTITY',label:row.title||row.id,status:row.status||'UNKNOWN',summary:nullable(row.summary),metadata:{sourceRef:row.sourceRef||null}}))];
  return graph(state,focus,nodes,nodes.slice(1).map(node=>({id:`contains:${focus}:${node.id}`,source:focus,target:node.id,type:'CONTAINS',declared:true})),{depth:2});
 }
 return graph(state,`domain:${id}`,[],[],{depth:2,issues:[{level:'WARN',type:'FOCUS_NOT_IN_GITHUB_CANONICAL',focus:id}]});
}
function projectGraph(state,query={}){
 const focus=text(query.focus||'system:NEXO'),p=state.payload;
 if(focus==='system:NEXO')return rootGraph(state);
 if(focus==='system:SCIENCE')return scienceGraph(state);
 if(focus==='system:ENGINEERING')return hierarchyGraph(state,'ENGINEERING',p.engineering,'ENG-DOM-ENGINEERING');
 if(focus==='system:OLYMPUS')return hierarchyGraph(state,'OLYMPUS',p.olympus,'OLY-DOM-OLYMPUS');
 if(focus==='system:OPERATIONS')return operationsGraph(state);
 if(focus.startsWith('domain:'))return detailGraph(state,focus);
 return graph(state,focus,[],[],{issues:[{level:'WARN',type:'FOCUS_NOT_IN_GITHUB_CANONICAL',focus}]});
}
function learning(state){
 const structural=arr(state.payload.learning).map(row=>({id:row.id,stage:'structural',label:row.title||row.id,status:row.status,summary:row.summary,confidence:row.confidence??null,evidenceCount:row.support??null,contradictionCount:row.contradict??null,evidenceRefs:{provenance:row.provenance||null}}));
 const cross=arr(state.payload.crossDomain).map(row=>({id:row.id,stage:'cross-domain',label:row.title||row.id,status:row.status,summary:row.summary,evidenceRefs:{provenance:row.provenance||null,relation_scope:'CROSS_DOMAIN'}}));
 return {...projectionMeta(state),total:structural.length+cross.length,crossDomain:cross.length,ladder:[{id:'structural',items:structural},{id:'cross-domain',items:cross}],emergent:[]};
}
function audit(state){const issues=arr(state.payload.integrity),resolved=new Set(['PASS','RESOLVED','LIVE']),open=issues.filter(row=>!resolved.has(upper(row.status))).length;return {...projectionMeta(state),total:issues.length,open,resolved:issues.length-open,issues}}
function ops(state){const actions=arr(state.payload.actions).map(row=>({id:row.id,label:row.title,status:row.status,summary:row.summary,updatedAt:row.updatedAt,metadata:{authority:'GITHUB'}}));return {...projectionMeta(state),counts:{blocked:actions.filter(row=>upper(row.status)==='BLOCKED').length,runs:null,success:null,readbackVerified:null},actions,runs:[],events:[]}}

function rawEntities(state){
 const p=state.payload,out=[];
 for(const row of scienceRows(state))out.push({id:row.id,type:'CAMPAIGN',label:row.title,status:row.status,summary:row.summary,domain:row.domain,sourceRef:row.sourceRef});
 for(const row of [...arr(p.engineering),...arr(p.olympus)])out.push({id:row.id,type:upper(row.type)||'ENTITY',label:row.title,status:row.status,summary:row.summary,parentId:row.parentId,sourceRef:row.sourceRef});
 for(const row of arr(p.actions))out.push({id:row.id,type:'WORK',label:row.title,status:row.status,summary:row.summary,updatedAt:row.updatedAt});
 return out;
}
function normalizeEntity(state,row){
 if(!row)return null;
 const domain=text(row.domain)||null,ctx=domain?domainContext(state,domain):null,fields=upper(row.type)==='CAMPAIGN'?campaignFields(row):{what:null,how:null,why:null};
 const summary=nullable(row.summary),sourceRef=nullable(row.sourceRef);
 const availability={what:fields.what?'AVAILABLE':'ABSENT',how:fields.how?'AVAILABLE':'ABSENT',why:fields.why?'AVAILABLE':'ABSENT',summary:summary?'AVAILABLE':'ABSENT',sourceRef:sourceRef?'AVAILABLE':'ABSENT'};
 return {
  id:row.id,canonicalId:row.id,label:row.label||row.id,type:upper(row.type)||'ENTITY',status:text(row.status)||'UNKNOWN',
  domain,domainLabel:ctx?.domainLabel||null,what:fields.what,how:fields.how,why:fields.why,summary,
  authority:'GITHUB',authorityLabel:HUMAN_AUTHORITY.GITHUB,evidenceClass:'PROJECTION',evidenceClassLabel:HUMAN_EVIDENCE.PROJECTION,
  freshness:projectionMeta(state).freshness,sourceVersion:projectionMeta(state).sourceVersion,
  provenance:provenance(state,{sourceRef,evidenceClass:'PROJECTION',derivation:fields.what||fields.how?'PARSED_FROM_PUBLISHED_SUMMARY':null}),
  relations:[],actions:sourceRef?[{type:'SOURCE',label:'Abrir fonte',ref:sourceRef}]:[],availability,
  metadata:{parentId:row.parentId||null,updatedAt:row.updatedAt||null}
 };
}
function universe(state){
 const meta=projectionMeta(state),domains=unique(scienceRows(state).map(row=>text(row.domain))).filter(Boolean);
 return {...meta,contract:'nexo-universe-v2',coverage:{scienceCampaigns:scienceRows(state).length,scienceDomains:domains.length},synthesis:{availability:'UNAVAILABLE',status:'UNAVAILABLE',summary:null,conclusion:null,interpretation:null,reason:'NO_PUBLISHED_SYNTHESIS_IN_AUTHORIZED_PROJECTION',provenance:[]},parameters:[],tensions:[],directionalSignals:[],sections:[]};
}

export function projectGithubCanonical(state,route,query={}){
 if(route==='graph'||route==='projection'||route==='universal-projection')return projectGraph(state,query);
 if(route==='health')return {ok:true,contract:'github-canonical-v2',dataSource:{...projectionMeta(state),reason:'GITHUB_CANONICAL_WITH_AUTHORIZED_PROJECTION'}};
 if(route==='state')return {...projectionMeta(state),contract:'nexo-state-v2',projection:{...projectionMeta(state)},counts:{CAMPAIGN:scienceRows(state).length,ENGINEERING:arr(state.payload.engineering).length,OLYMPUS:arr(state.payload.olympus).length},claims:{active:null,blocked:null},domains:{science:scienceRows(state).length,engineering:arr(state.payload.engineering).length,olympus:arr(state.payload.olympus).length},synthesis:universe(state).synthesis};
 if(route==='universe'||route==='summary'||route==='summaries')return universe(state);
 if(route==='observatory')return {...universe(state),contract:'nexo-observatory-v2'};
 if(route==='lab')return {...projectionMeta(state),contract:'nexo-lab-v2',availability:'PARTIAL',hypotheses:[],claims:[],tests:[],runs:[],results:[],evidence:[],pipelines:[],reason:'STRUCTURED_LAB_RECORDS_NOT_PRESENT_IN_AUTHORIZED_PROJECTION'};
 if(route==='learning')return learning(state);
 if(route==='learning-relations')return learning(state).ladder.flatMap(stage=>stage.items).filter(item=>item.stage==='cross-domain');
 if(route==='audit'||route==='provenance')return audit(state);
 if(route==='ops'||route==='operations')return ops(state);
 if(route==='automation-runs')return [];
 if(route==='entity'){
  const raw=rawEntities(state).find(row=>row.id===(query.id||query.focus))||null;
  return {...projectionMeta(state),contract:'nexo-entity-v2',entity:normalizeEntity(state,raw)};
 }
 throw new Error(`GITHUB_CANONICAL_ROUTE_UNSUPPORTED:${route}`);
}
