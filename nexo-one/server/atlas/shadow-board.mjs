// Roadmap e Mural vivem em abas simples da Tower SHADOW (planilha canônica
// para registros novos). Leitura só-leitura, escopo drive.readonly, melhor
// esforço: se falhar, o Atlas segue sem o quadro.
export const SHADOW_ID='1wizywUGEMd_8KrNqMcz5PQig3KgOTbZd8ENkTW8nRKw';
export const ROADMAP_COLUMNS=Object.freeze(['item','titulo','status','dono','prio','proximo_teste','depende_de','atualizado','nota']);
export const MURAL_COLUMNS=Object.freeze(['data','de','para','texto','link']);
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

export function tableFromCsv(text,columns){return tableFromRows(parseCsv(text),columns);}
export function tableFromRows(rows,columns){
  if(!rows.length)throw new Error('SHADOW_TAB_EMPTY');
  const header=rows[0].map(cell=>clean(cell).toLowerCase());
  const index=columns.map(name=>header.indexOf(name));
  if(index.includes(-1))throw new Error('SHADOW_HEADER_INVALID');
  return rows.slice(1).filter(row=>row.some(cell=>clean(cell)!=='')).slice(0,MAX_ROWS)
    .map(row=>Object.fromEntries(columns.map((name,k)=>[name,clean(row[index[k]])])));
}

// Duas rotas só-leitura com o mesmo token drive.readonly: gviz (CSV) e, se falhar,
// a API Sheets values.get (aceita drive.readonly). A primeira que responder vale.
async function readTabRows(sheet,range,columns,options){
  try{return tableFromCsv(await readTab(sheet,options),columns);}
  catch(first){
    const {token,fetchImpl,signal}=options;
    const response=await fetchImpl(`https://sheets.googleapis.com/v4/spreadsheets/${SHADOW_ID}/values/${encodeURIComponent(`${sheet}!${range}`)}?majorDimension=ROWS`,{headers:{Authorization:`Bearer ${token}`},redirect:'error',cache:'no-store',signal});
    if(!response.ok)throw first;
    const data=await response.json();
    return tableFromRows(Array.isArray(data?.values)?data.values:[],columns);
  }
}
async function readTab(sheet,{token,fetchImpl,signal}){
  const url=`https://docs.google.com/spreadsheets/d/${SHADOW_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
  const response=await fetchImpl(url,{headers:{Authorization:`Bearer ${token}`},redirect:'error',cache:'no-store',signal});
  if(!response.ok)throw new Error('SHADOW_TAB_UNAVAILABLE');
  const text=await response.text();
  if(text.length>2*1024*1024)throw new Error('SHADOW_TAB_TOO_LARGE');
  return text;
}

export async function readShadowBoard({token,fetchImpl=fetch,signal=AbortSignal.timeout(15000)}){
  if(!token)throw new Error('EXISTING_GOOGLE_AUTH_REQUIRED');
  const meta=await fetchImpl(`https://www.googleapis.com/drive/v3/files/${SHADOW_ID}?fields=id,modifiedTime&supportsAllDrives=true`,{headers:{Authorization:`Bearer ${token}`},redirect:'error',cache:'no-store',signal});
  if(!meta.ok)throw new Error('SHADOW_METADATA_UNAVAILABLE');
  const info=await meta.json();
  if(info.id!==SHADOW_ID)throw new Error('SHADOW_METADATA_INVALID');
  const options={token,fetchImpl,signal};
  const [roadmap,mural]=await Promise.all([readTabRows('ROADMAP','A1:I400',ROADMAP_COLUMNS,options),readTabRows('MURAL','A1:E400',MURAL_COLUMNS,options)]);
  return {contract:'NEXO_SHADOW_BOARD_V1',access:'PRIVATE',source_id:SHADOW_ID,source_ref:`https://docs.google.com/spreadsheets/d/${SHADOW_ID}/edit`,
    modified_at:typeof info.modifiedTime==='string'?info.modifiedTime:null,roadmap,mural,
    counts:{roadmap:roadmap.length,mural:mural.length}};
}

// Nunca derruba o Atlas: falha vira ausência de quadro com motivo curto.
export async function readShadowBoardSafe(options){
  try{return await readShadowBoard(options);}
  catch(error){return {contract:'NEXO_SHADOW_BOARD_V1',access:'PRIVATE',unavailable:String(error?.message||'SHADOW_UNAVAILABLE').slice(0,64),roadmap:[],mural:[],counts:{roadmap:0,mural:0}};}
}
