import {json,requireEnv,item,inferContext} from './http.mjs';
let tokenCache=null;
async function googleToken(env,signal) {
  requireEnv(env,'GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN');
  if(tokenCache && tokenCache.until>Date.now()) return tokenCache.value;
  // Each provider uses its own cancellation signal; do not share a request tied to another reader.
  const result=await json('https://oauth2.googleapis.com/token',{signal,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:env.GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'}).toString()});
  if(!result.access_token)throw new Error('AUTH_REQUIRED');
  tokenCache={value:result.access_token,until:Date.now()+Math.max(0,(result.expires_in||3600)-120)*1000};return result.access_token;
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
