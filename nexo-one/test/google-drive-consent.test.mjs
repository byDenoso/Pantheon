import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {makeSession} from '../server/auth/session.mjs';
import {googleDriveConsentRoute,googleDriveConsentReturn,GOOGLE_DRIVE_CONSENT} from '../server/auth/google-drive-consent.mjs';
import {TOWER_ID} from '../server/mcp/operational-state.mjs';

const now=Date.parse('2026-10-04T02:30:00Z');
const salt='4'.repeat(32);
const env={NEXO_SESSION_SECRET:'synthetic-owner-session-secret-at-least-32-bytes',
  NEXO_PASSWORD_HASH:`scrypt$${salt}$${scryptSync('synthetic-password',salt,64).toString('hex')}`,
  GOOGLE_CONNECTOR:'google/alizarin-saddle',GOOGLE_CONNECT_SUBJECT_ID:'owner',VERCEL_OIDC_TOKEN:'synthetic-project-oidc',VERCEL_ENV:'production'};
const scope='https://www.googleapis.com/auth/drive.readonly';
const request=(method='GET',session=makeSession(env,now),extra={})=>({method,url:'/api/google-drive-consent',headers:{
  host:'nexo-one-two.vercel.app',origin:'https://nexo-one-two.vercel.app',cookie:`nexo_session=${session}`,...extra}});
const cookieHeader=out=>(Array.isArray(out.setCookie)?out.setCookie:[out.setCookie]).filter(Boolean).map(v=>v.split(';')[0]).join('; ');
async function setup(){const req=request();const out=await googleDriveConsentRoute(req,env,now);return {req,csrfToken:out.body.csrfToken};}
async function start({req,csrfToken},options={}){
  let args;
  const out=await googleDriveConsentRoute({...req,method:'POST'},env,now,{body:{action:'start',csrfToken,approveReadOnly:true},
    startAuthorizationImpl:async(...a)=>{args=a;return {url:'https://connect.vercel.com/authorize/sca_synthetic',request:'secret-request',verifier:'secret-verifier'};},...options});
  return {out,args};
}
async function returned(){
  const state=await setup(),{out,args}=await start(state),nonce=new URL(args[2].callbackUrl).searchParams.get('state');
  const callback={...state.req,url:'/api/google-drive-return?state='+nonce,headers:{...state.req.headers,cookie:cookieHeader(out)}};
  const result=googleDriveConsentReturn(callback,env,now+10);
  assert.equal(result.status,303);
  return {...state,start:out,callback,result,req:{...state.req,headers:{...state.req.headers,cookie:state.req.headers.cookie+'; '+cookieHeader(result)}}};
}

test('preparation is owner-only and makes no outbound request',async()=>{
  const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('unexpected outbound request');};
  try{
    assert.equal((await googleDriveConsentRoute(request('GET',''),env,now)).status,401);
    const out=await googleDriveConsentRoute(request(),env,now);
    assert.equal(out.status,200);assert.deepEqual(out.body.scopes,[scope]);assert.deepEqual(out.body.subject,{type:'user',id:'owner'});
    assert.equal(out.body.canVerify,false);assert.equal(out.body.pending,false);assert.ok(out.body.csrfToken);
    assert.equal(Object.isFrozen(GOOGLE_DRIVE_CONSENT.scopes),true);
  }finally{globalThis.fetch=original;}
});
for(const change of [{GOOGLE_CONNECTOR:'google/another'},{GOOGLE_CONNECT_SUBJECT_ID:'other'},{VERCEL_ENV:'preview'},{VERCEL_CONNECT_INTERACTIVE_AUTH_MODE:'detached'}])
  test('configuration changes fail closed '+JSON.stringify(change),async()=>{
    const out=await googleDriveConsentRoute(request(),{...env,...change},now);
    assert.equal(out.status,503);assert.equal(out.body.error,'GOOGLE_CONSENT_CONFIGURATION_MISMATCH');
  });
test('request host cannot choose the callback origin',async()=>{
  const out=await googleDriveConsentRoute(request('GET',undefined,{host:'evil.example'}),env,now);
  assert.equal(out.status,503);
});
test('start fixes connector, owner, only Drive scope and callback origin',async()=>{
  const state=await setup(),{out,args}=await start(state);
  assert.equal(out.status,200);assert.equal(args[0],env.GOOGLE_CONNECTOR);
  assert.deepEqual(args[1],{subject:{type:'user',id:'owner'},scopes:[scope]});
  assert.equal(args[2].vercelToken,'synthetic-project-oidc');assert.equal(args[2].expiresInMs,600000);
  assert.equal(args[2].deviceCode,false);
  const callback=new URL(args[2].callbackUrl);
  assert.equal(callback.origin,GOOGLE_DRIVE_CONSENT.origin);assert.equal(callback.pathname,'/api/google-drive-return');
  assert.match(callback.searchParams.get('state'),/^[0-9a-f]{64}$/);
  assert.ok(out.setCookie.some(v=>v.startsWith('nexo_drive_consent=')&&v.includes('HttpOnly; Secure; SameSite=Lax')));
  assert.ok(out.setCookie.some(v=>v.startsWith('nexo_drive_pending=')&&v.includes('SameSite=Strict')));
  assert.equal(JSON.stringify(out).includes('secret-verifier'),false);assert.equal(JSON.stringify(out).includes('synthetic-project-oidc'),false);
});
for(const body of [{approveReadOnly:false},{scopes:['*']},{subject:{type:'app'}},{connector:'other'},{callbackUrl:'https://evil.example'},{action:'delete'}])
  test('unapproved or request-controlled parameters rejected '+JSON.stringify(body),async()=>{
    const state=await setup();let calls=0;
    const out=await googleDriveConsentRoute({...state.req,method:'POST'},env,now,{body:{action:'start',approveReadOnly:true,csrfToken:state.csrfToken,...body},startAuthorizationImpl:async()=>{calls++;}});
    assert.equal(out.status,400);assert.equal(calls,0);
  });
for(const origin of ['https://evil.example','http://nexo-one-two.vercel.app',''])
  test('cross-site or invalid Origin cannot start '+origin,async()=>{
    const state=await setup();let calls=0;
    const out=await googleDriveConsentRoute({...state.req,method:'POST',headers:{...state.req.headers,origin}},env,now,{body:{action:'start',csrfToken:state.csrfToken,approveReadOnly:true},startAuthorizationImpl:async()=>{calls++;}});
    assert.equal(out.status,403);assert.equal(calls,0);
  });
test('CSRF is signed, session-bound and expires',async()=>{
  const state=await setup();let calls=0;
  for(const [req,time,csrfToken] of [[request('POST'),now,state.csrfToken],[{...state.req,method:'POST'},now+600001,state.csrfToken],[{...state.req,method:'POST'},now,state.csrfToken+'tampered']]){
    const out=await googleDriveConsentRoute(req,env,time,{body:{action:'start',csrfToken,approveReadOnly:true},startAuthorizationImpl:async()=>{calls++;}});
    assert.equal(out.status,403);
  }
  assert.equal(calls,0);
});
test('missing OIDC fails before SDK and current request OIDC has precedence',async()=>{
  const state=await setup();let calls=0;
  const no=await googleDriveConsentRoute({...state.req,method:'POST'},{...env,VERCEL_OIDC_TOKEN:''},now,{body:{action:'start',csrfToken:state.csrfToken,approveReadOnly:true},startAuthorizationImpl:async()=>{calls++;}});
  assert.equal(no.status,503);assert.equal(calls,0);
  const {args}=await start({...state,req:{...state.req,headers:{...state.req.headers,'x-vercel-oidc-token':'synthetic-current-oidc'}}});
  assert.equal(args[2].vercelToken,'synthetic-current-oidc');
});
test('SDK authorization denial is sanitized, one request, no fallback',async()=>{
  const state=await setup();let calls=0;
  const {out}=await start(state,{startAuthorizationImpl:async()=>{calls++;throw Object.assign(new Error('private token raw provider body'),{status:403,code:'forbidden'});}});
  assert.equal(out.status,401);assert.equal(out.body.error,'GOOGLE_AUTHORIZATION_DENIED');assert.equal(calls,1);
  assert.equal(JSON.stringify(out).includes('private token'),false);assert.equal(out.setCookie,undefined);
});
test('timed-out SDK initiation is uncertain rather than cancelled, and is not retried',async()=>{
  const state=await setup();let calls=0,finish;
  const {out}=await start(state,{startTimeoutMs:5,startAuthorizationImpl:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
  assert.equal(out.status,504);assert.equal(out.body.error,'GOOGLE_CONSENT_START_UNCERTAIN');assert.equal(calls,1);
  const pendingReq={...state.req,method:'POST',headers:{...state.req.headers,cookie:state.req.headers.cookie+'; '+cookieHeader(out)}};
  const again=await googleDriveConsentRoute(pendingReq,env,now+100,{body:{action:'start',csrfToken:state.csrfToken,approveReadOnly:true},startAuthorizationImpl:async()=>{calls++;}});
  assert.equal(again.body.error,'CONSENT_ALREADY_PENDING');assert.equal(calls,1);
  const info=await googleDriveConsentRoute({...pendingReq,method:'GET'},env,now+100);
  assert.equal(info.body.pending,true);assert.equal(info.body.startUncertain,true);
  finish({url:'https://connect.vercel.com/authorize/sca_late',verifier:'late-secret'});
  await Promise.resolve();assert.equal(calls,1);assert.equal(JSON.stringify(out).includes('late-secret'),false);
});
for(const url of ['https://evil.example/authorize/x','http://connect.vercel.com/authorize/x','https://connect.vercel.com.evil.example/authorize/x','https://user@connect.vercel.com/authorize/x','https://connect.vercel.com/authorize/x#token'])
  test('unexpected consent URL is withheld and marked uncertain '+url,async()=>{
    const state=await setup(),{out}=await start(state,{startAuthorizationImpl:async()=>({url})});
    assert.equal(out.status,504);assert.equal(out.body.authorizationUrl,undefined);assert.equal(out.body.error,'GOOGLE_CONSENT_START_UNCERTAIN');
  });
test('callback validates signed flow and exact nonce without issuing application access',async()=>{
  const state=await returned();
  assert.equal(state.result.location,'/google-drive-connect.html?returned=1');
  assert.equal(state.result.setCookie.some(v=>v.startsWith('nexo_session=')),false);
  assert.ok(state.result.setCookie.some(v=>v.startsWith('nexo_drive_return=')&&v.includes('HttpOnly; Secure; SameSite=Strict')));
  assert.equal(state.result.body.status,'VERIFY_DRIVE_READBACK');
  const info=await googleDriveConsentRoute(state.req,env,now+20);assert.equal(info.body.canVerify,true);
});
test('callback rejects missing/forged/duplicate/expired state and a different owner session',async()=>{
  const state=await returned();
  for(const callback of [
    {...state.callback,url:'/api/google-drive-return'},
    {...state.callback,url:'/api/google-drive-return?state=forged'},
    {...state.callback,url:state.callback.url+'&state=other'},
    {...state.callback,headers:{...state.callback.headers,cookie:cookieHeader(state.start).replace('nexo_drive_consent=','nexo_drive_consent=tamper')}}
  ])assert.equal(googleDriveConsentReturn(callback,env,now+20).status,400);
  assert.equal(googleDriveConsentReturn(state.callback,env,now+600001).status,400);
  const other=request();
  assert.equal(googleDriveConsentReturn({...state.callback,headers:{...state.callback.headers,cookie:cookieHeader(state.start)+'; '+other.headers.cookie}},env,now+20).status,403);
});
test('a superseded tab callback cannot use the newer flow cookie',async()=>{
  const state=await setup(),first=await start(state),second=await start(state);
  const oldNonce=new URL(first.args[2].callbackUrl).searchParams.get('state');
  const req={...state.req,url:'/api/google-drive-return?state='+oldNonce,
    headers:{...state.req.headers,cookie:cookieHeader(second.out)}};
  assert.equal(googleDriveConsentReturn(req,env,now+20).status,400);
});
test('verification requires the initiating session return proof and no secret reaches clients',async()=>{
  const state=await returned();let calls=0;
  const out=await googleDriveConsentRoute({...state.req,method:'POST'},env,now+20,{body:{action:'verify',csrfToken:state.csrfToken},
    tokenImpl:async(e,signal,options)=>{calls++;assert.equal(e.VERCEL_OIDC_TOKEN,env.VERCEL_OIDC_TOKEN);assert.ok(signal instanceof AbortSignal);assert.deepEqual(options.scopes,[scope]);return 'secret-provider-token';},
    readTowerImpl:async({token,fetchImpl})=>{assert.equal(token,'secret-provider-token');assert.equal(typeof fetchImpl,'function');return {authority:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',readback:'PASS',revision:'sha256:'+'a'.repeat(64)};}});
  assert.equal(out.status,200);assert.equal(out.body.status,'DRIVE_VERIFIED');assert.equal(calls,1);
  assert.equal(JSON.stringify(out).includes('secret-provider-token'),false);assert.deepEqual(out.body.scopes,[scope]);
  const other=await setup();
  const wrong={...other.req,method:'POST',headers:{...other.req.headers,cookie:other.req.headers.cookie+'; '+cookieHeader(state.result)}};
  assert.equal((await googleDriveConsentRoute(wrong,env,now+20,{body:{action:'verify',csrfToken:other.csrfToken},tokenImpl:async()=>{calls++;}})).body.error,'CONSENT_RETURN_REQUIRED');
  assert.equal(calls,1);
});
test('verification refuses pending consent and invalid canonical readback',async()=>{
  const initial=await setup();assert.equal((await googleDriveConsentRoute({...initial.req,method:'POST'},env,now,{body:{action:'verify',csrfToken:initial.csrfToken}})).status,409);
  const state=await returned();
  const failed=await googleDriveConsentRoute({...state.req,method:'POST'},env,now+20,{body:{action:'verify',csrfToken:state.csrfToken},
    tokenImpl:async()=>{throw Object.assign(new Error('private provider body'),{code:'AUTH_REQUIRED',googleDiagnostic:'CONNECT_USER_AUTHORIZATION_REQUIRED'});}});
  assert.equal(failed.body.error,'GOOGLE_USER_AUTHORIZATION_REQUIRED');assert.equal(failed.setCookie,undefined);
  const invalid=await googleDriveConsentRoute({...state.req,method:'POST'},env,now+20,{body:{action:'verify',csrfToken:state.csrfToken},tokenImpl:async()=> 'synthetic',readTowerImpl:async()=>({readback:'PASS'})});
  assert.equal(invalid.body.error,'DRIVE_CANONICAL_READBACK_FAILED');
});
test('official SDK is exercised against a synthetic authorization response only',async()=>{
  const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return Response.json({url:'https://connect.vercel.com/authorize/sca_synthetic',request:'synthetic-request',verifier:'synthetic-verifier'});};
  try{
    const state=await setup();const out=await googleDriveConsentRoute({...state.req,method:'POST'},env,now,{body:{action:'start',csrfToken:state.csrfToken,approveReadOnly:true}});
    assert.equal(out.status,200);assert.equal(calls.length,1);assert.match(calls[0].url,/^https:\/\/api(?:-[a-z0-9]+)?\.vercel\.com\/v1\/connect\/authorize\/google%2Falizarin-saddle$/);
    const body=JSON.parse(calls[0].options.body);assert.deepEqual(body.subject,{type:'user',id:'owner'});assert.deepEqual(body.scopes,[scope]);assert.equal(body.deviceCode,false);
    assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-project-oidc');assert.equal(JSON.stringify(out.body).includes('synthetic-verifier'),false);
  }finally{globalThis.fetch=original;}
});
test('canonical verification uses the real Tower reader and only synthetic GET fixtures',async()=>{
  const original=globalThis.fetch,calls=[];
  const tower={contract:'NEXO_TOWER_LIVE_V1',stable_file_id:TOWER_ID,storage:'GOOGLE_DRIVE_PRIVATE',revision:'sha256:'+'b'.repeat(64),state_fingerprint:'sha256:'+'b'.repeat(64),files:{}};
  const raw=JSON.stringify(tower),meta={id:TOWER_ID,headRevisionId:'synthetic-revision',size:String(Buffer.byteLength(raw)),md5Checksum:createHash('md5').update(raw).digest('hex')};
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return String(url).includes('alt=media')?new Response(raw):Response.json(meta);};
  try{
    const state=await returned();const out=await googleDriveConsentRoute({...state.req,method:'POST'},env,now+20,{body:{action:'verify',csrfToken:state.csrfToken},tokenImpl:async()=> 'synthetic-token'});
    assert.equal(out.body.status,'DRIVE_VERIFIED');assert.equal(calls.length,3);
    assert.ok(calls.every(x=>x.options.method===undefined&&x.options.signal instanceof AbortSignal));
    assert.ok(calls.every(x=>x.url.startsWith('https://www.googleapis.com/drive/v3/files/'+TOWER_ID+'?')));
  }finally{globalThis.fetch=original;}
});
test('mounted routes and page preserve CSP, explicit scope approval and separate pilot result',async()=>{
  const handler=await readFile(new URL('../server/handler.mjs',import.meta.url),'utf8');
  assert.match(handler,/route==='google-drive-consent'\|\|route==='google-drive-return'/);
  assert.ok(handler.indexOf("route==='google-drive-consent'")<handler.indexOf("if(req.method!=='GET')return send({error:'WRITES_DISABLED'}"));
  const html=await readFile(new URL('../public/google-drive-connect.html',import.meta.url),'utf8');
  assert.match(html,/type="password" autocomplete="current-password"/);assert.match(html,/id="approve" type="checkbox" required/);
  assert.match(html,/somente leitura/);assert.match(html,/O teste de soma requer/);assert.doesNotMatch(html,/<script>([\s\S])*<\/script>/);
  const js=await readFile(new URL('../public/google-drive-connect.js',import.meta.url),'utf8');
  assert.doesNotMatch(js,/localStorage|sessionStorage|window\.open/);assert.match(js,/GOOGLE_CONSENT_START_UNCERTAIN/);assert.match(js,/if\(busy\)return/);
});
