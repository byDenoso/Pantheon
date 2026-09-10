import {attachOperations,extractLiveState,statusTone} from './operations.mjs';

export const SSOT_SPREADSHEET_ID='1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY';
export const SSOT_TABS=['Science','Relations','Olympus','NEXO'];
// Read when the sheet exposes them; their absence must never fail the canonical read.
export const SSOT_OPTIONAL_TABS=['Engineering','CrossDomain','StructuralLearning'];
export const SSOT_SPREADSHEET_URL=`https://docs.google.com/spreadsheets/d/${SSOT_SPREADSHEET_ID}/edit`;
export const SSOT_SNAPSHOT_URL=new URL('./ssot.snapshot.json',import.meta.url).href;
export const SSOT_HIERARCHY_SNAPSHOT_URL=new URL('./ssot.hierarchy.snapshot.json',import.meta.url).href;

export const ROOT_ID='system:NEXO';
const HIERARCHY_TABS=['Science','Engineering','Olympus'];
const SYSTEM_FOR_TAB={Science:'SCIENCE',Engineering:'ENGINEERING',Olympus:'OLYMPUS',NEXO:'NEXO'};
const TYPE_FOR_LEVEL={domain:'DOMAIN',program:'PROGRAM',campaign:'CAMPAIGN'};

const text=v=>v==null?'':String(v);
const clean=v=>text(v).trim();
const upper=v=>clean(v).toUpperCase();
const cellValue=cell=>cell?.v==null?'':String(cell.v);
const asArray=value=>Array.isArray(value)?value:value&&typeof value==='object'?[value]:[];
const parseJson=value=>{try{return value?JSON.parse(value):{}}catch{return{}}};

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
 const payload=parseJson(row.payload_json);
 return{
  tab,level,recordId,
  parentRecordId:clean(row.parent_id||payload.parent_id),
  domainCode:clean(row.domain||payload.domain),
  label:clean(row.title||recordId),
  status:clean(row.status)||'UNKNOWN',
  summary:clean(row.summary||row.detail||payload.summary),
  detail:clean(row.detail||payload.detail),
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

const isActiveRelation=row=>(upper(row.status)||'ACTIVE')==='ACTIVE';
const isLearningFilament=row=>/^LEARNING_FILAMENT/.test(upper(row.relation_type));

function attachRelationFilaments({rowsByTab,edges,nodeIdByRecord}){
 const rows=asArray(rowsByTab.Relations).filter(row=>isActiveRelation(row)&&isLearningFilament(row));
 const seen=new Set(edges.map(edge=>edge.id));
 for(const row of rows){
  const id=clean(row.relation_id);
  const sourceRecord=clean(row.source_entity);
  const targetRecord=clean(row.target_entity);
  const source=nodeIdByRecord.get(sourceRecord);
  const target=nodeIdByRecord.get(targetRecord);
  if(!id||!source||!target)continue;
  const edgeId=`filament:${id}`;
  if(seen.has(edgeId))continue;
  seen.add(edgeId);
  edges.push({
   id:edgeId,source,target,kind:'learning_filament',authority:'ssot-relation-projection',
   relationId:id,relationType:clean(row.relation_type),status:clean(row.status)||'ACTIVE',
   tone:'filament',sourceDomain:clean(row.source_domain),targetDomain:clean(row.target_domain),
   confidence:clean(row.confidence),supportCount:clean(row.support_count),contradictCount:clean(row.contradict_count),
   provenance:clean(row.provenance),updatedAt:clean(row.updated_at),summary:clean(row.notes)
  });
 }
}

/**
 * Projects the SSOT into the one Atlas hierarchy: NEXO -> Domain -> Program -> Campaign.
 *
 * Parenting is only ever what the SSOT declares — an explicit `parent_id`, the
 * `domain` column of a Program, or a PRIMARY_PROGRAM relation for a Campaign.
 * Records outside those three levels are not turned into graph nodes; they reach the
 * cockpit through attachOperations as read-only context.
 */
export function rowsToGraph(rowsByTab={},meta={}){
 const root={
  id:ROOT_ID,recordId:'NEXO',label:'NEXO',type:'SYSTEM',kind:'SYSTEM',hierarchyLevel:'root',
  system:'NEXO',status:'ACTIVE',authority:'canonical',source:SSOT_SPREADSHEET_URL,
  sheetTab:'NEXO',ssotUrl:SSOT_SPREADSHEET_URL,hiddenChildren:0,
  summary:'Núcleo operacional. Domínios, Programs e Campaigns são projeções diretas do NEXO · SSOT CANONICAL.'
 };
 const nodes=[root];
 const edges=[];
 const connect=(parentId,node)=>{nodes.push(node);edges.push({id:`edge:${parentId}:${node.id}`,source:parentId,target:node.id,kind:'canonical',authority:'canonical'})};

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

 for(const row of unique.filter(r=>r.level==='domain')){
  const node=makeNode(row,{parentId:ROOT_ID});
  connect(ROOT_ID,node);
  domainIdByCode.set(`${row.tab}:${row.recordId}`,node.id);
  nodeIdByRecord.set(row.recordId,node.id);
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
    const derived={
     id:`domain:${row.tab}:${code}`,recordId:code,recordType:'domain',hierarchyLevel:'domain',
     label:code.replaceAll('_',' '),type:'DOMAIN',kind:'DOMAIN',system:SYSTEM_FOR_TAB[row.tab],
     status:'ACTIVE',authority:'derived-from-ssot',parentId:ROOT_ID,
     summary:`Domínio declarado no campo domain dos Programs da aba ${row.tab}.`,
     domain:code,sheetTab:row.tab,source:SSOT_SPREADSHEET_URL,ssotUrl:SSOT_SPREADSHEET_URL,hiddenChildren:0
    };
    connect(ROOT_ID,derived);
    domainIdByCode.set(key,derived.id);
   }
   parentId=domainIdByCode.get(key);
  }
  const node=makeNode(row,{parentId});
  connect(parentId,node);
  nodeIdByRecord.set(row.recordId,node.id);
 }

 for(const row of unique.filter(r=>r.level==='campaign')){
  const declared=row.parentRecordId||primaryProgramByCampaign.get(row.recordId)||'';
  const parentId=nodeIdByRecord.get(declared);
  const node=makeNode(row,{
   parentId:parentId||ROOT_ID,
   extra:{primaryProgramId:declared,hierarchyOrphan:!parentId}
  });
  connect(node.parentId,node);
  nodeIdByRecord.set(row.recordId,node.id);
 }

 attachRelationFilaments({rowsByTab,edges,nodeIdByRecord});

 const childCounts=new Map();
 for(const edge of edges.filter(edge=>edge.kind==='canonical'))childCounts.set(edge.source,(childCounts.get(edge.source)||0)+1);
 for(const node of nodes)node.hiddenChildren=childCounts.get(node.id)||0;

 const graph={
  rootId:ROOT_ID,nodes,edges,
  live:extractLiveState(rowsByTab),
  source:{kind:meta.kind||'drive-ssot',spreadsheetId:SSOT_SPREADSHEET_ID,url:SSOT_SPREADSHEET_URL,tabs:[...SSOT_TABS,...SSOT_OPTIONAL_TABS]}
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
 const tabs={
  ...(snapshot.tabs||{}),
  ...(hierarchy.tabs||{}),
  Science:[...scienceById.values()],
  Relations:hierarchy.tabs?.Relations||snapshot.tabs?.Relations||[]
 };
 const graph=rowsToGraph(tabs,{
  kind:'drive-ssot-snapshot',
  projection:clean(hierarchy.projection||snapshot.projection),
  generatedAt:clean(hierarchy.generated_at||snapshot.generated_at)
 });
 graph.source={...graph.source,kind:'drive-ssot-snapshot',generatedAt:clean(hierarchy.generated_at||snapshot.generated_at),projection:clean(hierarchy.projection||snapshot.projection)};
 return graph;
}
