import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchPrivate,ApiError} from '../src/atlas/api.ts';
import {createPrivateSession,createSessionBarrier,createSerializer} from '../src/atlas/privateSession.ts';
import {classifySourceFailure} from '../worker/source-errors.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const denied=(connectorStatus,extra={})=>Response.json({error:'PRIVATE_SOURCE_UNAVAILABLE',connectorStatus,...extra},{status:503});
function controller(source,now=()=>Date.now()){
 const calls=[],channel={onmessage:null,postMessage(){},close(){}};
 const ctl=createPrivateSession({barrier:createSessionBarrier(),serial:createSerializer(),channel,now,
  timer:{set(){return 1;},clear(){}},fetch:async(url,init)=>{
   calls.push([url,init?.method]);
   return url==='/api/atlas-private'?source():Response.json({configured:true,authenticated:true,expiresAt:new Date(now()+60000).toISOString()});
  }});
 return {ctl,calls,channel};
}
test('only confirmed connector reauthentication offers reconnection; access faults stay distinct',async()=>{
 for(const [status,code] of [['reauthentication_required','DRIVE_REAUTH_REQUIRED'],
  ...['connector_access_disabled','tool_not_allowed','tool_not_found','binding_unavailable'].map(status=>[status,'DRIVE_UNAVAILABLE']),
  ['invalid_request','PRIVATE_SOURCE_UNAVAILABLE'],['upstream_error','PRIVATE_SOURCE_UNAVAILABLE']])
  await assert.rejects(fetchPrivate(async()=>denied(status)),e=>e instanceof ApiError&&e.code===code);
 // A caller cannot turn a malformed/auth response into a reconnect instruction.
 await assert.rejects(fetchPrivate(async()=>Response.json({error:'AUTH_REQUIRED',connectorStatus:'reauthentication_required'},{status:401})),e=>e.code==='AUTH_REQUIRED');
});
test('connector failures clear private state without repeated PIN submissions or source reads',async()=>{
 for(const [status,notice] of [['reauthentication_required','drive_consent'],['connector_access_disabled','drive_unavailable']]){
  const {ctl,calls,channel}=controller(()=>denied(status));ctl.start();await tick();
  assert.equal(ctl.getSnapshot().notice,notice);assert.equal(ctl.getSnapshot().data,null);
  assert.equal(ctl.getSnapshot().expiresAt,null);
  await ctl.retrySource();await ctl.login('synthetic-passcode');await ctl.retrySource();
  assert.deepEqual(calls,[['/api/atlas-session',undefined],['/api/atlas-private','POST']]);
  assert.equal(typeof channel.onmessage,'function');ctl.dispose();
 }
});
test('simultaneous revalidation shares a source read and busy retry waits for the server deadline',async()=>{
 let now=1700000000000,finish,reads=0;
 const pending=new Promise(resolve=>{finish=resolve;});
 const {ctl,calls,channel}=controller(()=>{reads++;return reads===1?pending:Response.json({contract:'ATLAS_PRIVATE_V1',data:{synthetic:true}});},()=>now);
 ctl.start();await tick();
 const retries=[ctl.retrySource(),ctl.retrySource()];
 channel.onmessage({data:{t:'sync'}});await tick();
 assert.equal(reads,1);assert.equal(calls.length,2);
 finish(Response.json({error:'PRIVATE_SOURCE_UNAVAILABLE',retryAfter:3},{status:503,headers:{'Retry-After':'3'}}));
 await Promise.all(retries);await tick();
 assert.equal(ctl.getSnapshot().notice,'source_unavailable');assert.equal(ctl.getSnapshot().retryAfter,3);
 await ctl.retrySource();assert.equal(reads,1);
 now+=3000;await ctl.retrySource();assert.equal(reads,2);assert.equal(ctl.getSnapshot().data.synthetic,true);
 ctl.dispose();
});
test('safe Retry-After headers are preserved, invalid or connector recovery delays are discarded',async()=>{
 for(const [header,delay] of [['3',3],['86400',86400],['0',null],['-1',null],['0.5',null],['90000',null],['Infinity',null]])
  await assert.rejects(fetchPrivate(async()=>Response.json({error:'PRIVATE_SOURCE_UNAVAILABLE'},{status:503,headers:{'Retry-After':header}})),e=>e.retryAfter===delay);
 const failure=classifySourceFailure(Object.assign(Error('CONNECTOR_LIST_FILE_REVISIONS_FAILED'),{connectorStatus:'reauthentication_required',retryAfter:3}));
 assert.equal(failure.recovery,'REAUTHORIZE_CONNECTOR');assert.equal(failure.retryAfter,undefined);
 assert.deepEqual(classifySourceFailure(Object.assign(Error('PRIVATE_RECORD_SECRET'),{connectorStatus:'private-secret-status',retryAfter:-1})),
  {error:'PRIVATE_SOURCE_UNAVAILABLE',diagnostic:'PRIVATE_SOURCE_UNEXPECTED',recovery:'RETRY_SOURCE'});
});
