export const SSOT_SPREADSHEET_ID='1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY';
export const SSOT_TABS=['Science','Relations','Olympus','NEXO'];
export const SSOT_SPREADSHEET_URL=`https://docs.google.com/spreadsheets/d/${SSOT_SPREADSHEET_ID}/edit`;
export const SSOT_SNAPSHOT_URL=new URL('./ssot.snapshot.json',import.meta.url).href;
export const SSOT_HIERARCHY_SNAPSHOT_URL=new URL('./ssot.hierarchy.snapshot.json',import.meta.url).href;

const SYSTEM_FOR_TAB={Science:'SCIENCE',Olympus:'OLYMPUS',NEXO:'NEXO'};
const TYPE_FOR_RECORD={program:'PROGRAM',campaign:'CAMPAIGN',paper:'RESULT',current_test:'TEST',running_test:'TEST',blocked_test:'TEST',open_test:'TEST',open_gate:'TEST',truth:'DOMAIN',state:'TEST',action:'TEST',objective:'TEST',policy:'TEST',strategy:'TEST',lesson:'TEST',rule:'TEST',person:'TEST'};
const SCIENCE_GRAPH_TYPES=new Set(['program','campaign']);
const text=v=>v==null?'':String(v);
const cellValue=cell=>cell?.v==null?'':String(cell.v);

export function gvizTableToRows(table){
 if(!table?.cols||!Array.isArray(table.rows))return[];
 const headers=table.cols.map((col,i)=>text(col.label||col.id||`col_${i}`).trim());
 return table.rows.map(row=>{const out={};headers.forEach((key,i)=>{if(key)out[key]=cellValue(row.c?.[i])});return out}).filter(row=>row.record_id||row.record_type||row.relation_id||row.title);
}

export function rowsToGraph(rowsByTab){
 const nodes=[{id:'system:NEXO',label:'NEXO',type:'SYSTEM',kind:'SYSTEM',system:'NEXO',status:'ACTIVE',authority:'canonical',source:SSOT_SPREADSHEET_URL,hiddenChildren:0}];
 const edges=[];
 for(const system of ['SCIENCE','OLYMPUS']){
  nodes.push({id:`system:${system}`,label:system,type:'SYSTEM',kind:'SYSTEM',system,status:'ACTIVE',authority:'canonical',parentId:'system:NEXO',source:SSOT_SPREADSHEET_URL,hiddenChildren:0});
  edges.push({id:`edge:system:NEXO:${system}`,source:'system:NEXO',target:`system:${system}`,kind:'canonical',authority:'canonical'});
 }
 const seen=new Set(nodes.map(n=>n.id));
 const nodeIdByScienceRecord=new Map();
 const primaryProgramByCampaign=new Map(
  (rowsByTab?.Relations||[])
   .filter(r=>text(r.relation_type).trim()==='PRIMARY_PROGRAM'&&text(r.status||'ACTIVE').trim().toUpperCase()==='ACTIVE')
   .map(r=>[text(r.source_entity).trim(),text(r.target_entity).trim()])
   .filter(([campaign,program])=>campaign&&program)
 );
 const addNode=(tab,row,parentId,system)=>{
  const recordId=text(row.record_id).trim();if(!recordId)return null;
  const recordType=text(row.record_type).trim();
  const baseId=`record:${tab}:${recordId}`;
  const id=seen.has(baseId)?`${baseId}:${recordType||'record'}`:baseId;
  if(seen.has(id))return null;seen.add(id);
  const node={id,recordId,recordType,label:text(row.title||recordId),type:TYPE_FOR_RECORD[recordType]||'TEST',system,status:text(row.status||'UNKNOWN'),authority:'canonical',parentId,detail:text(row.detail||row.summary),payloadJson:text(row.payload_json),source:text(row.source||row.source_ref),updatedAt:text(row.updated_at),domain:text(row.domain),sheetTab:tab,ssotUrl:SSOT_SPREADSHEET_URL,hiddenChildren:0};
  nodes.push(node);edges.push({id:`edge:${parentId}:${id}`,source:parentId,target:id,kind:'canonical',authority:'canonical'});return node;
 };
 const scienceRows=(rowsByTab?.Science||[]).filter(r=>SCIENCE_GRAPH_TYPES.has(text(r.record_type).trim()));
 const programRows=scienceRows.filter(r=>text(r.record_type).trim()==='program');
 const domainNodeByCode=new Map();
 for(const row of programRows){
  const domainCode=text(row.domain).trim()||'UNASSIGNED';
  if(domainNodeByCode.has(domainCode))continue;
  const id=`domain:Science:${domainCode}`;
  const domainNode={id,recordId:domainCode,recordType:'domain',label:domainCode.replaceAll('_',' '),type:'DOMAIN',kind:'DOMAIN',hierarchyLevel:'domain',system:'SCIENCE',status:'ACTIVE',authority:'derived-from-ssot',parentId:'system:SCIENCE',source:SSOT_SPREADSHEET_URL,sheetTab:'Science',ssotUrl:SSOT_SPREADSHEET_URL,hiddenChildren:0};
  nodes.push(domainNode);seen.add(id);domainNodeByCode.set(domainCode,id);edges.push({id:`edge:system:SCIENCE:${id}`,source:'system:SCIENCE',target:id,kind:'canonical',authority:'canonical'});
 }
 for(const row of programRows){
  const domainCode=text(row.domain).trim()||'UNASSIGNED';
  const node=addNode('Science',row,domainNodeByCode.get(domainCode),'SCIENCE');if(node){node.hierarchyLevel='program';nodeIdByScienceRecord.set(node.recordId,node.id);}
 }
 for(const row of scienceRows.filter(r=>text(r.record_type).trim()==='campaign')){
  const recordId=text(row.record_id).trim();const programId=primaryProgramByCampaign.get(recordId);const parentId=nodeIdByScienceRecord.get(programId)||'system:SCIENCE';
  const node=addNode('Science',row,parentId,'SCIENCE');if(node){node.hierarchyLevel='campaign';node.primaryProgramId=programId||'';node.hierarchyOrphan=!nodeIdByScienceRecord.has(programId);nodeIdByScienceRecord.set(node.recordId,node.id);}
 }
 for(const tab of ['Olympus','NEXO']){
  const system=SYSTEM_FOR_TAB[tab];const parentId=system==='NEXO'?'system:NEXO':`system:${system}`;
  for(const row of rowsByTab?.[tab]||[])addNode(tab,row,parentId,system);
 }
 const childCounts=new Map();for(const edge of edges)childCounts.set(edge.source,(childCounts.get(edge.source)||0)+1);for(const node of nodes)node.hiddenChildren=childCounts.get(node.id)||0;
 return{rootId:'system:NEXO',nodes,edges,source:{kind:'drive-ssot',spreadsheetId:SSOT_SPREADSHEET_ID,url:SSOT_SPREADSHEET_URL,tabs:[...SSOT_TABS]}};
}

function queryUrl(tab,handler){const params=new URLSearchParams({sheet:tab,tqx:`responseHandler:${handler}`});return `https://docs.google.com/spreadsheets/d/${SSOT_SPREADSHEET_ID}/gviz/tq?${params}`}
export function loadSsotTab(tab,{timeoutMs=9000,documentRef=globalThis.document,windowRef=globalThis}={}){
 if(!SSOT_TABS.includes(tab))return Promise.reject(new Error(`Unknown SSOT tab: ${tab}`));
 if(!documentRef?.createElement)return Promise.reject(new Error('Browser document is required to read the private Drive SSOT.'));
 return new Promise((resolve,reject)=>{const handler=`__nexoSsot_${tab}_${Date.now()}_${Math.random().toString(36).slice(2)}`;const script=documentRef.createElement('script');let settled=false;const cleanup=()=>{try{delete windowRef[handler]}catch{};script.remove?.();clearTimeout(timer)};const finish=(fn,value)=>{if(settled)return;settled=true;cleanup();fn(value)};windowRef[handler]=response=>{if(response?.status==='error')return finish(reject,new Error(response.errors?.[0]?.detailed_message||`Drive SSOT query failed for ${tab}`));finish(resolve,gvizTableToRows(response?.table))};script.async=true;script.referrerPolicy='no-referrer-when-downgrade';script.onerror=()=>finish(reject,new Error(`Drive SSOT could not be loaded for ${tab}. Google authentication or browser privacy policy may have blocked the request.`));script.src=queryUrl(tab,handler);const timer=setTimeout(()=>finish(reject,new Error(`Drive SSOT timed out for ${tab}.`)),timeoutMs);(documentRef.head||documentRef.documentElement).appendChild(script);});
}
export async function loadSsotGraph(options={}){const entries=await Promise.all(SSOT_TABS.map(async tab=>[tab,await loadSsotTab(tab,options)]));return rowsToGraph(Object.fromEntries(entries))}
export async function loadSsotSnapshot({fetchRef=globalThis.fetch,url=SSOT_SNAPSHOT_URL,hierarchyUrl=SSOT_HIERARCHY_SNAPSHOT_URL}={}){
 if(typeof fetchRef!=='function')throw new Error('Fetch is required to load SSOT snapshot.');
 const [response,hierarchyResponse]=await Promise.all([fetchRef(url,{cache:'no-store'}),fetchRef(hierarchyUrl,{cache:'no-store'})]);
 if(!response?.ok)throw new Error(`SSOT snapshot HTTP ${response?.status||'ERR'}`);
 if(!hierarchyResponse?.ok)throw new Error(`SSOT hierarchy snapshot HTTP ${hierarchyResponse?.status||'ERR'}`);
 const [snapshot,hierarchy]=await Promise.all([response.json(),hierarchyResponse.json()]);
 for(const candidate of [snapshot,hierarchy])if(candidate?.authority!=='drive-ssot-projection'||candidate?.spreadsheet_id!==SSOT_SPREADSHEET_ID)throw new Error('Invalid SSOT snapshot authority or spreadsheet id.');
 const scienceById=new Map();
 for(const row of [...(snapshot.tabs?.Science||[]),...(hierarchy.tabs?.Science||[])]){const id=text(row.record_id).trim();if(id)scienceById.set(id,row)}
 const tabs={...(snapshot.tabs||{}),Science:[...scienceById.values()],Relations:hierarchy.tabs?.Relations||snapshot.tabs?.Relations||[]};
 const graph=rowsToGraph(tabs);
 graph.source={...graph.source,kind:'drive-ssot-snapshot',generatedAt:text(hierarchy.generated_at||snapshot.generated_at),projection:text(hierarchy.projection||snapshot.projection)};
 return graph;
}
