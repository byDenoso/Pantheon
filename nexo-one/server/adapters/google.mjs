import {createHash} from 'node:crypto';
import {json,requireEnv,item,inferContext,ProviderError} from './http.mjs';
import {googleConnectToken,GOOGLE_READ_SCOPES,GOOGLE_WRITE_SCOPES} from './connect.mjs';
let legacyTokenCache=null;
async function legacyGoogleToken(env,signal) {
  requireEnv(env,'GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN');
  if(legacyTokenCache && legacyTokenCache.until>Date.now()) return legacyTokenCache.value;
  const result=await json('https://oauth2.googleapis.com/token',{signal,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:env.GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'}).toString()});
  if(!result.access_token)throw new Error('AUTH_REQUIRED');
  legacyTokenCache={value:result.access_token,until:Date.now()+Math.max(0,(result.expires_in||3600)-120)*1000};return result.access_token;
}
export async function googleToken(env,signal,{scopes=GOOGLE_READ_SCOPES}={}) {
  if(env.GOOGLE_CONNECTOR)return googleConnectToken(env,signal,{scopes});
  return legacyGoogleToken(env,signal);
}
export async function drive({env,signal,now,query}) {
  const token=await googleToken(env,signal);
  const escape=s=>s.replaceAll('\\','\\\\').replaceAll("'","\\'");
  const clauses=['trashed = false',...(env.GOOGLE_DRIVE_FOLDER_ID?[`'${escape(env.GOOGLE_DRIVE_FOLDER_ID)}' in parents`]:[]),...(query?[`(name contains '${escape(query)}')`]:[])];
  const qs=new URLSearchParams({q:clauses.join(' and '),pageSize:'100',orderBy:'modifiedTime desc',fields:'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,version)'});
  const data=await json(`https://www.googleapis.com/drive/v3/files?${qs}`,{token,signal});
  return {items:(data.files||[]).map(f=>item('drive',f.id,f.name,f.webViewLink||`https://drive.google.com/file/d/${encodeURIComponent(f.id)}/view`,now,{kind:'FILE',contextId:inferContext(f.name),summary:`Modificado em ${f.modifiedTime}`,sourceRevision:f.version||f.modifiedTime})),partial:!!data.nextPageToken};
}
export async function gmail({env,signal,now,query}) {
  const token=await googleToken(env,signal);
  const qs=new URLSearchParams({q:query||'in:inbox newer_than:30d',maxResults:'40'});
  const data=await json(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${qs}`,{token,signal});
  const rows=await Promise.allSettled((data.messages||[]).map(m=>json(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,{token,signal})));
  return {items:rows.filter(r=>r.status==='fulfilled').map(r=>{const m=r.value;const h=name=>m.payload?.headers?.find(h=>h.name.toLowerCase()===name)?.value||'';const title=h('subject')||'(Sem assunto)';return item('gmail',m.id,title,`https://mail.google.com/mail/u/0/#all/${m.threadId}`,now,{kind:'MESSAGE',summary:h('from'),contextId:inferContext(title)});}),partial:!!data.nextPageToken||rows.some(r=>r.status==='rejected')};
}
export async function calendar({env,signal,now,query}) {
  const token=await googleToken(env,signal), start=new Date(now);start.setUTCHours(0,0,0,0);start.setUTCDate(start.getUTCDate()-1);
  const qs=new URLSearchParams({timeMin:start.toISOString(),timeMax:new Date(now+14*86400000).toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'100',...(query?{q:query}:{})});
  const data=await json(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID||'primary')}/events?${qs}`,{token,signal});
  return {items:(data.items||[]).filter(e=>e.status!=='cancelled'&&!e.attendees?.some(a=>a.self&&a.responseStatus==='declined')).map(e=>item('calendar',e.id,e.summary||'(Sem título)',e.htmlLink,now,{kind:'EVENT',status:'SCHEDULED',contextId:inferContext(e.summary||''),dueAt:e.start?.dateTime||e.start?.date,endAt:e.end?.dateTime||e.end?.date,allDay:!!e.start?.date,summary:e.location||'Evento do Google Calendar',sourceRevision:e.etag})),partial:!!data.nextPageToken};
}

function cleanHeader(value){return String(value??'').replace(/[\r\n]+/g,' ').trim();}
function addressHeader(value){return (Array.isArray(value)?value:[value]).map(cleanHeader).filter(Boolean).join(', ');}
function gmailMessageId(effectKey){return `<${createHash('sha256').update(String(effectKey)).digest('hex').slice(0,40)}@nexo.local>`;}
function gmailRaw(effectKey,input){
  const to=addressHeader(input?.to),subject=cleanHeader(input?.subject),body=String(input?.body??'');
  if(!to||!subject)throw new ProviderError('UNAVAILABLE');
  const headers=[`To: ${to}`];
  const cc=addressHeader(input?.cc),bcc=addressHeader(input?.bcc);
  if(cc)headers.push(`Cc: ${cc}`);if(bcc)headers.push(`Bcc: ${bcc}`);
  headers.push(`Subject: ${subject}`,`Message-ID: ${gmailMessageId(effectKey)}`,`X-Nexo-Effect-Key: ${cleanHeader(effectKey)}`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: 8bit');
  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`,'utf8').toString('base64url');
}
function verifyRawDraft(raw,effectKey,input){
  if(typeof raw!=='string'||!raw)return false;
  const decoded=Buffer.from(raw,'base64url').toString('utf8');
  const required=[`To: ${addressHeader(input?.to)}`,`Subject: ${cleanHeader(input?.subject)}`,`Message-ID: ${gmailMessageId(effectKey)}`,`X-Nexo-Effect-Key: ${cleanHeader(effectKey)}`];
  return required.every(value=>decoded.split(/\r?\n/).includes(value));
}

export function gmailDraftCapability({env,signal}={}){
  return {mutating:true,target:'gmail',
    async execute({effectKey,input}){
      const token=await googleToken(env,signal,{scopes:GOOGLE_WRITE_SCOPES.gmailDraft});
      const data=await json('https://gmail.googleapis.com/gmail/v1/users/me/drafts',{token,signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:{raw:gmailRaw(effectKey,input)}})});
      if(!data?.id)throw new ProviderError('UNAVAILABLE');
      return {providerObjectId:String(data.id),messageId:data.message?.id?String(data.message.id):null};
    },
    async readback({effectKey,input,providerResult}){
      const id=String(providerResult?.providerObjectId||'');if(!id)throw new ProviderError('UNAVAILABLE');
      const token=await googleToken(env,signal,{scopes:GOOGLE_WRITE_SCOPES.gmailDraft});
      const data=await json(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(id)}?format=raw`,{token,signal});
      const verified=String(data?.id||'')===id&&verifyRawDraft(data?.message?.raw,effectKey,input);
      return {verified,providerObjectId:id,receiptRef:`gmail:draft:${id}`,fingerprint:verified?createHash('sha256').update(data.message.raw).digest('hex'):null};
    }
  };
}

function calendarEventId(effectKey){return `a${createHash('sha256').update(String(effectKey)).digest('hex').slice(0,39)}`;}
function calendarBody(effectKey,input){
  const summary=cleanHeader(input?.summary),start=String(input?.start||''),end=String(input?.end||'');
  if(!summary||!start||!end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start))throw new ProviderError('UNAVAILABLE');
  const dateValue=value=>value.length===10?{date:value}:{dateTime:value,...(input?.timeZone?{timeZone:String(input.timeZone)}:{})};
  return {id:calendarEventId(effectKey),summary,start:dateValue(start),end:dateValue(end),...(input?.description?{description:String(input.description)}:{}),...(input?.location?{location:String(input.location)}:{}),extendedProperties:{private:{nexoEffectKey:String(effectKey)}}};
}
function calendarMatches(data,effectKey,input,id){
  const expected=calendarBody(effectKey,input),start=data?.start?.dateTime||data?.start?.date,end=data?.end?.dateTime||data?.end?.date;
  return String(data?.id||'')===id&&data?.summary===expected.summary&&start===(expected.start.dateTime||expected.start.date)&&end===(expected.end.dateTime||expected.end.date)&&data?.extendedProperties?.private?.nexoEffectKey===String(effectKey);
}

export function calendarEventCapability({env,signal}={}){
  const calendarId=encodeURIComponent(env?.GOOGLE_CALENDAR_ID||'primary');
  return {mutating:true,target:'calendar',
    async execute({effectKey,input}){
      const token=await googleToken(env,signal,{scopes:GOOGLE_WRITE_SCOPES.calendarEvent}),body=calendarBody(effectKey,input),id=body.id;
      const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,{method:'POST',redirect:'error',signal,headers:{Accept:'application/json',Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(response.status===409)return {providerObjectId:id,reused:true};
      if(!response.ok)throw new ProviderError(response.status===401||response.status===403?'AUTH_REQUIRED':response.status===429?'RATE_LIMITED':'UNAVAILABLE');
      const data=await response.json();if(String(data?.id||'')!==id)throw new ProviderError('UNAVAILABLE');
      return {providerObjectId:id,htmlLink:data.htmlLink||null};
    },
    async readback({effectKey,input,providerResult}){
      const id=String(providerResult?.providerObjectId||calendarEventId(effectKey));
      const token=await googleToken(env,signal,{scopes:GOOGLE_WRITE_SCOPES.calendarEvent});
      const data=await json(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(id)}`,{token,signal});
      const verified=calendarMatches(data,effectKey,input,id);
      return {verified,providerObjectId:id,receiptRef:`calendar:event:${id}`,fingerprint:verified?createHash('sha256').update(JSON.stringify({id,summary:data.summary,start:data.start,end:data.end,effectKey})).digest('hex'):null};
    }
  };
}
