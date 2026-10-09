import test from 'node:test';
import assert from 'node:assert/strict';
import {createOperationsHandler} from '../server/atlas/operations-route.mjs';
function setup(){
 const state={denied:null,reads:0,tokens:0,authFailure:false,races:0};
 const t={contract:'NEXO_TOWER_LIVE_V1',authority:'TOWER_V06',truth_owner:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',storage:'GOOGLE_DRIVE_PRIVATE',stable_file_id:'1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z',revision:'sha256:'+'a'.repeat(64),state_fingerprint:'sha256:'+'a'.repeat(64),files:{}};
 const handler=createOperationsHandler({boundary:async()=>{if(state.authFailure)throw Error('private-detail');return state.denied;},runtimeEnvironment:x=>x,
  tokenProvider:async()=>{state.tokens++;return 'secret-fixture';},readTower:async()=>{state.reads++;if(state.races-- > 0)throw Error('TOWER_READ_RACE');return {tower:t};}});
 const call=async(path='/api/atlas-operations',method='GET')=>{const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};await handler({url:path,method,headers:{}},res);return res;};
 return {state,call};
}
test('anonymous request is rejected before token acquisition or source read',async()=>{
 const {state,call}=setup();state.denied={status:401,body:{error:'AUTH_REQUIRED'}};
 for(const route of ['atlas-operations','atlas-operations-ui'])assert.equal((await call('/api/'+route)).statusCode,401);
 assert.equal(state.reads,0);assert.equal(state.tokens,0);
});
test('auth storage failure is closed and contains no private diagnostic',async()=>{
 const {state,call}=setup();state.authFailure=true;const r=await call();assert.equal(r.statusCode,503);assert.equal(r.body,'{"error":"AUTH_UNAVAILABLE"}');assert.equal(state.reads,0);
});
test('GET-only and malformed query checks happen before source access',async()=>{
 const {state,call}=setup();assert.equal((await call('/api/atlas-operations','POST')).statusCode,405);
 assert.equal((await call('/api/atlas-operations?limit=101')).statusCode,400);assert.equal(state.reads,0);
});
test('private response has no cache or CORS permission',async()=>{
 const {call}=setup(),r=await call();assert.equal(r.statusCode,200);assert.equal(JSON.parse(r.body).access,'PRIVATE');
 assert.equal(r.headers['Cache-Control'],'private, no-store');assert.equal(r.headers['Access-Control-Allow-Origin'],undefined);
});
test('one read race retries within same operation, repeated race returns 503',async()=>{
 const {state,call}=setup();state.races=1;assert.equal((await call()).statusCode,200);assert.equal(state.reads,2);
 state.races=2;assert.equal((await call()).statusCode,503);assert.equal(state.reads,4);
});
test('private UI is nonce protected and requires no Tower/token read',async()=>{
 const {state,call}=setup(),r=await call('/api/atlas-operations-ui');assert.equal(r.statusCode,200);assert.ok(r.body.includes('<!doctype html>'));
 assert.ok(r.headers['Content-Security-Policy'].includes("default-src 'none'"));assert.equal(state.reads,0);assert.equal(state.tokens,0);
});
