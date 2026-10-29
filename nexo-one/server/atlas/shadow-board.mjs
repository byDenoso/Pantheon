// Roadmap e Mural vivem em abas simples da Tower SHADOW (planilha canônica
// para registros novos). Leitura só-leitura, escopo drive.readonly, melhor
// esforço: se falhar, o Atlas segue sem o quadro.
export const SHADOW_ID='1wizywUGEMd_8KrNqMcz5PQig3KgOTbZd8ENkTW8nRKw';
export const ROADMAP_COLUMNS=Object.freeze(['item','titulo','status','dono','prio','proximo_teste','depende_de','atualizado','nota']);
export const MURAL_COLUMNS=Object.freeze(['data','de','para','texto','link']);
export const RESUMO_COLUMNS=Object.freeze(['data_hora','nivel','item','o_que_mudou','impacto','link']);
export const RESULTADOS_COLUMNS=Object.freeze(['data','task','item','titulo','resultado','numeros','limites','link_dados']);
export const EQUIPE_COLUMNS=Object.freeze(['papel','task_id','cadencia','frentes','estado']);
// Colunas opcionais: entram quando existem no cabeçalho, sem exigir migração.
const OPTIONAL={MURAL:['tipo','item','id']};
const MAX_ROWS=300,MAX_CELL=2000;
const clean=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,MAX_CELL);

export function parseCsv(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else quoted=false;}
      else cell+=ch;
    }else if(ch==='"')quoted=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';rows.push(row);row=[];}
    else cell+=ch;
  }
  if(cell!==''||row.length){row.push(cell);rows.push(row);}
  return rows;
}

export function tableFromCsv(text,columns,optional){return tableFromRows(parseCsv(text),columns,optional);}
export function tableFromRows(rows,columns,optional=[]){
  if(!rows.length)throw new Error('SHADOW_TAB_EMPTY');
  const header=rows[0].map(cell=>clean(cell).toLowerCase());
  const index=columns.map(name=>header.indexOf(name));
  if(index.includes(-1))throw new Error('SHADOW_HEADER_INVALID');
  const extra=optional.map(name=>[name,header.indexOf(name)]).filter(([,i])=>i>=0);
  // Inspect the suffix only. Preserve append order, empty-row semantics and headers.
  const selected=[];
  for(let i=rows.length-1;i>0&&selected.length<MAX_ROWS;i--){
    if(rows[i].some(cell=>clean(cell)!==''))selected.push(rows[i]);
  }
  return selected.reverse().map(row=>Object.fromEntries([
    ...columns.map((name,k)=>[name,clean(row[index[k]])]),
    ...extra.map(([name,i])=>[name,clean(row[i])]),
  ]));
}

// Duas rotas só-leitura com o mesmo token drive.readonly: gviz (CSV) e, se falhar,
// a API Sheets values.get (aceita drive.readonly). A primeira que responder vale.
async function readTabRows(sheet,range,columns,options){
  const optional=OPTIONAL[sheet]||[];
  try{return tableFromCsv(await readTab(sheet,options),columns,optional);}
  catch(first){
    const {token,fetchImpl,signal}=options;
    if(signal?.aborted||fatalReadError(first))throw first;
    const response=await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${SHADOW_ID}/values/${encodeURIComponent(`${sheet}!${range}`)}?majorDimension=ROWS`,{headers:{Authorization:`Bearer ${token}`},redirect:'error',cache:'no-store',signal});
    if(response.status===401||response.status===403){const error=new Error('SHADOW_AUTH_REQUIRED');error.code='SHADOW_AUTH_REQUIRED';throw error;}
    if(!response.ok)throw first;
    const data=await response.json();
    return tableFromRows(Array.isArray(data?.values)?data.values:[],columns,optional);
  }
}
async function readTab(sheet,{token,fetchImpl,signal}){
  const url=`https://docs.google.com/spreadsheets/d/${SHADOW_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
  const response=await fetchImpl(url,{headers:{Authorization:`Bearer ${token}`},redirect:'error',cache:'no-store',signal});
  if(response.status===401||response.status===403){const error=new Error('SHADOW_AUTH_REQUIRED');error.code='SHADOW_AUTH_REQUIRED';throw error;}
  if(!response.ok)throw new Error('SHADOW_TAB_UNAVAILABLE');
  const text=await response.text();
  if(text.length>2*1024*1024)throw new Error('SHADOW_TAB_TOO_LARGE');
  return text;
}

// Open-ended column ranges keep the newest records after row 2000.
// Optional tabs are discovered before batching so a missing tab cannot poison the batch.
const TABS=Object.freeze([
  {name:'ROADMAP',range:'A:I',columns:ROADMAP_COLUMNS,required:true},
  {name:'MURAL',range:'A:H',columns:MURAL_COLUMNS,required:true},
  {name:'RESUMO',range:'A:F',columns:RESUMO_COLUMNS},
  {name:'RESULTADOS',range:'A:J',columns:RESULTADOS_COLUMNS},
  {name:'EQUIPE',range:'A:F',columns:EQUIPE_COLUMNS},
]);
const READ_OPTIONS=(token,signal)=>({headers:{Authorization:`Bearer ${token}`},redirect:'error',cache:'no-store',signal});
const fatalReadError=error=>error?.name==='AbortError'||error?.code==='SHADOW_AUTH_REQUIRED'||
  ['SHADOW_BATCH_TOO_LARGE','SHADOW_BATCH_IDENTITY_INVALID'].includes(error?.message);

async function readSheetJson(url,options,maxBytes){
  options.signal?.throwIfAborted();
  const response=await options.fetchImpl(url,READ_OPTIONS(options.token,options.signal));
  if(response.status===401||response.status===403){
    const error=new Error('SHADOW_AUTH_REQUIRED');error.code='SHADOW_AUTH_REQUIRED';throw error;
  }
  if(!response.ok)throw new Error('SHADOW_BATCH_UNAVAILABLE');
  // The limit is checked while reading, not after allocating an unbounded body.
  const reader=response.body?.getReader();
  if(!reader)throw new Error('SHADOW_BATCH_EMPTY');
  const decoder=new TextDecoder();let text='',bytes=0;
  try{
    while(true){
      options.signal?.throwIfAborted();
      const {value,done}=await reader.read();if(done)break;
      bytes+=value.byteLength;
      if(bytes>maxBytes)throw new Error('SHADOW_BATCH_TOO_LARGE');
      text+=decoder.decode(value,{stream:true});
    }
    text+=decoder.decode();
    return JSON.parse(text);
  }catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
}
async function availableTabs(options){
  const meta=await readSheetJson(`https://sheets.googleapis.com/v4/spreadsheets/${SHADOW_ID}?fields=sheets(properties(title))&includeGridData=false`,options,128*1024);
  if(!Array.isArray(meta?.sheets))throw new Error('SHADOW_BATCH_METADATA_INVALID');
  return new Set(meta.sheets.map(sheet=>sheet?.properties?.title));
}
async function readBatchedTabs(titles,options){
  for(const tab of TABS)if(tab.required&&!titles.has(tab.name))throw new Error('SHADOW_REQUIRED_TAB_MISSING');
  const tabs=TABS.filter(tab=>titles.has(tab.name));
  const params=new URLSearchParams({majorDimension:'ROWS',valueRenderOption:'FORMATTED_VALUE'});
  for(const tab of tabs)params.append('ranges',`${tab.name}!${tab.range}`);
  const batch=await readSheetJson(`https://sheets.googleapis.com/v4/spreadsheets/${SHADOW_ID}/values:batchGet?${params}`,options,10*1024*1024);
  if(batch?.spreadsheetId!==SHADOW_ID)throw new Error('SHADOW_BATCH_IDENTITY_INVALID');
  if(!Array.isArray(batch?.valueRanges)||batch.valueRanges.length!==tabs.length)throw new Error('SHADOW_BATCH_INVALID');
  const result={roadmap:[],mural:[],resumo:[],resultados:[],equipe:[]};
  for(let i=0;i<tabs.length;i++){
    const tab=tabs[i],value=batch.valueRanges[i];
    const returnedName=String(value?.range||'').split('!')[0].replace(/^'|'$/g,'');
    if(returnedName!==tab.name||!Array.isArray(value?.values??[]))throw new Error('SHADOW_BATCH_RANGE_INVALID');
    try{result[tab.name.toLowerCase()]=tableFromRows(value.values??[],tab.columns,OPTIONAL[tab.name]);}
    catch(error){if(tab.required)throw error;}
  }
  return result;
}
async function readFallbackTabs(options){
  // One parallel group instead of two waterfalls. No fallback after cancellation.
  const values=await Promise.all(TABS.map(async tab=>{
    try{return await readTabRows(tab.name,tab.range,tab.columns,options);}
    catch(error){if(tab.required||options.signal?.aborted||fatalReadError(error))throw error;return [];}
  }));
  return Object.fromEntries(TABS.map((tab,i)=>[tab.name.toLowerCase(),values[i]]));
}

export async function readShadowBoard({token,fetchImpl=fetch,signal=AbortSignal.timeout(15000)}){
  if(!token)throw new Error('EXISTING_GOOGLE_AUTH_REQUIRED');
  signal?.throwIfAborted();
  const options={token,fetchImpl,signal};
  // Only schema metadata runs alongside canonical identity validation. No auth cache.
  const [meta,titlesResult]=await Promise.all([
    fetchImpl(`https://www.googleapis.com/drive/v3/files/${SHADOW_ID}?fields=id,modifiedTime&supportsAllDrives=true`,READ_OPTIONS(token,signal)),
    availableTabs(options).then(titles=>({titles}),error=>({error})),
  ]);
  if(!meta.ok)throw new Error('SHADOW_METADATA_UNAVAILABLE');
  const info=await meta.json();
  if(info.id!==SHADOW_ID)throw new Error('SHADOW_METADATA_INVALID');
  signal?.throwIfAborted();
  let tables;
  try{
    if(titlesResult.error)throw titlesResult.error;
    tables=await readBatchedTabs(titlesResult.titles,options);
  }catch(error){
    // Fail closed for denial/cancellation or authoritative missing required tabs.
    if(signal?.aborted||fatalReadError(error)||error?.message==='SHADOW_REQUIRED_TAB_MISSING')throw error;
    tables=await readFallbackTabs(options);
  }
  const {roadmap,mural,resumo,equipe}=tables;
  const resultados=tables.resultados.slice(-100).map(row=>({...row,numeros:row.numeros.slice(0,600),limites:row.limites.slice(0,600)}));
  return {contract:'NEXO_SHADOW_BOARD_V1',access:'PRIVATE',source_id:SHADOW_ID,source_ref:`https://docs.google.com/spreadsheets/d/${SHADOW_ID}/edit`,
    modified_at:typeof info.modifiedTime==='string'?info.modifiedTime:null,roadmap,mural,resumo,resultados,equipe,
    counts:{roadmap:roadmap.length,mural:mural.length,resumo:resumo.length,resultados:resultados.length,equipe:equipe.length}};
}

// Nunca derruba o Atlas: falha vira ausência de quadro com motivo curto.
export async function readShadowBoardSafe(options){
  try{return await readShadowBoard(options);}
  catch(error){return {contract:'NEXO_SHADOW_BOARD_V1',access:'PRIVATE',unavailable:String(error?.message||'SHADOW_UNAVAILABLE').slice(0,64),roadmap:[],mural:[],resumo:[],resultados:[],equipe:[],counts:{roadmap:0,mural:0,resumo:0,resultados:0,equipe:0}};}
}
