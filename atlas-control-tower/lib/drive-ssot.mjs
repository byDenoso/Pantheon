import SNAPSHOT from '../data/nexo-drive-projection.json' with {type:'json'};
import {SOURCES,FRESHNESS} from './graph-contract.mjs';

export const DRIVE_SSOT_META=Object.freeze({...SNAPSHOT.meta});
const SOURCE=SOURCES.DRIVE||'drive';
const BASE={source:SOURCE,freshness:FRESHNESS.SNAPSHOT,sourceVersion:DRIVE_SSOT_META.sourceModifiedAt,fingerprint:DRIVE_SSOT_META.fingerprint,authority:DRIVE_SSOT_META.authority,projectionOnly:true,sourceRef:DRIVE_SSOT_META.sourceUrl};
const arr=value=>Array.isArray(value)?value:[];
const text=value=>value==null?'':String(value);
const upper=value=>text(value).trim().toUpperCase();
const unique=values=>[...new Set(values.filter(Boolean))];
const graph=(focus,nodes,edges,extra={})=>({...BASE,focus,nodes,edges,total:nodes.length,hasMore:false,truncated:false,depth:1,cache:'',issues:[],...extra});
const systemNode=(id,label,summary)=>({id:`system:${id}`,type:'SYSTEM',label,status:'ACTIVE',summary,metadata:{authority:'GOOGLE_DRIVE'}});

function rootGraph(){
 const root={id:'system:NEXO',type:'SYSTEM',label:'NEXO',status:'ACTIVE',summary:'Projeção read-only do NEXO · SSOT CANONICAL no Google Drive.'};
 const children=[
  systemNode('SCIENCE','Ciência','Pesquisa científica, campanhas, testes e evidências referenciados pelo SSOT.'),
  systemNode('ENGINEERING','Engenharia','Programas, campanhas, código e runtime publicados pelo SSOT.'),
  systemNode('OLYMPUS','Olympus','Programas estruturados, check-ins e auditorias publicados pelo SSOT Olympus.'),
 ];
 return graph(root.id,[root,...children],children.map(node=>({id:`contains:${root.id}:${node.id}`,source:root.id,target:node.id,type:'CONTAINS',declared:true})));
}

function scienceGraph(){
 const rows=arr(SNAPSHOT.science);
 const domains=unique(rows.map(row=>text(row.domain)).filter(id=>/^D\d+$|^M\d+$/i.test(id))).sort((a,b)=>{
  const rank=id=>/^D\d+$/i.test(id)?Number(id.slice(1)):1000+Number(id.slice(1));return rank(a)-rank(b);
 });
 const nodes=[systemNode('SCIENCE','Ciência','Hierarquia científica publicada no Drive')];
 for(const id of domains){
  const rowsFor=rows.filter(row=>text(row.domain)===id);const primary=rowsFor[0]||{};
  nodes.push({id:`domain:${id}`,domain:id,type:'DOMAIN',label:text(primary.title)||id,status:text(primary.status),summary:text(primary.summary),metadata:{sourceRef:primary.sourceRef||null,campaignCount:rowsFor.length}});
 }
 const edges=nodes.slice(1).map(node=>({id:`contains:science:${node.id}`,source:'system:SCIENCE',target:node.id,type:'CONTAINS',declared:true}));
 return graph('system:SCIENCE',nodes,edges);
}

function hierarchyGraph(system,rows,rootId){
 const programs=arr(rows).filter(row=>upper(row.type)==='PROGRAM'&&text(row.parentId)===rootId);
 const systemId=`system:${system}`;
 const nodes=[systemNode(system,system==='ENGINEERING'?'Engenharia':'Olympus',`Hierarquia ${system} publicada no Drive`)];
 for(const row of programs)nodes.push({id:`domain:${row.id}`,domain:row.id,type:'DOMAIN',label:row.title||row.id,status:row.status||'',summary:row.summary||'',metadata:{sourceRef:row.sourceRef||null}});
 const edges=nodes.slice(1).map(node=>({id:`contains:${systemId}:${node.id}`,source:systemId,target:node.id,type:'CONTAINS',declared:true}));
 return graph(systemId,nodes,edges);
}

function detailGraph(rawFocus){
 const id=text(rawFocus).replace(/^domain:/,'');
 if(/^D\d+$|^M\d+$/i.test(id)){
  const rows=arr(SNAPSHOT.science).filter(row=>text(row.domain)===id);
  const focus=`domain:${id}`;const root={id:focus,type:'DOMAIN',domain:id,label:id,status:'ACTIVE'};
  const nodes=[root,...rows.map(row=>({id:row.id,type:'CAMPAIGN',label:row.title||row.id,status:row.status||'',summary:row.summary||'',domain:id,metadata:{sourceRef:row.sourceRef||null}}))];
  return graph(focus,nodes,nodes.slice(1).map(node=>({id:`contains:${focus}:${node.id}`,source:focus,target:node.id,type:'CONTAINS',declared:true})),{depth:2});
 }
 const collections=[SNAPSHOT.engineering,SNAPSHOT.olympus];
 for(const rows of collections){
  const parent=arr(rows).find(row=>row.id===id);
  if(!parent)continue;
  const focus=`domain:${id}`;const children=arr(rows).filter(row=>text(row.parentId)===id);
  const root={id:focus,type:upper(parent.type)==='PROGRAM'?'PROGRAM':'DOMAIN',label:parent.title||id,status:parent.status||'',summary:parent.summary||''};
  const nodes=[root,...children.map(row=>({id:row.id,type:upper(row.type)||'ENTITY',label:row.title||row.id,status:row.status||'',summary:row.summary||'',metadata:{sourceRef:row.sourceRef||null}}))];
  return graph(focus,nodes,nodes.slice(1).map(node=>({id:`contains:${focus}:${node.id}`,source:focus,target:node.id,type:'CONTAINS',declared:true})),{depth:2});
 }
 return graph(`domain:${id}`,[],[],{depth:2,issues:[{level:'WARN',type:'FOCUS_NOT_IN_DRIVE_PROJECTION',focus:id}]});
}

export function driveGraph(query={}){
 const focus=text(query.focus||'system:NEXO');
 if(focus==='system:NEXO')return rootGraph();
 if(focus==='system:SCIENCE')return scienceGraph();
 if(focus==='system:ENGINEERING')return hierarchyGraph('ENGINEERING',SNAPSHOT.engineering,'ENG-DOM-ENGINEERING');
 if(focus==='system:OLYMPUS')return hierarchyGraph('OLYMPUS',SNAPSHOT.olympus,'OLY-DOM-OLYMPUS');
 if(focus.startsWith('domain:'))return detailGraph(focus);
 return graph(focus,[],[],{issues:[{level:'WARN',type:'FOCUS_NOT_IN_DRIVE_PROJECTION',focus}]});
}

const normalizeDomain=value=>{const v=upper(value);if(v.includes('SCIENCE'))return 'SCIENCE';if(v.includes('ENGINEER'))return 'ENGINEERING';if(v.includes('OLYMPUS'))return 'OLYMPUS';if(v.includes('NEXO'))return 'NEXO';return v};
function learningItem(row,stage){
 const domains=unique(text(row.domains).split('|').map(normalizeDomain));
 const domainA=domains[0]||'';const domainB=domains.find(value=>value!==domainA&&['SCIENCE','ENGINEERING','OLYMPUS'].includes(value))||'';
 return {id:row.id,stage,label:row.title||row.id,status:row.status||'',domainA,domainB,confidence:row.confidence??null,evidenceCount:row.support??null,contradictionCount:row.contradict??null,summary:row.summary||'',derivedFrom:[],evidenceRefs:{relation_scope:domainA&&domainB?'CROSS_DOMAIN':'INTRA_DOMAIN',domain_a:domainA,domain_b:domainB,relation_type:stage==='cross-domain'?'transfer':'structural-learning',support_count:row.support??null,confidence_raw:row.confidence??null,provenance:row.provenance||null}};
}
export function driveLearning(){
 const structural=arr(SNAPSHOT.learning).map(row=>learningItem(row,'structural'));
 const cross=arr(SNAPSHOT.crossDomain).map(row=>learningItem(row,'cross-domain'));
 const items=[...structural,...cross];
 return {...BASE,total:items.length,crossDomain:items.filter(item=>item.evidenceRefs.relation_scope==='CROSS_DOMAIN').length,ladder:[{id:'structural',items:structural},{id:'cross-domain',items:cross}],emergent:[]};
}
export function driveAudit(){
 const issues=arr(SNAPSHOT.integrity).map(row=>({...row}));
 const resolved=new Set(['PASS','RESOLVED','LIVE']);
 const open=issues.filter(row=>!resolved.has(upper(row.status))).length;
 return {...BASE,total:issues.length,open,resolved:issues.length-open,issues};
}
export function driveState(){
 const science=arr(SNAPSHOT.science);const engineering=arr(SNAPSHOT.engineering);const olympus=arr(SNAPSHOT.olympus);
 return {...BASE,projection:{...BASE},counts:{CAMPAIGN:science.length,ENGINEERING:engineering.length,OLYMPUS:olympus.length},claims:{active:null,blocked:null},domains:{science:science.length,engineering:engineering.length,olympus:olympus.length}};
}
export function driveOps(){
 const actions=arr(SNAPSHOT.actions).map(row=>({id:row.id,label:row.title,status:row.status,domain:text(row.summary).split('|')[0]?.trim()||'',summary:row.summary,updatedAt:row.updatedAt,metadata:{}}));
 return {...BASE,counts:{blocked:actions.filter(row=>upper(row.status)==='BLOCKED').length,runs:null,success:null,readbackVerified:null},actions,runs:[],events:[]};
}
export const driveAutomationRuns=()=>[];

function allEntities(){
 const entities=[];
 for(const row of arr(SNAPSHOT.science))entities.push({id:row.id,type:'CAMPAIGN',label:row.title,status:row.status,summary:row.summary,domain:row.domain,metadata:{sourceRef:row.sourceRef}});
 for(const row of [...arr(SNAPSHOT.engineering),...arr(SNAPSHOT.olympus)])entities.push({id:row.id,type:upper(row.type)||'ENTITY',label:row.title,status:row.status,summary:row.summary,metadata:{sourceRef:row.sourceRef,parentId:row.parentId}});
 for(const row of arr(SNAPSHOT.learning))entities.push({id:row.id,type:'LEARNING',label:row.title,status:row.status,summary:row.summary,metadata:{domains:row.domains,provenance:row.provenance}});
 return entities;
}
export function driveEntity(id,view=''){
 const entity=allEntities().find(row=>row.id===id)||null;
 if(view==='lineage')return graph(id,entity?[entity]:[],[],{depth:1});
 if(view==='files')return {...BASE,id,files:entity?.metadata?.sourceRef?[{ref:entity.metadata.sourceRef}]:[]};
 return {...BASE,entity};
}
export function driveHealth(){return {ok:true,contract:'drive-ssot-v1',dataSource:{source:SOURCE,freshness:FRESHNESS.SNAPSHOT,reason:'DRIVE_DERIVED_PROJECTION',usedFallback:false,authority:'GOOGLE_DRIVE',projectionOnly:true,sourceFileId:DRIVE_SSOT_META.sourceFileId,sourceModifiedAt:DRIVE_SSOT_META.sourceModifiedAt,fingerprint:DRIVE_SSOT_META.fingerprint}}}

export async function driveRoute(route,query={},options={}){
 const method=upper(options.method||'GET');
 if(method!=='GET')throw Error('READ_ONLY_DRIVE_SSOT');
 if(route==='graph'||route==='projection'||route==='universal-projection')return driveGraph(query);
 if(route==='health')return driveHealth();
 if(route==='state')return driveState();
 if(route==='learning')return driveLearning();
 if(route==='learning-relations')return [];
 if(route==='audit')return driveAudit();
 if(route==='ops')return driveOps();
 if(route==='automation-runs')return driveAutomationRuns();
 if(route==='entity')return driveEntity(query.id||query.focus||'',query.view||'');
 if(route==='sync')throw Error('READ_ONLY_DRIVE_SSOT');
 throw Error(`DRIVE_ROUTE_UNSUPPORTED:${route}`);
}
