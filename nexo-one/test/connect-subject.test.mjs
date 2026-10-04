import test from 'node:test';
import assert from 'node:assert/strict';
import {googleConnectToken} from '../server/adapters/connect.mjs';

const base=Object.freeze({GOOGLE_CONNECTOR:'google/test-only',VERCEL_OIDC_TOKEN:'synthetic-oidc'});
const readOnly=Object.freeze(['https://www.googleapis.com/auth/drive.readonly']);
async function captured(fn,status=200){
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url:String(url),...options,body:JSON.parse(options.body)});
    return Response.json(status===200?{token:'synthetic-provider-token'}:{error:'authorization_required'},{status});
  };
  try{await fn(calls);}finally{globalThis.fetch=original;}
}

test('Google uses only the server-configured single-user subject and unchanged scopes',async()=>captured(async calls=>{
  const env=Object.freeze({...base,GOOGLE_CONNECT_SUBJECT_ID:'configured-owner'});
  const token=await googleConnectToken(env,undefined,{scopes:readOnly});
  assert.equal(token,'synthetic-provider-token');
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].body,{subject:{type:'user',id:'configured-owner'},scopes:readOnly});
  assert.equal(calls[0].url,'https://api.vercel.com/v1/connect/token/google%2Ftest-only');
  assert.equal(calls[0].headers.Authorization,'Bearer synthetic-oidc');
  assert.equal(calls[0].redirect,'error');
}));

test('Missing subject uses only the documented owner default',async()=>captured(async calls=>{
  await googleConnectToken(base,undefined,{scopes:readOnly});
  assert.deepEqual(calls[0].body.subject,{type:'user',id:'owner'});
}));

for(const value of ['', ' owner', 'owner ', 'a\nb', 'x'.repeat(257),null,{},1]){
  test(`Malformed configured subject fails before network: ${JSON.stringify(value)}`,async()=>captured(async calls=>{
    await assert.rejects(()=>googleConnectToken({...base,GOOGLE_CONNECT_SUBJECT_ID:value}),{code:'AUTH_REQUIRED'});
    assert.equal(calls.length,0);
  }));
}

for(const status of [401,403]){
  test(`Authorization failure ${status} makes one request without identity or credential fallback`,async()=>captured(async calls=>{
    await assert.rejects(()=>googleConnectToken({...base,GOOGLE_CONNECT_SUBJECT_ID:'owner',GOOGLE_REFRESH_TOKEN:'not-used'}),{code:'AUTH_REQUIRED'});
    assert.equal(calls.length,1);
    assert.deepEqual(calls[0].body.subject,{type:'user',id:'owner'});
  },status));
}

test('Operation scope remains narrow and input options cannot choose the identity',async()=>captured(async calls=>{
  await googleConnectToken({...base,GOOGLE_CONNECT_SUBJECT_ID:'owner'},undefined,{scopes:readOnly,subject:{type:'user',id:'attacker'}});
  assert.deepEqual(calls[0].body.subject,{type:'user',id:'owner'});
  assert.deepEqual(calls[0].body.scopes,readOnly);
}));
