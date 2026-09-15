import test from 'node:test';
import assert from 'node:assert/strict';
import {gmailDraftCapability,calendarEventCapability} from '../server/adapters/google.mjs';
import {googleConnectToken,GOOGLE_WRITE_SCOPES} from '../server/adapters/connect.mjs';

const env={GOOGLE_CONNECTOR:'google/nexo-google',VERCEL_OIDC_TOKEN:'oidc-fixture',GOOGLE_CALENDAR_ID:'primary'};

async function withFetch(handler,fn){const original=globalThis.fetch;globalThis.fetch=handler;try{return await fn();}finally{globalThis.fetch=original;}}

test('Google Connect requests only operation-specific write scopes when a mutation asks for them',async()=>{
  let body;
  await withFetch(async(url,options)=>{assert.equal(String(url),'https://api.vercel.com/v1/connect/token/google%2Fnexo-google');body=JSON.parse(options.body);return new Response(JSON.stringify({token:'write-token'}),{status:200,headers:{'Content-Type':'application/json'}});},async()=>{
    assert.equal(await googleConnectToken(env,undefined,{scopes:GOOGLE_WRITE_SCOPES.gmailDraft}),'write-token');
  });
  assert.deepEqual(body.scopes,GOOGLE_WRITE_SCOPES.gmailDraft);
  assert.deepEqual(GOOGLE_WRITE_SCOPES.gmailDraft,['https://www.googleapis.com/auth/gmail.compose']);
  assert.deepEqual(GOOGLE_WRITE_SCOPES.calendarEvent,['https://www.googleapis.com/auth/calendar.events']);
  assert.deepEqual(GOOGLE_WRITE_SCOPES.sheets,['https://www.googleapis.com/auth/spreadsheets']);
});

test('Gmail capability creates a draft only and verifies the provider object from a raw readback',async()=>{
  const seen=[];let raw;
  await withFetch(async(url,options={})=>{
    seen.push({url:String(url),method:options.method||'GET'});
    if(String(url).includes('/v1/connect/token/'))return new Response(JSON.stringify({token:'gmail-write-token'}),{status:200,headers:{'Content-Type':'application/json'}});
    if(String(url).endsWith('/gmail/v1/users/me/drafts')&&options.method==='POST'){
      assert.equal(options.headers.Authorization,'Bearer gmail-write-token');
      const payload=JSON.parse(options.body);raw=payload.message.raw;
      const decoded=Buffer.from(raw,'base64url').toString('utf8');
      assert.match(decoded,/^To: alice@example\.com$/m);
      assert.match(decoded,/^Subject: Status semanal$/m);
      assert.match(decoded,/^X-Nexo-Effect-Key: EFF-TEST-GMAIL$/m);
      assert.match(decoded,/^Message-ID: <[a-f0-9]+@nexo\.local>$/m);
      assert.match(decoded,/Relatório anexado ao Drive\./);
      return new Response(JSON.stringify({id:'draft-1',message:{id:'msg-1'}}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if(String(url).includes('/gmail/v1/users/me/drafts/draft-1?format=raw'))return new Response(JSON.stringify({id:'draft-1',message:{id:'msg-1',raw}}),{status:200,headers:{'Content-Type':'application/json'}});
    assert.fail(`Unexpected request ${url}`);
  },async()=>{
    const adapter=gmailDraftCapability({env});
    assert.equal(adapter.mutating,true);assert.equal(adapter.target,'gmail');
    const providerResult=await adapter.execute({effectKey:'EFF-TEST-GMAIL',input:{to:'alice@example.com',subject:'Status semanal',body:'Relatório anexado ao Drive.'}});
    assert.deepEqual(providerResult,{providerObjectId:'draft-1',messageId:'msg-1'});
    const readback=await adapter.readback({effectKey:'EFF-TEST-GMAIL',input:{to:'alice@example.com',subject:'Status semanal',body:'Relatório anexado ao Drive.'},providerResult});
    assert.equal(readback.verified,true);
    assert.equal(readback.providerObjectId,'draft-1');
    assert.equal(readback.receiptRef,'gmail:draft:draft-1');
  });
  assert.equal(seen.some(x=>x.url.includes('/messages/send')),false);
});

test('Calendar capability uses a deterministic provider id and verifies semantic fields after create',async()=>{
  const created=[];let eventId;
  await withFetch(async(url,options={})=>{
    if(String(url).includes('/v1/connect/token/'))return new Response(JSON.stringify({token:'calendar-write-token'}),{status:200,headers:{'Content-Type':'application/json'}});
    if(String(url).includes('/calendar/v3/calendars/primary/events')&&options.method==='POST'){
      assert.equal(options.headers.Authorization,'Bearer calendar-write-token');
      const payload=JSON.parse(options.body);created.push(payload);eventId=payload.id;
      assert.match(eventId,/^[0-9a-v]{20,}$/);
      assert.equal(payload.summary,'Revisão NEXO');
      assert.equal(payload.extendedProperties.private.nexoEffectKey,'EFF-TEST-CALENDAR');
      return new Response(JSON.stringify({...payload,htmlLink:'https://calendar.google.com/event?eid=x'}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if(eventId&&String(url).endsWith(`/calendar/v3/calendars/primary/events/${eventId}`))return new Response(JSON.stringify({...created[0],htmlLink:'https://calendar.google.com/event?eid=x'}),{status:200,headers:{'Content-Type':'application/json'}});
    assert.fail(`Unexpected request ${url}`);
  },async()=>{
    const input={summary:'Revisão NEXO',start:'2026-09-16T14:00:00-03:00',end:'2026-09-16T14:30:00-03:00',description:'Revisar personal loop'};
    const adapter=calendarEventCapability({env});
    const result=await adapter.execute({effectKey:'EFF-TEST-CALENDAR',input});
    assert.equal(result.providerObjectId,eventId);
    const readback=await adapter.readback({effectKey:'EFF-TEST-CALENDAR',input,providerResult:result});
    assert.equal(readback.verified,true);
    assert.equal(readback.providerObjectId,eventId);
    assert.equal(readback.receiptRef,`calendar:event:${eventId}`);
  });
  assert.equal(created.length,1);
});
