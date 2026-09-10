import {createHash} from 'node:crypto';
import {ActionError} from './contracts.mjs';
import {authorityProvider} from './gate.mjs';
import {googleToken} from '../adapters/google.mjs';
import {googleActionRequest} from '../adapters/google-actions.mjs';

const HEADERS=['check_id','scope','check_type','target','expected','observed','status','severity','failure_signature','remediation','readback_ref','last_checked','next_check','notes'];
const SHEETS_WRITE=['https://www.googleapis.com/auth/spreadsheets'];
const INTEGRITY_CAPABILITY='CAP-GDRIVE-INTERACTIVE-SHEET';
const enc=encodeURIComponent;

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}
function fingerprint(receipt,signature){
  const semantic={action_type:receipt.action_type,provider:receipt.provider,domain:receipt.domain,capability_id:receipt.capability_id,target_ref:receipt.target_ref,intent_fingerprint:receipt.intent_fingerprint,provider_effect_id:receipt.provider_effect_id,signature};
  return createHash('sha256').update(JSON.stringify(stable(semantic))).digest('hex').slice(0,16).toUpperCase();
}
function json(value){try{return JSON.stringify(value??null);}catch{return String(value??'');}}
function domainList(value){return String(value||'').toUpperCase().split(/[\/,;]+/).map(x=>x.trim()).filter(Boolean);}

function assertIntegrityWriteGate(truthGraphInput){
  const authority=(truthGraphInput?.authorityRows||[]).find(row=>String(row.domain||'').trim().toUpperCase()==='NEXO');
  if(!authority||authorityProvider(authority)!=='nexo')throw new ActionError('AUTHORITY_CONFLICT');
  const capability=(truthGraphInput?.capabilityRows||[]).find(row=>String(row.capability_id||'').trim()===INTEGRITY_CAPABILITY&&domainList(row.domain).includes('NEXO'));
  if(!capability||String(capability.status||'').trim().toUpperCase()!=='PASS')throw new ActionError('CAPABILITY_BLOCKED');
}

export function materialIncident(receipt){
  if(!receipt||typeof receipt!=='object'||!receipt.provider_effect_id)return null;
  const mismatch=receipt.readback_status==='MISMATCH';
  let failure_signature=null,severity='HIGH';
  if(receipt.action_type==='nexo.sheet.update'&&receipt.status==='CONFLICT'&&mismatch){failure_signature='CANONICAL_WRITE_READBACK_MISMATCH';severity='P0';}
  else if(receipt.provider==='vercel'&&receipt.status==='CONFLICT'&&mismatch&&(receipt.material||receipt.action_type==='vercel.promote')){failure_signature='PRODUCTION_DEPLOYMENT_REVISION_MISMATCH';severity='P0';}
  else if(receipt.confirmation_level==='STRONG_CONFIRM'&&['FAILED','DEGRADED','CONFLICT'].includes(receipt.status)&&mismatch){failure_signature='STRONG_CONFIRM_PARTIAL_EFFECT';severity='P0';}
  else if(receipt.material&&receipt.status==='CONFLICT'){failure_signature='MATERIAL_PROVIDER_EFFECT_CONFLICT';severity='HIGH';}
  if(!failure_signature)return null;
  const fp=fingerprint(receipt,failure_signature),checked=receipt.checked_at||new Date().toISOString();
  return {
    check_id:`NEXO-ACTION-INTEGRITY-${fp}`,
    scope:receipt.domain||'NEXO',
    check_type:'ACTION_EFFECT_INTEGRITY',
    target:`${receipt.provider||'provider'}:${receipt.target_ref||receipt.provider_effect_id}`,
    expected:json({action_type:receipt.action_type,capability_id:receipt.capability_id,before_revision:receipt.before_revision,expected:receipt.expected}),
    observed:json({status:receipt.status,readback_status:receipt.readback_status,provider_effect_id:receipt.provider_effect_id,after_revision:receipt.after_revision}),
    status:'CONFLICT',
    severity,
    failure_signature,
    remediation:'Human reconciliation required. Preserve provider effect evidence; do not auto-change authority or retry blindly.',
    readback_ref:receipt.source_ref||'',
    last_checked:checked,
    next_check:'ON_CHANGE',
    notes:`receipt_id=${receipt.receipt_id||''}; action_id=${receipt.action_id||''}; intent_fingerprint=${receipt.intent_fingerprint||''}; explanation=${String(receipt.explanation||'').slice(0,800)}`,
    fingerprint:fp
  };
}

async function defaultRequester(url,options){return googleActionRequest(url,options);}
function rows(data){return Array.isArray(data?.values)?data.values:[];}
function hasIncident(data,checkId){return rows(data).slice(1).some(row=>String(row?.[0]||'').trim()===checkId);}
function rangeUrl(sheetId){return `https://sheets.googleapis.com/v4/spreadsheets/${enc(sheetId)}/values/${enc('Integrity!A1:N3000')}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;}

export async function persistMaterialIncident(receipt,{env=process.env,signal,truthGraphInput,tokenProvider=googleToken,requester=defaultRequester}={}){
  const incident=materialIncident(receipt);if(!incident)return {persisted:false,deduped:false,readback:false,incident:null};
  assertIntegrityWriteGate(truthGraphInput);
  const sheetId=String(env.NEXO_SHEET_ID||'').trim();if(!sheetId)throw new ActionError('AUTH_REQUIRED');
  const token=await tokenProvider(env,signal,{writeScopes:SHEETS_WRITE});
  const before=await requester(rangeUrl(sheetId),{token,signal});
  const header=rows(before)[0]||[];
  if(HEADERS.some((name,index)=>String(header[index]||'').trim()!==name))throw new ActionError('PROVIDER_REJECTED');
  if(hasIncident(before,incident.check_id))return {persisted:false,deduped:true,readback:true,incident};
  const values=HEADERS.map(name=>incident[name]??'');
  const appendUrl=`https://sheets.googleapis.com/v4/spreadsheets/${enc(sheetId)}/values/${enc('Integrity!A:N')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  await requester(appendUrl,{token,signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[values]})});
  const after=await requester(rangeUrl(sheetId),{token,signal});
  if(!hasIncident(after,incident.check_id))throw new ActionError('READBACK_MISMATCH');
  return {persisted:true,deduped:false,readback:true,incident};
}
