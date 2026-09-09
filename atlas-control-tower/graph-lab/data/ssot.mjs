import {attachOperations,extractLiveState,statusTone} from './operations.mjs';

export const SSOT_SPREADSHEET_ID='1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY';
export const SSOT_TABS=['Science','Relations','Olympus','NEXO'];
// Read when the sheet exposes them; their absence must never fail the canonical read.
export const SSOT_OPTIONAL_TABS=['Engineering'];
export const SSOT_SPREADSHEET_URL=`https://docs.google.com/spreadsheets/d/${SSOT_SPREADSHEET_ID}/edit`;
export const SSOT_SNAPSHOT_URL=new URL('./ssot.snapshot.json',import.meta.url).href;
export const SSOT_HIERARCHY_SNAPSHOT_URL=new URL('./ssot.hierarchy.snapshot.json',import.meta.url).href;

export const ROOT_ID='system:NEXO';
const HIERARCHY_TABS=['Science','Engineering'];
const SYSTEM_FOR_TAB={Science:'SCIENCE',Engineering:'ENGINEERING',Olympus:'OLYMPUS',NEXO:'NEXO'};
const LANE_BY_TAB={Science:'lane:SCIENCE',Engineering:'lane:ENGINEERING',Olympus:'lane:OLYMPUS'};
const LANE_LABEL={SCIENCE:'CIÊNCIA',OLYMPUS:'OLYMPUS',ENGINEERING:'ENGENHARIA'};
const LANE_SUMMARY={
 SCIENCE:'Pesquisa, falsificação, domains científicos, programs, campaigns, tests e claims com evidência em Drive.',
 OLYMPUS:'Metodologia Olympus: pessoas, protocolos, check-ins, null models e evolução corporal auditável.',
 ENGINEERING:'GitHub + runtime são o Truth Owner: Atlas, deploy, automações, integrações e incidentes operacionais.'
};
const TYPE_FOR_LEVEL={domain:'DOMAIN',program:'PROGRAM',campaign:'CAMPAIGN'};
const OLYMPUS_GROUPS=['CORE','LITE','RESEARCH'];

const text=v=>v==null?'':String(v);
const clean=v=>text(v).trim();
const upper=v=>clean(v).toUpperCase();
const cellValue=cell=>cell?.v==null?'':String(cell.v);
const asArray=value=>Array.isArray(value)?value:value&&typeof value==='object'?[value]:[];

/** Kept for the NEXO LIVE surface; the loop and its claims come straight from the SSOT. */
export function extractNexoLiveState(rowsByTab={}){return extractLiveState(rowsByTab)}

export function gvizTableToRows(table){
 if(!table?.cols||!Array.isArray(table.rows))return[];
 const headers=table.cols.map((col,i)=>clean(col.label||col.id||`col_${i}`));
 return table.rows.map(row=>{const out={};headers.forEach((key,i)=>{if(key)out[key]=cellValue(row.c?.[i])});return out}).filter(row=>row.record_id||row.record_type||row.relation_id||row.title);
}

function hierarchyRow(tab,row){
 const level=clean(row.record_type).toLowerCase();
 if(!TYPE_FOR_LEVEL[level])return null;
 const recordId=clean(row.record_id);
 if(!recordId)return null;
 return{
  tab,level,recordId,
  parentRecordId:clean(row.parent_id),
  domainCode:clean(row.domain),
  label:clean(row.title||recordId),
  status:clean(row.status)||'UNKNOWN',
  summary:clean(row.summary),
  detail:clean(row.detail),
  source:clean(row.source||row.source_ref),
  updatedAt:clean(row.updated_at)
 };
}

function makeNode(row,{parentId,extra={}}){
 return{
  id:`record:${row.tab}:${row.recordId}`,
  recordId:row.recordId,recordType:row.level,hierarchyLevel:row.level,
  label:row.label,type:TYPE_FOR_LEVEL[row.level],kind:TYPE_FOR_LEVEL[row.level],
  system:SYSTEM_FOR_TAB[row.tab]||'NEXO',
  status:row.status,authority:'canonical',parentId,
  summary:row.summary,detail:row.detail,
  domain:row.domainCode,sheetTab:row.tab,
  source:row.source||SSOT_SPREADSHEET_URL,updatedAt:row.updatedAt,
  ssotUrl:SSOT_SPREADSHEET_URL,hiddenChildren:0,
  ...extra
 };
}

function makeLane(code){
 const authority=code==='ENGINEERING'?'runtime-github':'canonical';
 return{
  id:`lane:${code}`,recordId:code,recordType:'lane',hierarchyLevel:'lane',
  label:LANE_LABEL[code]||code,type:'DOMAIN',kind:'LANE',system:code,
  status:'ACTIVE',authority,parentId:ROOT_ID,domain:code,sheetTab:code==='SCIENCE'?'Science':code==='OLYMPUS'?'Olympus':'Engineering',
  source:code==='ENGINEERING'?'GitHub + runtime':SSOT_SPREADSHEET_URL,
  ssotUrl:SSOT_SPREADSHEET_URL,hiddenChildren:0,summary:LANE_SUMMARY[code]||''
 };
}

function makeDerivedDomain(tab,code,parentId){
 return{
  id:`domain:${tab}:${code}`,recordId:code,recordType:'domain',hierarchyLevel:'domain',
  label:code.replaceAll('_',' '),type:'DOMAIN',kind:'DOMAIN',system:SYSTEM_FOR_TAB[tab],
  status:'ACTIVE',authority:'derived-from-ssot',parentId,
  summary:`Domínio declarado no campo domain dos Programs da aba ${tab}.`,
  domain:code,sheetTab:tab,source:SSOT_SPREADSHEET_URL,ssotUrl:SSOT_SPREADSHEET_URL,hiddenChildren:0
 };
}

function makeOlympusGroup(group){
 return{
  id:`olympus:group:${group}`,recordId:`OLYMPUS-${group}`,recordType:'group',hierarchyLevel:'group',
  label:group,type:'DOMAIN',kind:'GROUP',system:'OLYMPUS',status:'ACTIVE',authority:'canonical',
  parentId:'lane:OLYMPUS',domain:'OLYMPUS',sheetTab:'Olympus',source:SSOT_SPREADSHEET_URL,ssotUrl:SSOT_SPREADSHEET_URL,
  hiddenChildren:0,summary:`Agrupador Olympus ${group}: separa pessoas e estados antes dos subgrafos individuais.`
 };
}

function makeOlympusPerson(row,parentId){
 const recordId=clean(row.record_id);
 return{
  id:`record:Olympus:${recordId}`,recordId,recordType:'person',hierarchyLevel:'person',
  label:clean(row.title||recordId),type:'PROGRAM',kind:'PERSON',system:'OLYMPUS',status:clean(row.status)||'UNKNOWN',
  authority:'canonical',parentId,domain:'OLYMPUS',sheetTab:'Olympus',source:SSOT_SPREADSHEET_URL,ssotUrl:SSOT_SPREADSHEET_URL,
  hiddenChildren:0,summary:clean(row.detail)||'Pessoa/cliente Olympus.',detail:clean(row.detail),olympusGroup:parentId.replace('olympus:group:','')
 };
}

function makeOlympusState(row,parentId){
 const recordId=clean(row.record_id);
 return{
  id:`record:Olympus:${recordId}:state:${clean(row.title||row.status||'STATE').replace(/[^A-Za-z0-9_-]+/g,'_')}`,
  recordId:`${recordId}:STATE`,recordType:'state',hierarchyLevel:'state',
  label:clean(row.title||row.status||'Estado atual'),type:'CAMPAIGN',kind:'STATE',system:'OLYMPUS',status:clean(row.status)||'UNKNOWN',
  authority:'canonical',parentId,domain:'OLYMPUS',sheetTab:'Olympus',source:SSOT_SPREADSHEET_URL,ssotUrl:SSOT_SPREADSHEET_URL,
  hiddenChildren:0,summary:clean(row.detail||row.summary),detail:clean(row.detail||row.summary)
 };
}

/**
 * Projects the SSOT into the Atlas hierarchy:
 * NEXO -> Ciência/Olympus/Engenharia -> local subgraphs.
 * Filamentos alternativos are emitted as separate overlay edges. They cross-link
 * domains without changing the hierarchy, because learning is not a fourth drawer
 * called Misc, thank the tiny remaining dignity of information architecture.
 */
export function rowsToGraph(rowsByTab={},meta={}){
 const root={
  id:ROOT_ID,recordId:'NEXO',label:'NEXO',type:'SYSTEM',kind:'SYSTEM',hierarchyLevel:'root',
  system:'NEXO',status:'ACTIVE',authority:'canonical',source:SSOT_SPREADSHEET_URL,
  sheetTab:'NEXO',ssotUrl:SSOT_SPREADSHEET_URL,hiddenChildren:0,
  summary:'Núcleo operacional. O primeiro nível separa Ciência, Olympus e Engenharia; subgrafos são abertos progressivamente.'
 };
 const nodes=[root];
 const edges=[];
 const connect=(parentId,node,edgeExtra={})=>{nodes.push(node);edges.push({id:`edge:${parentId}:${node.id}`,source:parentId,target:node.id,kind:'canonical',authority:node.authority||'canonical',...edgeExtra})};
 const connectExisting=(source,target,edge)=>{if(source&&target)edges.push({id:edge.id||`edge:${source}:${target}:${edge.kind||'derived'}`,source,target,...edge})};

 const lanes=['SCIENCE','OLYMPUS','ENGINEERING'].map(makeLane);
 for(const lane of lanes)connect(ROOT_ID,lane);

 const rows=[];
 for(const tab of HIERARCHY_TABS)for(const row of asArray(rowsByTab[tab])){const parsed=hierarchyRow(tab,row);if(parsed)rows.push(parsed)}
 const seen=new Set();
 const unique=rows.filter(row=>{const key=`${row.tab}:${row.recordId}`;if(seen.has(key))return false;seen.add(key);return true});

 const primaryProgramByCampaign=new Map(
  asArray(rowsByTab.Relations)
   .filter(r=>clean(r.relation_type)==='PRIMARY_PROGRAM'&&(clean(r.status)||'ACTIVE').toUpperCase()==='ACTIVE')
   .map(r=>[clean(r.source_entity),clean(r.target_entity)])
   .filter(([campaign,program])=>campaign&&program)
 );

 const domainIdByCode=new Map();
 const nodeIdByRecord=new Map();
 const registerRecord=node=>{if(node.recordId)nodeIdByRecord.set(node.recordId,node.id)};
 lanes.forEach(registerRecord);

 for(const row of unique.filter(r=>r.level==='domain')){
  const parentId=LANE_BY_TAB[row.tab]||ROOT_ID;
  const node=makeNode(row,{parentId});
  connect(parentId,node);
  domainIdByCode.set(`${row.tab}:${row.recordId}`,node.id);
  registerRecord(node);
 }

 // A Program declares its Domain either by parent_id or by the domain column; when
 // the SSOT has no domain row for that code the domain node is derived from it.
 for(const row of unique.filter(r=>r.level==='program')){
  const declared=row.parentRecordId&&nodeIdByRecord.get(row.parentRecordId);
  let parentId=declared;
  if(!parentId){
   const code=row.domainCode||'UNASSIGNED';
   const key=`${row.tab}:${code}`;
   if(!domainIdByCode.has(key)){
    const derived=makeDerivedDomain(row.tab,code,LANE_BY_TAB[row.tab]||ROOT_ID);
    connect(derived.parentId,derived);
    domainIdByCode.set(key,derived.id);
    registerRecord(derived);
   }
   parentId=domainIdByCode.get(key);
  }
  const node=makeNode(row,{parentId});
  connect(parentId,node);
  registerRecord(node);
 }

 for(const row of unique.filter(r=>r.level==='campaign')){
  const declared=row.parentRecordId||primaryProgramByCampaign.get(row.recordId)||'';
  const parentId=nodeIdByRecord.get(declared);
  const fallback=LANE_BY_TAB[row.tab]||ROOT_ID;
  const node=makeNode(row,{parentId:parentId||fallback,extra:{primaryProgramId:declared,hierarchyOrphan:!parentId}});
  connect(node.parentId,node);
  registerRecord(node);
 }

 // Olympus is not a cosmology hierarchy. Keep its macro lane and then split people
 // by real method tier before showing individual subgraphs.
 const groupIds=new Map();
 for(const group of OLYMPUS_GROUPS){
  const node=makeOlympusGroup(group);
  connect('lane:OLYMPUS',node);
  groupIds.set(group,node.id);
  registerRecord(node);
 }
 const olympusPeople=new Map();
 for(const row of asArray(rowsByTab.Olympus).filter(row=>clean(row.record_type).toLowerCase()==='person')){
  const group=upper(row.detail)||'LITE';
  const parentId=groupIds.get(group)||groupIds.get('LITE');
  const node=makeOlympusPerson(row,parentId);
  connect(parentId,node);
  olympusPeople.set(node.recordId,node.id);
  registerRecord(node);
 }
 for(const row of asArray(rowsByTab.Olympus).filter(row=>clean(row.record_type).toLowerCase()==='state')){
  const parentId=olympusPeople.get(clean(row.record_id));
  if(!parentId)continue;
  const node=makeOlympusState(row,parentId);
  connect(parentId,node);
  registerRecord(node);
 }

 // Engineering may be sparse in the spreadsheet because GitHub/runtime are its truth
 // owner. These stable subsystem nodes make that boundary visible without pretending
 // the sheet is the source of runtime truth.
 const engineeringChildren=[
  ['engineering:atlas','Atlas','Frontend, Graph Lab, cockpit e visualização.'],
  ['engineering:runtime','Runtime','Runtimes, logs, readbacks e execução material.'],
  ['engineering:deploy','Deploy','Vercel, CDN pinning, aliases e produção.'],
  ['engineering:automations','Automations','Automações NEXO e rotinas recorrentes.'],
  ['engineering:integrity','Integrity','Integridade, blockers, rollback e quality gates.']
 ];
 for(const [id,label,summary] of engineeringChildren){
  const node={id,recordId:id.replace('engineering:','ENG-').toUpperCase(),recordType:'project',hierarchyLevel:'project',label,type:'PROGRAM',kind:'PROJECT',system:'ENGINEERING',status:'ACTIVE',authority:'runtime-github',parentId:'lane:ENGINEERING',domain:'ENGINEERING',sheetTab:'Engineering',source:'GitHub + runtime',ssotUrl:SSOT_SPREADSHEET_URL,hiddenChildren:0,summary};
  connect('lane:ENGINEERING',node,{authority:'runtime-github'});
  registerRecord(node);
 }

 const findRecord=id=>nodeIdByRecord.get(id);
 const sourceValidation=findRecord('PROG-SCIENTIFIC-VALIDATION')||'domain:Science:VALIDATION'||'lane:SCIENCE';
 const olympusLane='lane:OLYMPUS';
 const engineeringLane='lane:ENGINEERING';
 const scienceLane='lane:SCIENCE';
 connectExisting(scienceLane,olympusLane,{kind:'alternative-learning',type:'ALTERNATIVE_FILAMENT',alternative:true,status:'SUPPORTED',title:'Null models e auditoria aplicados ao Olympus',summary:'Transferência interdomínio: usar null model e leitura de falso progresso antes de interpretar check-ins corporais.'});
 connectExisting(sourceValidation,olympusLane,{kind:'alternative-transfer',type:'ALTERNATIVE_FILAMENT',alternative:true,status:'SUPPORTED',title:'Validation → Olympus',summary:'Validação científica vira heurística operacional para recomposição, evolução e check-ins.'});
 connectExisting(engineeringLane,scienceLane,{kind:'alternative-validation',type:'ALTERNATIVE_FILAMENT',alternative:true,status:'SUPPORTED',title:'Runtime/readback → Ciência',summary:'Quality gates, CI e readback protegem claims e execução científica.'});
 connectExisting(engineeringLane,olympusLane,{kind:'alternative-learning',type:'ALTERNATIVE_FILAMENT',alternative:true,status:'CANDIDATE',title:'Automação → Olympus',summary:'Rotinas e lembretes podem reduzir perda de check-in e atraso de ajuste.'});

 const childCounts=new Map();
 for(const edge of edges.filter(edge=>!edge.alternative))childCounts.set(edge.source,(childCounts.get(edge.source)||0)+1);
 for(const node of nodes)node.hiddenChildren=childCounts.get(node.id)||0;

 const graph={
  rootId:ROOT_ID,nodes,edges,
  alternativeFilamentsDefault:true,
  live:extractLiveState(rowsByTab),
  source:{kind:meta.kind||'drive-ssot',spreadsheetId:SSOT_SPREADSHEET_ID,url:SSOT_SPREADSHEET_URL,tabs:[...SSOT_TABS]}
 };
 return attachOperations(graph,rowsByTab,{
  authority:meta.kind==='drive-ssot-snapshot'?'drive-ssot-projection':'drive-ssot',
  projection:meta.projection||'',generatedAt:meta.generatedAt||''
 });
}

export {statusTone};

function queryUrl(tab,handler){const params=new URLSearchParams({sheet:tab,tqx:`responseHandler:${handler}`});return `https://docs.google.com/spreadsheets/d/${SSOT_SPREADSHEET_ID}/gviz/tq?${params}`}

export function loadSsotTab(tab,{timeoutMs=9000,documentRef=globalThis.document,windowRef=globalThis}={}){
 if(![...SSOT_TABS,...SSOT_OPTIONAL_TABS].includes(tab))return Promise.reject(new Error(`Unknown SSOT tab: ${tab}`));
 if(!documentRef?.createElement)return Promise.reject(new Error('Browser document is required to read the private Drive SSOT.'));
 return new Promise((resolve,reject)=>{const handler=`__nexoSsot_${tab}_${Date.now()}_${Math.random().toString(36).slice(2)}`;const script=documentRef.createElement('script');let settled=false;const cleanup=()=>{try{delete windowRef[handler]}catch{};script.remove?.();clearTimeout(timer)};const finish=(fn,value)=>{if(settled)return;settled=true;cleanup();fn(value)};windowRef[handler]=response=>{if(response?.status==='error')return finish(reject,new Error(response.errors?.[0]?.detailed_message||`Drive SSOT query failed for ${tab}`));finish(resolve,gvizTableToRows(response?.table))};script.async=true;script.referrerPolicy='no-referrer-when-downgrade';script.onerror=()=>finish(reject,new Error(`Drive SSOT could not be loaded for ${tab}. Google authentication or browser privacy policy may have blocked the request.`));script.src=queryUrl(tab,handler);const timer=setTimeout(()=>finish(reject,new Error(`Drive SSOT timed out for ${tab}.`)),timeoutMs);(documentRef.head||documentRef.documentElement).appendChild(script);});
}

export async function loadSsotGraph(options={}){
 const required=await Promise.all(SSOT_TABS.map(async tab=>[tab,await loadSsotTab(tab,options)]));
 const optional=await Promise.all(SSOT_OPTIONAL_TABS.map(async tab=>{try{return[tab,await loadSsotTab(tab,options)]}catch{return[tab,[]]}}));
 return rowsToGraph(Object.fromEntries([...required,...optional]),{kind:'drive-ssot',projection:'live'});
}

export async function loadSsotSnapshot({fetchRef=globalThis.fetch,url=SSOT_SNAPSHOT_URL,hierarchyUrl=SSOT_HIERARCHY_SNAPSHOT_URL}={}){
 if(typeof fetchRef!=='function')throw new Error('Fetch is required to load SSOT snapshot.');
 const [response,hierarchyResponse]=await Promise.all([fetchRef(url,{cache:'no-store'}),fetchRef(hierarchyUrl,{cache:'no-store'})]);
 if(!response?.ok)throw new Error(`SSOT snapshot HTTP ${response?.status||'ERR'}`);
 if(!hierarchyResponse?.ok)throw new Error(`SSOT hierarchy snapshot HTTP ${hierarchyResponse?.status||'ERR'}`);
 const [snapshot,hierarchy]=await Promise.all([response.json(),hierarchyResponse.json()]);
 for(const candidate of [snapshot,hierarchy])if(candidate?.authority!=='drive-ssot-projection'||candidate?.spreadsheet_id!==SSOT_SPREADSHEET_ID)throw new Error('Invalid SSOT snapshot authority or spreadsheet id.');
 const scienceById=new Map();
 for(const row of [...(snapshot.tabs?.Science||[]),...(hierarchy.tabs?.Science||[])]){const id=clean(row.record_id);if(id)scienceById.set(id,row)}
 const tabs={...(snapshot.tabs||{}),Science:[...scienceById.values()],Relations:hierarchy.tabs?.Relations||snapshot.tabs?.Relations||[]};
 const graph=rowsToGraph(tabs,{
  kind:'drive-ssot-snapshot',
  projection:clean(hierarchy.projection||snapshot.projection),
  generatedAt:clean(hierarchy.generated_at||snapshot.generated_at)
 });
 graph.source={...graph.source,kind:'drive-ssot-snapshot',generatedAt:clean(hierarchy.generated_at||snapshot.generated_at),projection:clean(hierarchy.projection||snapshot.projection)};
 return graph;
}