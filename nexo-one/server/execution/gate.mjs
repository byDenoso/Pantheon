import {ActionError} from './contracts.mjs';

const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase();
const domainList=value=>upper(value).split(/[\/,;]+/).map(x=>x.trim()).filter(Boolean);

export function authorityProvider(row){
  if(!row)return null;
  const domain=upper(row.domain),value=text(row.canonical_truth).toLowerCase();
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

function expectedActionProvider(actionType){
  if(actionType.startsWith('gmail.'))return 'gmail';
  if(actionType.startsWith('calendar.'))return 'calendar';
  if(actionType.startsWith('drive.'))return 'drive';
  if(actionType==='nexo.sheet.update')return 'nexo';
  if(actionType.startsWith('github.'))return 'github';
  if(actionType.startsWith('vercel.'))return 'vercel';
  return null;
}

function operationAllows(actionType,capability){
  const id=upper(capability.capability_id),op=upper(capability.operation),combined=`${id} ${op}`;
  const has=pattern=>pattern.test(combined),opHas=pattern=>pattern.test(op);
  if(actionType==='gmail.send')return has(/GMAIL/)&&opHas(/\bSEND\b|\bWRITE\b/);
  if(actionType==='gmail.draft')return has(/GMAIL/)&&opHas(/\bDRAFT\b|\bCOMPOSE\b/);
  if(actionType==='calendar.create')return has(/GCAL|CALENDAR/)&&opHas(/\bCREATE\b|\bWRITE\b/);
  if(actionType==='calendar.update')return has(/GCAL|CALENDAR/)&&opHas(/\bUPDATE\b|\bWRITE\b/);
  if(actionType==='calendar.delete')return has(/GCAL|CALENDAR/)&&opHas(/\bDELETE\b|\bWRITE\b/);
  if(actionType==='drive.create')return has(/GDRIVE|DRIVE/)&&opHas(/\bFILE\b/)&&opHas(/\bCREATE\b|\bWRITE\b/);
  if(actionType==='drive.update')return has(/GDRIVE|DRIVE/)&&opHas(/\bFILE\b/)&&opHas(/\bUPDATE\b|\bWRITE\b/);
  if(actionType==='nexo.sheet.update')return has(/GDRIVE|NEXO|SHEET/)&&opHas(/SHEET/)&&opHas(/\bWRITE\b/);
  if(actionType==='github.branch.create')return has(/GITHUB/)&&opHas(/\bBRANCH\b/)&&opHas(/\bWRITE\b/);
  if(actionType==='github.commit.create')return has(/GITHUB/)&&opHas(/\bFILE\b|\bCOMMIT\b/)&&opHas(/\bWRITE\b/);
  if(actionType==='github.issue.create')return has(/GITHUB/)&&opHas(/\bISSUE\b/)&&opHas(/\bCREATE\b|\bWRITE\b/);
  if(actionType==='github.issue.update')return has(/GITHUB/)&&opHas(/\bISSUE\b/)&&opHas(/\bUPDATE\b|\bWRITE\b/);
  if(actionType==='github.pr.create')return has(/GITHUB/)&&opHas(/\bPR\b|PULL REQUEST/)&&opHas(/\bCREATE\b|\bWRITE\b/);
  if(actionType==='github.merge')return has(/GITHUB/)&&opHas(/\bMERGE\b|\bPR\b|PULL REQUEST/)&&opHas(/\bMERGE\b|\bWRITE\b/);
  if(actionType==='vercel.deploy')return has(/VERCEL/)&&opHas(/\bDEPLOY\b|\bCREATE\b|\bWRITE\b/);
  if(actionType==='vercel.promote')return has(/VERCEL/)&&opHas(/\bPROMOTE\b|\bPROMOTION\b|\bWRITE\b/);
  return false;
}

export function capabilitySupportsIntent(intent,capability){
  const expectedProvider=expectedActionProvider(intent.action_type);
  if(!expectedProvider||intent.provider!==expectedProvider)return false;
  if(!upper(capability.runtime).includes('INTERACTIVE'))return false;
  return operationAllows(intent.action_type,capability);
}

export function gateIntent(intent,{truthGraphInput,confirmed=false}={}){
  const authorityRows=truthGraphInput?.authorityRows||[],capabilityRows=truthGraphInput?.capabilityRows||[];
  const authorityRow=authorityRows.find(row=>upper(row.domain)===intent.domain);
  if(!authorityRow)throw new ActionError('AUTHORITY_CONFLICT');
  const capability=capabilityRows.find(row=>text(row.capability_id)===intent.capability_id&&domainList(row.domain).includes(intent.domain));
  if(!capability||upper(capability.status)!=='PASS')throw new ActionError('CAPABILITY_BLOCKED');
  const expected=authorityProvider(authorityRow);
  if(intent.action_type==='nexo.sheet.update'&&(expected!=='nexo'||intent.provider!=='nexo'))throw new ActionError('AUTHORITY_CONFLICT');
  if(intent.action_type.startsWith('github.')&&intent.domain==='ENGINEERING'&&(expected!=='github'||intent.provider!=='github'))throw new ActionError('AUTHORITY_CONFLICT');
  if(!capabilitySupportsIntent(intent,capability))throw new ActionError('CAPABILITY_BLOCKED');
  if(!confirmedEnough(intent.confirmation_level,confirmed))throw new ActionError('CONFIRMATION_REQUIRED');
  return {
    allowed:true,
    provider:intent.provider,
    authority:{domain:intent.domain,canonical_truth:text(authorityRow.canonical_truth),expected_provider:expected||'owner-dependent',conflict_rule:text(authorityRow.conflict_rule)},
    capability:{id:intent.capability_id,status:'PASS',domain:text(capability.domain),provider:text(capability.provider||capability.runtime||intent.provider),runtime:text(capability.runtime),operation:text(capability.operation)},
    confirmation:intent.confirmation_level
  };
}
