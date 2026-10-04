import test from 'node:test';
import assert from 'node:assert/strict';
import {googleConnectToken,googleRuntimeEnvironment,GOOGLE_AUTH_DIAGNOSTICS} from '../server/adapters/connect.mjs';
const env=Object.freeze({GOOGLE_CONNECTOR:'google/test-only',GOOGLE_CONNECT_SUBJECT_ID:'owner',VERCEL_OIDC_TOKEN:'synthetic-oidc'});
const scopes=['https://www.googleapis.com/auth/drive.readonly'];
async function mock(response,fn){
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return response;};
  try{await fn(calls);}finally{globalThis.fetch=original;}
}
test('current request OIDC precedes stale environment without mutating environment',()=>{
  const value=googleRuntimeEnvironment(env,{'x-vercel-oidc-token':'request-oidc'});
  assert.equal(value.VERCEL_OIDC_TOKEN,'request-oidc');
  assert.equal(env.VERCEL_OIDC_TOKEN,'synthetic-oidc');
  assert.equal(value.GOOGLE_CONNECT_SUBJECT_ID,'owner');
  assert.equal(googleRuntimeEnvironment(env,{}),env);
});
for(const [changes,diagnostic] of [
  [{GOOGLE_CONNECTOR:''},'CONNECTOR_MISSING'],
  [{GOOGLE_CONNECTOR:'google//bad'},'CONNECTOR_INVALID'],
  [{VERCEL_OIDC_TOKEN:''},'OIDC_MISSING'],
  [{VERCEL_OIDC_TOKEN:'a\nb'},'OIDC_INVALID'],
  [{VERCEL_OIDC_TOKEN:'x'.repeat(16385)},'OIDC_INVALID']
])test(`configuration diagnostic ${diagnostic} occurs before I/O`,async()=>mock(null,async calls=>{
  await assert.rejects(()=>googleConnectToken({...env,...changes}),{code:'AUTH_REQUIRED',googleDiagnostic:diagnostic});
  assert.equal(calls.length,0);
}));
for(const [status,provider,diagnostic,code] of [
  [401,'unauthorized','CONNECT_UNAUTHORIZED','AUTH_REQUIRED'],
  [403,'unknown','CONNECT_FORBIDDEN','AUTH_REQUIRED'],
  [403,'user_authorization_required','CONNECT_USER_AUTHORIZATION_REQUIRED','AUTH_REQUIRED'],
  [403,'no_token','CONNECT_NO_TOKEN','AUTH_REQUIRED'],
  [403,'client_installation_required','CONNECT_INSTALLATION_REQUIRED','AUTH_REQUIRED'],
  [403,'connector_installation_required','CONNECT_INSTALLATION_REQUIRED','AUTH_REQUIRED'],
  [429,'whatever','CONNECT_RATE_LIMITED','RATE_LIMITED'],
  [503,'__proto__','CONNECT_UNAVAILABLE','UNAVAILABLE']
])test(`HTTP ${status}/${provider} emits only a closed diagnostic`,async()=>mock(Response.json({error:{code:provider,message:'secret-body-token'},token:'secret-body-token'},{status}),async calls=>{
  let observed;
  try{await googleConnectToken(env,undefined,{scopes});}catch(error){observed=error;}
  assert.equal(observed.code,code);
  assert.equal(observed.googleDiagnostic,diagnostic);
  assert.equal(JSON.stringify(observed).includes('secret-body-token'),false);
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.redirect,'error');
  assert.deepEqual(JSON.parse(calls[0].options.body),{subject:{type:'user',id:'owner'},scopes});
}));
test('oversized failure body retains status without leaking or retrying',async()=>mock(new Response('secret'.repeat(20000),{status:403}),async calls=>{
  await assert.rejects(()=>googleConnectToken(env),{code:'AUTH_REQUIRED',googleDiagnostic:'CONNECT_FORBIDDEN'});
  assert.equal(calls.length,1);
}));
test('invalid success payload is classified',async()=>mock(Response.json({token:null}),async()=>{
  await assert.rejects(()=>googleConnectToken(env),{code:'AUTH_REQUIRED',googleDiagnostic:'CONNECT_INVALID_RESPONSE'});
}));
test('unknown provider diagnostic is suppressed',async()=>mock(Response.json({error:{code:'secret-user@example.test'}},{status:403}),async()=>{
  await assert.rejects(()=>googleConnectToken(env),{code:'AUTH_REQUIRED',googleDiagnostic:'CONNECT_FORBIDDEN'});
}));
test('diagnostic registry is a frozen allowlist',()=>{
  assert.equal(Object.isFrozen(GOOGLE_AUTH_DIAGNOSTICS),true);
  assert.ok(GOOGLE_AUTH_DIAGNOSTICS.every(v=>/^[A-Z_]+$/.test(v)));
});
