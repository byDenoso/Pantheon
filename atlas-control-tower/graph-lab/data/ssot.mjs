export const SSOT_SPREADSHEET_ID='1e6s2dKOYVLNsPUguHI85RLVLwJKtlCsQZBJ1BE-UhaY';
export const SSOT_TABS=['Science','Olympus','NEXO'];
export const SSOT_SPREADSHEET_URL=`https://docs.google.com/spreadsheets/d/${SSOT_SPREADSHEET_ID}/edit`;
export const SSOT_SNAPSHOT_URL='./data/ssot.snapshot.json';

const SYSTEM_FOR_TAB={Science:'SCIENCE',Olympus:'OLYMPUS',NEXO:'NEXO'};
const TYPE_FOR_RECORD={campaign:'CAMPAIGN',paper:'RESULT',current_test:'TEST',running_test:'TEST',blocked_test:'TEST',open_test:'TEST',open_gate:'TEST',truth:'DOMAIN',state:'TEST',action:'TEST',objective:'TEST',policy:'TEST',strategy:'TEST',lesson:'TEST',rule:'TEST',person:'TEST'};
const text=v=>v==null?'':String(v);
const cellValue=cell=>cell?.v==null?'':String(cell.v);

export function gvizTableToRows(table){
 if(!table?.cols||!Array.isArray(table.rows))return[];
 const headers=table.cols.map((col,i)=>text(col.label||col.id||`col_${i}`).trim());
 return table.rows.map(row=>{const out={};headers.forEach((key,i)=>{if(key)out[key]=cellValue(row.c?.[i])});return out}).filter(row=>row.record_id||row.record_type||row.title);
}

export function rowsToGraph(rowsByTab){
 const nodes=[{id:'system:NEXO',label:'NEXO',type:'SYSTEM',kind:'SYSTEM',system:'NEXO',status:'ACTIVE',authority:'canonical',source:SSOT_SPREADSHEET_URL,hiddenChildren:0}];
 const edges=[];
 for(const system of ['SCIENCE','OLYMPUS']){
  nodes.push({id:`system:${system}`,label:system,type:'SYSTEM',kind:'SYSTEM',system,status:'ACTIVE',authority:'canonical',parentId:'system:NEXO',source:SSOT_SPREADSHEET_URL,hiddenChildren:0});
  edges.push({id:`edge:system:NEXO:${system}`,source:'system:NEXO',target:`system:${system}`,kind:'canonical',authority:'canonical'});
 }
 const seen=new Set(nodes.map(n=>n.id));
 for(const tab of SSOT_TABS){
  const system=SYSTEM_FOR_TAB[tab];
  const parentId=system==='NEXO'?'system:NEXO':`system:${system}`;
  for(const row of rowsByTab?.[tab]||[]){
   const recordId=text(row.record_id).trim();if(!recordId)continue;
   const id=`record:${tab}:${recordId}:${text(row.record_type).trim()}`;if(seen.has(id))continue;seen.add(id);
   const recordType=text(row.record_type).trim();
   const node={id,recordId,recordType,label:text(row.title||recordId),type:TYPE_FOR_RECORD[recordType]||'TEST',system,status:text(row.status||'UNKNOWN'),authority:'canonical',parentId,detail:text(row.detail||row.summary),payloadJson:text(row.payload_json),source:text(row.source||row.source_ref),updatedAt:text(row.updated_at),domain:text(row.domain),sheetTab:tab,ssotUrl:SSOT_SPREADSHEET_URL,hiddenChildren:0};
   nodes.push(node);edges.push({id:`edge:${parentId}:${id}`,source:parentId,target:id,kind:'canonical',authority:'canonical'});
  }
 }
 const childCounts=new Map();for(const edge of edges)childCounts.set(edge.source,(childCounts.get(edge.source)||0)+1);for(const node of nodes)node.hiddenChildren=childCounts.get(node.id)||0;
 return{rootId:'system:NEXO',nodes,edges,source:{kind:'drive-ssot',spreadsheetId:SSOT_SPREADSHEET_ID,url:SSOT_SPREADSHEET_URL,tabs:[...SSOT_TABS]}};
}

function queryUrl(tab,handler){const params=new URLSearchParams({sheet:tab,tqx:`responseHandler:${handler}`});return `https://docs.google.com/spreadsheets/d/${SSOT_SPREADSHEET_ID}/gviz/tq?${params}`}

export function loadSsotTab(tab,{timeoutMs=9000,documentRef=globalThis.document,windowRef=globalThis}={}){
 if(!SSOT_TABS.includes(tab))return Promise.reject(new Error(`Unknown SSOT tab: ${tab}`));
 if(!documentRef?.createElement)return Promise.reject(new Error('Browser document is required to read the private Drive SSOT.'));
 return new Promise((resolve,reject)=>{
  const handler=`__nexoSsot_${tab}_${Date.now()}_${Math.random().toString(36).slice(2)}`;const script=documentRef.createElement('script');let settled=false;
  const cleanup=()=>{try{delete windowRef[handler]}catch{};script.remove?.();clearTimeout(timer)};const finish=(fn,value)=>{if(settled)return;settled=true;cleanup();fn(value)};
  windowRef[handler]=response=>{if(response?.status==='error')return finish(reject,new Error(response.errors?.[0]?.detailed_message||`Drive SSOT query failed for ${tab}`));finish(resolve,gvizTableToRows(response?.table))};
  script.async=true;script.referrerPolicy='no-referrer-when-downgrade';script.onerror=()=>finish(reject,new Error(`Drive SSOT could not be loaded for ${tab}. Google authentication or browser privacy policy may have blocked the request.`));script.src=queryUrl(tab,handler);
  const timer=setTimeout(()=>finish(reject,new Error(`Drive SSOT timed out for ${tab}.`)),timeoutMs);(documentRef.head||documentRef.documentElement).appendChild(script);
 });
}

export async function loadSsotGraph(options={}){const entries=await Promise.all(SSOT_TABS.map(async tab=>[tab,await loadSsotTab(tab,options)]));return rowsToGraph(Object.fromEntries(entries))}

export async function loadSsotSnapshot({fetchRef=globalThis.fetch,url=SSOT_SNAPSHOT_URL}={}){
 if(typeof fetchRef!=='function')throw new Error('Fetch is required to load SSOT snapshot.');
 const response=await fetchRef(url,{cache:'no-store'});if(!response?.ok)throw new Error(`SSOT snapshot HTTP ${response?.status||'ERR'}`);
 const snapshot=await response.json();
 if(snapshot?.authority!=='drive-ssot-projection'||snapshot?.spreadsheet_id!==SSOT_SPREADSHEET_ID)throw new Error('Invalid SSOT snapshot authority or spreadsheet id.');
 const graph=rowsToGraph(snapshot.tabs||{});graph.source={...graph.source,kind:'drive-ssot-snapshot',generatedAt:text(snapshot.generated_at),projection:text(snapshot.projection)};return graph;
}
