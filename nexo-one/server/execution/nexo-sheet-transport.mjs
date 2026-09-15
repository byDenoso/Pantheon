import {googleToken} from '../adapters/google.mjs';
import {GOOGLE_WRITE_SCOPES} from '../adapters/connect.mjs';
import {json,ProviderError,requireEnv} from '../adapters/http.mjs';

const HEADERS=['record_type','record_id','status','title','detail','payload_json','source','updated_at'];
const text=value=>String(value??'').trim();

function normalize(data){
  if(!Array.isArray(data?.values)||!Array.isArray(data.values[0]))throw new ProviderError('UNAVAILABLE');
  const headers=data.values[0].map(text);if(HEADERS.some(name=>!headers.includes(name)))throw new ProviderError('UNAVAILABLE');
  const index=Object.fromEntries(headers.map((name,i)=>[name,i]));
  return data.values.slice(1).map((values,i)=>({values,rowNumber:i+2})).filter(({values})=>Array.isArray(values)&&values.some(value=>text(value))).map(({values,rowNumber})=>({...Object.fromEntries(HEADERS.map(name=>[name,text(values[index[name]])])),rowNumber}));
}
const values=record=>HEADERS.map(name=>record[name]??'');

export function createNexoSheetTransport({env=process.env,signal}={}){
  requireEnv(env,'NEXO_SHEET_ID');
  const id=encodeURIComponent(env.NEXO_SHEET_ID),base=`https://sheets.googleapis.com/v4/spreadsheets/${id}/values`;
  let tokenPromise=null;
  const token=()=>tokenPromise||(tokenPromise=googleToken(env,signal,{scopes:GOOGLE_WRITE_SCOPES.sheets}));
  return {
    async list(){const access=await token();return normalize(await json(`${base}/${encodeURIComponent('NEXO!A1:H5000')}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,{token:access,signal}));},
    async append(record){const access=await token();await json(`${base}/${encodeURIComponent('NEXO!A:H')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{token:access,signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[values(record)]})});},
    async replace(rowNumber,record){const access=await token();await json(`${base}/${encodeURIComponent(`NEXO!A${rowNumber}:H${rowNumber}`)}?valueInputOption=RAW`,{token:access,signal,method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[values(record)]})});}
  };
}
