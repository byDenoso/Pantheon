import test from 'node:test';
import assert from 'node:assert/strict';
import {googleScopesFor,executeGoogle,readbackGoogle} from '../server/adapters/google-actions.mjs';
import {GOOGLE_READ_SCOPES} from '../server/adapters/connect.mjs';

test('write scope policy stays least privilege',()=>{
  assert.deepEqual(googleScopesFor('gmail.send'),['https://www.googleapis.com/auth/gmail.send']);
  assert.deepEqual(googleScopesFor('gmail.draft'),['https://www.googleapis.com/auth/gmail.compose']);
  assert.deepEqual(googleScopesFor('calendar.create'),['https://www.googleapis.com/auth/calendar.events']);
  assert.deepEqual(googleScopesFor('drive.create'),['https://www.googleapis.com/auth/drive.file']);
  assert.deepEqual(googleScopesFor('nexo.sheet.update'),['https://www.googleapis.com/auth/spreadsheets']);
  assert.ok(GOOGLE_READ_SCOPES.every(scope=>scope.endsWith('.readonly')||scope.includes('/auth/drive.readonly')||scope.includes('/auth/calendar.readonly')||scope.includes('/auth/gmail.readonly')));
});

test('gmail send requests write token and returns stable effect id',async()=>{
  let scopes,request;
  const tokenProvider=async(_env,_signal,options)=>{scopes=options.writeScopes;return 'tok';};
  const requester=async(url,options)=>{request={url,options};return {id:'m-1',threadId:'t-1'};};
  const effect=await executeGoogle({action_type:'gmail.send',target_ref:'me',requested_payload:{to:'a@example.com',subject:'Hello',body:'Body'}},{env:{},tokenProvider,requester});
  assert.deepEqual(scopes,googleScopesFor('gmail.send'));
  assert.match(request.url,/gmail\/v1\/users\/me\/messages\/send$/);
  assert.equal(effect.effect_id,'m-1');
  assert.match(request.options.body,/raw/);
});

test('gmail rejects CRLF header injection before provider dispatch',async()=>{
  let calls=0;
  await assert.rejects(
    ()=>executeGoogle({action_type:'gmail.send',target_ref:'me',requested_payload:{to:'victim@example.com\r\nBcc: injected@example.com',subject:'Hello',body:'Body'}},{env:{},tokenProvider:async()=> 't',requester:async()=>{calls++;return {id:'m-1'};}}),
    error=>error.code==='TARGET_AMBIGUOUS'
  );
  assert.equal(calls,0);
});

test('calendar update requires explicit event target',async()=>{
  await assert.rejects(()=>executeGoogle({action_type:'calendar.update',target_ref:'primary',requested_payload:{summary:'x'}},{env:{},tokenProvider:async()=> 't',requester:async()=>({})}),e=>e.code==='TARGET_AMBIGUOUS');
});

test('drive update requires explicit file id',async()=>{
  await assert.rejects(()=>executeGoogle({action_type:'drive.update',target_ref:'',requested_payload:{name:'x'}},{env:{},tokenProvider:async()=> 't',requester:async()=>({})}),e=>e.code==='TARGET_AMBIGUOUS');
});

test('sheets readback mismatch is never PASS',async()=>{
  const requester=async()=>({values:[['old']]});
  const result=await readbackGoogle({action_type:'nexo.sheet.update',provider_effect_id:'sheet-1',target_ref:'sheet-1!A1',expected:{values:[['new']]}},{env:{},tokenProvider:async()=> 't',requester});
  assert.equal(result.status,'CONFLICT');
  assert.equal(result.readback_status,'MISMATCH');
});

test('calendar create matching readback is PASS',async()=>{
  const requester=async()=>({id:'e1',summary:'Canary',start:{dateTime:'2026-09-10T12:00:00Z'},end:{dateTime:'2026-09-10T12:30:00Z'},etag:'v2',htmlLink:'https://calendar.google.com/event?eid=e1'});
  const result=await readbackGoogle({action_type:'calendar.create',provider_effect_id:'e1',target_ref:'primary',expected:{summary:'Canary',start:{dateTime:'2026-09-10T12:00:00Z'},end:{dateTime:'2026-09-10T12:30:00Z'}}},{env:{GOOGLE_CALENDAR_ID:'primary'},tokenProvider:async()=> 't',requester});
  assert.equal(result.status,'PASS');
  assert.equal(result.readback_status,'MATCH');
  assert.equal(result.after_revision,'v2');
});
