import {ActionError} from './contracts.mjs';

const text=value=>String(value??'').trim();
const domainList=value=>text(value).toUpperCase().split(/[\/,;]+/).map(x=>x.trim()).filter(Boolean);

export function authorityProvider(row){
  if(!row)return null;
  const domain=text(row.domain).toUpperCase(),value=text(row.canonical_truth).toLowerCase();
  if(domain==='ARTIFACT')return null;
  if(domain==='NEXO'||value.includes('nexo · ssot')||value.includes('nexo ssot')||value.includes('ssot canonical')||value.includes('action_register'))return 'nexo';
  if(value.includes('github')||value.includes('git/'))return 'github';
  if(value.includes('drive')||value.includes('control tower'))return 'drive';
  if(value.includes('vercel'))return 'vercel';
  if(value.includes('calendar'))return 'calendar';
  if(value.includes('atlas'))return 'atlas';
  return null;
}

function confirmedEnough(required,confirmed){
  if(required==='NONE')return true;
  if(required==='CONFIRM')return confirmed===true||confirmed==='CONFIRM'||confirmed==='STRONG_CONFIRM';
  return confirmed==='STRONG_CONFIRM';
}

export function gateIntent(intent,{truthGraphInput,confirmed=false}={}){
  const authorityRows=truthGraphInput?.authorityRows||[],capabilityRows=truthGraphInput?.capabilityRows||[];
  const authorityRow=authorityRows.find(row=>text(row.domain).toUpperCase()===intent.domain);
  if(!authorityRow)throw new ActionError('AUTHORITY_CONFLICT');
  const capability=capabilityRows.find(row=>text(row.capability_id)===intent.capability_id&&domainList(row.domain).includes(intent.domain));
  if(!capability||text(capability.status).toUpperCase()!=='PASS')throw new ActionError('CAPABILITY_BLOCKED');
  const expected=authorityProvider(authorityRow);
  if(intent.action_type==='nexo.sheet.update'&&expected!=='nexo')throw new ActionError('AUTHORITY_CONFLICT');
  if(intent.action_type.startsWith('github.')&&intent.domain==='ENGINEERING'&&expected!=='github')throw new ActionError('AUTHORITY_CONFLICT');
  if(!confirmedEnough(intent.confirmation_level,confirmed))throw new ActionError('CONFIRMATION_REQUIRED');
  return {
    allowed:true,
    provider:intent.provider,
    authority:{domain:intent.domain,canonical_truth:text(authorityRow.canonical_truth),expected_provider:expected||'owner-dependent',conflict_rule:text(authorityRow.conflict_rule)},
    capability:{id:intent.capability_id,status:'PASS',domain:text(capability.domain),provider:text(capability.provider||capability.runtime||intent.provider)},
    confirmation:intent.confirmation_level
  };
}
