import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {scryptSync} from 'node:crypto';
import {createHandler} from '../server/handler.mjs';
import {makeSession} from '../server/auth/session.mjs';

const salt='1'.repeat(32),password='test-only-password';
const env={NEXO_SESSION_SECRET:'test-only-secret-at-least-32-characters',NEXO_PASSWORD_HASH:`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`};
const now=Date.now();
function request({method='GET',route='world',body,cookie=true,origin='https://nexo.test'}={}){
  const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);req.method=method;req.url=`/api/index?route=${route}`;req.headers={host:'nexo.test',origin,...(cookie?{cookie:`nexo_session=${makeSession(env,now)}`}:{})};return req;
}
function response(){let payload='';const headers={};return {headers,statusCode:200,setHeader(k,v){headers[k.toLowerCase()]=v;},end(v=''){payload+=v;},get body(){return payload?JSON.parse(payload):null;},get headers(){return headers;}};}
function fakeBroker(){const calls=[];return {calls,clear(){calls.push(['clear']);},recentActions(){return [{receipt_id:'R1',status:'PASS'}];},async planAction(input){calls.push(['plan',input]);return {receipt_id:'R1',status:'GATED'};},async executeAction(input,ctx){calls.push(['execute',input,ctx.confirmed]);return {receipt_id:'R1',status:'PASS'};},async readbackAction(id){calls.push(['readback',id]);return {receipt_id:id,status:'PASS'};}};}

test('public action POST is denied before broker invocation',async()=>{
  const broker=fakeBroker(),handler=createHandler({broker,envProvider:()=>env,nowProvider:()=>now}),res=response();
  await handler(request({method:'POST',route:'actions-plan',body:{},cookie:false}),res);
  assert.equal(res.statusCode,401);assert.equal(res.body.error,'AUTH_REQUIRED');assert.equal(broker.calls.length,0);
});

test('private action POST requires same origin',async()=>{
  const broker=fakeBroker(),handler=createHandler({broker,envProvider:()=>env,nowProvider:()=>now}),res=response();
  await handler(request({method:'POST',route:'actions-plan',body:{},origin:'https://evil.test'}),res);
  assert.equal(res.statusCode,403);assert.equal(res.body.error,'ORIGIN_REJECTED');assert.equal(broker.calls.length,0);
});

test('plan execute readback remain separate routes',async()=>{
  const broker=fakeBroker(),handler=createHandler({broker,envProvider:()=>env,nowProvider:()=>now});
  let res=response();await handler(request({method:'POST',route:'actions-plan',body:{action_id:'A1'}}),res);assert.equal(res.body.status,'GATED');
  res=response();await handler(request({method:'POST',route:'actions-execute',body:{intent:{action_id:'A1'},confirmation:'CONFIRM'}}),res);assert.equal(res.body.status,'PASS');
  res=response();await handler(request({method:'POST',route:'actions-readback',body:{receipt_id:'R1'}}),res);assert.equal(res.body.status,'PASS');
  assert.deepEqual(broker.calls.map(x=>x[0]),['plan','execute','readback']);
});

test('arbitrary non-action writes stay disabled',async()=>{
  const broker=fakeBroker(),handler=createHandler({broker,envProvider:()=>env,nowProvider:()=>now}),res=response();
  await handler(request({method:'POST',route:'world',body:{anything:true}}),res);assert.equal(res.statusCode,405);assert.equal(res.body.error,'WRITES_DISABLED');
});

test('malformed or oversized action body is safely rejected',async()=>{
  const broker=fakeBroker(),handler=createHandler({broker,envProvider:()=>env,nowProvider:()=>now});
  const bad=Readable.from(['{']);bad.method='POST';bad.url='/api/index?route=actions-plan';bad.headers={host:'nexo.test',origin:'https://nexo.test',cookie:`nexo_session=${makeSession(env,now)}`};let res=response();await handler(bad,res);assert.equal(res.statusCode,400);assert.equal(res.body.error,'INVALID_INTENT');
  res=response();await handler(request({method:'POST',route:'actions-plan',body:{x:'a'.repeat(70000)}}),res);assert.equal(res.statusCode,413);assert.equal(res.body.error,'BODY_TOO_LARGE');
});

test('logout clears provider and broker runtime caches',async()=>{
  const broker=fakeBroker(),handler=createHandler({broker,envProvider:()=>env,nowProvider:()=>now}),res=response();
  await handler(request({method:'DELETE',route:'session'}),res);assert.equal(res.statusCode,200);assert.ok(broker.calls.some(x=>x[0]==='clear'));
});

test('recent actions requires private access and is read-only GET',async()=>{
  const broker=fakeBroker(),handler=createHandler({broker,envProvider:()=>env,nowProvider:()=>now});let res=response();
  await handler(request({route:'actions-recent'}),res);assert.equal(res.body.actions[0].receipt_id,'R1');
  res=response();await handler(request({route:'actions-recent',cookie:false}),res);assert.equal(res.statusCode,401);
});
