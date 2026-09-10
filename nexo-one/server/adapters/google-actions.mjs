import {ActionError} from '../execution/contracts.mjs';
import {googleToken} from './google.mjs';

const WRITE_SCOPES=Object.freeze({
  'gmail.send':['https://www.googleapis.com/auth/gmail.send'],
  'gmail.draft':['https://www.googleapis.com/auth/gmail.compose'],
  'calendar.create':['https://www.googleapis.com/auth/calendar.events'],
  'calendar.update':['https://www.googleapis.com/auth/calendar.events'],
  'calendar.delete':['https://www.googleapis.com/auth/calendar.events'],
  'drive.create':['https://www.googleapis.com/auth/drive.file'],
  'drive.update':['https://www.googleapis.com/auth/drive.file'],
  'nexo.sheet.update':['https://www.googleapis.com/auth/spreadsheets']
});

export const googleScopesFor=actionType=>WRITE_SCOPES[actionType]?[...WRITE_SCOPES[actionType]]:[];
const enc=value=>encodeURIComponent(String(value));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sourceFor=(type,id)=>type.startsWith('gmail.')?`https://mail.google.com/mail/u/0/#all/${id}`:type.startsWith('calendar.')?`https://calendar.google.com/calendar/u/0/r/eventedit/${id}`:type.startsWith('drive.')?`https://drive.google.com/open?id=${enc(id)}`:'https://docs.google.com/spreadsheets/';

function rawMessage(payload={}){
  const to=String(payload.to||'').trim(),subject=String(payload.subject||'').replace(/[\r\n]+/g,' ').trim(),body=String(payload.body||'');
  if(!to||!subject||/[\r\n]/.test(to))throw new ActionError('TARGET_AMBIGUOUS');
  return Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=UTF-8\r\nMIME-Version: 1.0\r\n\r\n${body}`,'utf8').toString('base64url');
}
function canonicalSheet(env,requested){
  const canonical=String(env.NEXO_SHEET_ID||'').trim();
  if(!canonical)throw new ActionError('AUTH_REQUIRED');
  if(String(requested||'').trim()!==canonical)throw new ActionError('AUTHORITY_CONFLICT');
  return canonical;
}

export async function googleActionRequest(url,{token,signal,method='GET',headers={},body}={},fetcher=fetch){
  const response=await fetcher(url,{method,signal,redirect:'error',headers:{Accept:'application/json',Authorization:`Bearer ${token}`,...headers},body});
  if(response?.ok){if(response.status===204)return {};return response.json();}
  const status=Number(response?.status)||0;
  if(status===401)throw new ActionError('AUTH_REQUIRED');
  if(status===403)throw new ActionError('SCOPE_REQUIRED');
  if(status===409||status===412)throw new ActionError('PROVIDER_REJECTED');
  if(status===429)throw new ActionError('RATE_LIMITED');
  if(status>=400&&status<500)throw new ActionError('PROVIDER_REJECTED');
  throw new ActionError('PROVIDER_UNAVAILABLE');
}

async function defaultRequester(url,options){return googleActionRequest(url,options);}

export async function executeGoogle(action,{env=process.env,signal,tokenProvider=googleToken,requester=defaultRequester}={}){
  const type=action.action_type,scopes=googleScopesFor(type);
  if(!scopes.length)throw new ActionError('CAPABILITY_BLOCKED');
  const token=await tokenProvider(env,signal,{writeScopes:scopes});
  const payload=action.requested_payload||{};
  let data={},effectId='',expected={},source_ref='';
  if(type==='gmail.send'||type==='gmail.draft'){
    const raw=rawMessage(payload),draft=type==='gmail.draft';
    const url=draft?'https://gmail.googleapis.com/gmail/v1/users/me/drafts':'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
    data=await requester(url,{token,signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft?{message:{raw}}:{raw})});
    effectId=data.id;expected={threadId:data.message?.threadId||data.threadId||null,subject:String(payload.subject||'')};source_ref=sourceFor(type,data.message?.id||data.id);
  } else if(type.startsWith('calendar.')){
    const calendarId=env.GOOGLE_CALENDAR_ID||'primary',isCreate=type==='calendar.create',eventId=isCreate?'':String(payload.event_id||action.target_ref||'').trim();
    if(!isCreate&&(!eventId||eventId===calendarId||eventId==='primary'))throw new ActionError('TARGET_AMBIGUOUS');
    if(isCreate){
      const url=`https://www.googleapis.com/calendar/v3/calendars/${enc(calendarId)}/events`;
      data=await requester(url,{token,signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload.event||payload)});effectId=data.id;expected=payload.event||payload;
    }else if(type==='calendar.update'){
      const url=`https://www.googleapis.com/calendar/v3/calendars/${enc(calendarId)}/events/${enc(eventId)}`;
      data=await requester(url,{token,signal,method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload.event||payload)});effectId=data.id||eventId;expected=payload.event||payload;
    }else{
      const url=`https://www.googleapis.com/calendar/v3/calendars/${enc(calendarId)}/events/${enc(eventId)}`;
      await requester(url,{token,signal,method:'DELETE'});effectId=eventId;expected={deleted:true};
    }
    source_ref=sourceFor(type,effectId);
  } else if(type==='drive.create'){
    const name=String(payload.name||'').trim();if(!name)throw new ActionError('TARGET_AMBIGUOUS');
    const parents=env.GOOGLE_DRIVE_FOLDER_ID?[env.GOOGLE_DRIVE_FOLDER_ID]:undefined;
    data=await requester('https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,modifiedTime,version,webViewLink',{token,signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:payload.mimeType||'application/vnd.google-apps.document',...(parents?{parents}:{})})});
    effectId=data.id;expected={name};source_ref=data.webViewLink||sourceFor(type,effectId);
  } else if(type==='drive.update'){
    const fileId=String(payload.file_id||action.target_ref||'').trim();if(!fileId)throw new ActionError('TARGET_AMBIGUOUS');
    const patch={};if(typeof payload.name==='string'&&payload.name.trim())patch.name=payload.name.trim();if(!Object.keys(patch).length)throw new ActionError('TARGET_AMBIGUOUS');
    data=await requester(`https://www.googleapis.com/drive/v3/files/${enc(fileId)}?fields=id,name,mimeType,modifiedTime,version,webViewLink`,{token,signal,method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});effectId=data.id||fileId;expected=patch;source_ref=data.webViewLink||sourceFor(type,effectId);
  } else if(type==='nexo.sheet.update'){
    const spreadsheetId=String(payload.spreadsheet_id||'').trim(),range=String(payload.range||'').trim(),values=payload.values;
    if(!spreadsheetId||!range||!Array.isArray(values))throw new ActionError('TARGET_AMBIGUOUS');
    canonicalSheet(env,spreadsheetId);
    data=await requester(`https://sheets.googleapis.com/v4/spreadsheets/${enc(spreadsheetId)}/values/${enc(range)}?valueInputOption=RAW`,{token,signal,method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({range,majorDimension:'ROWS',values})});effectId=spreadsheetId;expected={range,values};source_ref=`https://docs.google.com/spreadsheets/d/${enc(spreadsheetId)}/edit`;
  } else throw new ActionError('CAPABILITY_BLOCKED');
  if(!effectId)throw new ActionError('PROVIDER_REJECTED');
  return {effect_id:effectId,source_ref,classification:'ACK',expected,target_ref:action.target_ref,action_type:type,before_revision:payload.before_revision||null};
}

function pickEvent(event){return {summary:event.summary,start:event.start,end:event.end,location:event.location,description:event.description};}
function containsExpected(actual,expected){
  if(expected?.deleted)return false;
  if(!expected||typeof expected!=='object')return true;
  for(const [key,value] of Object.entries(expected)){
    if(['event_id','before_revision','spreadsheet_id','range','values'].includes(key))continue;
    if(value===undefined)continue;
    if(!same(actual?.[key],value))return false;
  }
  return true;
}

export async function readbackGoogle(receipt,{env=process.env,signal,tokenProvider=googleToken,requester=defaultRequester}={}){
  const type=receipt.action_type,scopes=googleScopesFor(type),token=await tokenProvider(env,signal,{writeScopes:scopes}),effectId=receipt.provider_effect_id||receipt.effect_id;
  if(!effectId)throw new ActionError('READBACK_TIMEOUT');
  if(type==='nexo.sheet.update')canonicalSheet(env,effectId);
  let data,match=true,revision=null,source_ref=receipt.source_ref||sourceFor(type,effectId);
  try{
    if(type==='gmail.send')data=await requester(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${enc(effectId)}?format=metadata&metadataHeaders=Subject`,{token,signal});
    else if(type==='gmail.draft')data=await requester(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${enc(effectId)}?format=metadata`,{token,signal});
    else if(type.startsWith('calendar.')){
      const calendarId=env.GOOGLE_CALENDAR_ID||'primary';data=await requester(`https://www.googleapis.com/calendar/v3/calendars/${enc(calendarId)}/events/${enc(effectId)}`,{token,signal});
      revision=data.etag||data.updated||null;if(type==='calendar.delete')match=data.status==='cancelled';else match=containsExpected(pickEvent(data),receipt.expected||{});
    } else if(type.startsWith('drive.')){
      data=await requester(`https://www.googleapis.com/drive/v3/files/${enc(effectId)}?fields=id,name,mimeType,modifiedTime,version,webViewLink`,{token,signal});revision=data.version||data.modifiedTime||null;match=containsExpected(data,receipt.expected||{});source_ref=data.webViewLink||source_ref;
    } else if(type==='nexo.sheet.update'){
      const range=receipt.expected?.range||String(receipt.target_ref||'').split('!').slice(1).join('!')||'A1';
      data=await requester(`https://sheets.googleapis.com/v4/spreadsheets/${enc(effectId)}/values/${enc(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,{token,signal});revision=JSON.stringify(data.values||[]);match=same(data.values||[],receipt.expected?.values||[]);
    } else throw new ActionError('CAPABILITY_BLOCKED');
  }catch(error){if(type==='calendar.delete'&&error?.code==='PROVIDER_REJECTED')return {status:'PASS',readback_status:'MATCH',after_revision:'DELETED',source_ref,explanation:'Calendar event no longer exists after confirmed delete.'};throw error;}
  if(type.startsWith('gmail.')){revision=data.historyId||data.message?.historyId||effectId;match=!!(data.id||data.message?.id);}
  return match?{status:'PASS',readback_status:'MATCH',after_revision:revision||effectId,source_ref,explanation:'Provider readback matches the approved effect.'}:{status:type==='nexo.sheet.update'?'CONFLICT':'FAILED',readback_status:'MISMATCH',after_revision:revision,source_ref,explanation:'Provider readback does not match the approved effect.'};
}
