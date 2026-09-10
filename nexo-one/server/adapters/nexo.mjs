import {createHash} from 'node:crypto';
import {json,requireEnv,item,ProviderError} from './http.mjs';
import {googleToken} from './google.mjs';

const REQUIRED_HEADERS=['record_type','record_id','status','title','detail','source','updated_at'];

function sheetUrl(id){
  if(typeof id!=='string'||!id||!/^[A-Za-z0-9_-]+$/.test(id))throw new ProviderError('AUTH_REQUIRED');
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

function normalizedRevision(items){
  const semantic=items.map(x=>({id:x.id,title:x.title,status:x.status||'',authority:x.authority,observedAt:x.observedAt,summary:x.summary||''}));
  return createHash('sha256').update(JSON.stringify(semantic)).digest('hex');
}

function normalizeSheet(data,{id,now}){
  if(!Array.isArray(data.values)||!Array.isArray(data.values[0]))throw new ProviderError('UNAVAILABLE');
  const headers=data.values[0].map(x=>String(x||'').trim());
  if(REQUIRED_HEADERS.some(name=>!headers.includes(name)))throw new ProviderError('UNAVAILABLE');
  const index=Object.fromEntries(headers.map((name,i)=>[name,i]));
  const sourceRef=sheetUrl(id),readAt=Number.isFinite(now)?now:Date.now(),items=[];
  for(const row of data.values.slice(1)){
    if(!Array.isArray(row)||row.every(value=>!String(value||'').trim()))continue;
    const get=name=>String(row[index[name]]??'').trim();
    const recordType=get('record_type'),recordId=get('record_id'),title=get('title'),status=get('status').toUpperCase(),detail=get('detail'),source=get('source'),updatedRaw=get('updated_at');
    const updatedMs=Date.parse(updatedRaw);
    if(!recordType||!recordId||!title||!Number.isFinite(updatedMs))throw new ProviderError('UNAVAILABLE');
    const normalized=item('nexo',`${recordType}:${recordId}`,title,sourceRef,readAt,{
      kind:recordType==='action'?'ACTION':'ENTITY',
      contextId:'NEXO',
      authority:source==='NEXO · SSOT CANONICAL'?'CANONICAL':'DERIVED',
      summary:[detail,source].filter(Boolean).join(' · '),
      ...(status==='BLOCKED'?{status:'BLOCKED'}:{}),
      sourceRevision:new Date(updatedMs).toISOString()
    });
    const observedAt=new Date(updatedMs).toISOString();
    normalized.observedAt=observedAt;
    normalized.freshness={...normalized.freshness,state:'SNAPSHOT',observedAt};
    items.push(normalized);
  }
  return {items,revision:normalizedRevision(items),partial:data.values.length>=1000};
}

async function nexoSheet({env,signal,now}){
  requireEnv(env,'NEXO_SHEET_ID');
  const token=await googleToken(env,signal),range=env.NEXO_SHEET_RANGE||'NEXO!A1:H1000';
  const data=await json(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.NEXO_SHEET_ID)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,{token,signal});
  return normalizeSheet(data,{id:env.NEXO_SHEET_ID,now});
}

export async function nexo({env,signal,now}) {
  if(env.NEXO_SHEET_ID)return nexoSheet({env,signal,now});
  requireEnv(env,'NEXO_SOURCE_URL');
  const data=await json(env.NEXO_SOURCE_URL,{token:env.NEXO_SOURCE_TOKEN,signal});
  if(data.version!=='1'||typeof data.revision!=='string'||!Array.isArray(data.items)) throw new ProviderError('UNAVAILABLE');
  // The owner supplies provenance and observation time. Never re-stamp old canonical data as LIVE.
  return {items:data.items,revision:data.revision,partial:!!data.partial};
}
