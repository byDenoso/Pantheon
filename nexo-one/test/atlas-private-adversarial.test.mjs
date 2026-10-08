import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,scryptSync} from 'node:crypto';
import handler from '../server/handler.mjs';
import {RESEARCH_ROUTES} from '../server/compiler/atlas-research-api.mjs';
import {readAtlasPrivatePublication} from '../server/atlas/private-source.mjs';

const salt='c'.repeat(32);
const env={
  NEXO_ATLAS_PIN_HASH:`scrypt$${salt}$${scryptSync('synthetic-review-passphrase',salt,64).toString('hex')}`,
  NEXO_ATLAS_ORIGIN:'https://atlas.example',
  NEXO_ATLAS_REDIS_URL:'https://store.example',
  NEXO_ATLAS_REDIS_TOKEN:'synthetic-store-token',
  NEXO_ATLAS_PRIVATE_SOURCE_URL:'https://private.example/snapshot',
  NEXO_ATLAS_PRIVATE_SOURCE_TOKEN:'synthetic-source-token',
  NEXO_PASSWORD_HASH:'',
  NEXO_SESSION_SECRET:''
};
const sha=value=>createHash('sha256').update(value).digest('hex');
const MAX_BYTES=16*1024*1024;
const publicResult={contract:'ATLAS_PUBLIC_V1',items:[],links:[]};

function useEnvironment(t){
  const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
  Object.assign(process.env,env);
  t.after(()=>{
    for(const [key,value] of Object.entries(previous)){
      if(value===undefined)delete process.env[key];
      else process.env[key]=value;
    }
  });
}

async function request(url,{method='GET',headers={}}={}){
  const res={
    headers:{},
    setHeader(key,value){this.headers[key]=value;},
    end(value){this.body=value?JSON.parse(value):null;}
  };
  await handler({url,method,headers:{host:'atlas.example',origin:env.NEXO_ATLAS_ORIGIN,...headers}},res);
  return res;
}

test('actual handler denies the full anonymous route/method/alias matrix before upstream reads',async t=>{
  useEnvironment(t);
  let reads=0;
  t.mock.method(globalThis,'fetch',async()=>{reads++;throw Error('unexpected upstream read');});
  const routes=new Set([
    'world','system','health','now','loops','day','context','recall','atlas-private',
    'atlas-public-ssot','mcp','mcp/status','projection-sync','personal','personal-action',
    'inbox-drop','google-drive-consent',...RESEARCH_ROUTES
  ]);
  let checked=0;
  for(const route of routes){
    const urls=[
      `/api/${route}`,
      `/api/index?route=${encodeURIComponent(route)}`,
      `/api/atlas-public?route=${encodeURIComponent(route)}`
    ];
    for(const method of ['GET','POST','HEAD'])for(const url of urls){
      const res=await request(url,{method});
      assert.equal(res.statusCode,401,`${method} ${url}`);
      assert.deepEqual(res.body,{error:'AUTH_REQUIRED'});
      assert.equal(res.headers['Cache-Control'],'private, no-store');
      assert.match(res.headers.Vary,/Cookie/);
      checked++;
    }
  }
  assert.ok(checked>=306);
  assert.equal(reads,0);
});

test('machine-route exceptions reject absent and malformed machine credentials independently',async t=>{
  useEnvironment(t);
  let reads=0;
  t.mock.method(globalThis,'fetch',async()=>{reads++;throw Error('unexpected upstream read');});
  for(const route of ['inbox-list','inbox-ack','atlas-ssot','projections']){
    for(const authorization of ['', 'Bearer synthetic-invalid-token']){
      for(const url of [`/api/${route}`,`/api/index?route=${route}`]){
        const res=await request(url,{headers:{authorization,cookie:'__Host-atlas_session='+'a'.repeat(64)}});
        assert.equal(res.statusCode,403,`${route}: ${authorization||'anonymous'}`);
        assert.ok(['ROBOT_ONLY','ATLAS_SERVICE_REQUIRED'].includes(res.body.error));
      }
    }
  }
  assert.equal(reads,0);
});

test('public output stays empty for route aliases, untrusted query URLs, and every non-GET method',async t=>{
  useEnvironment(t);
  // Anonymous public fallback must still work before a versioned store is provisioned.
  delete process.env.NEXO_ATLAS_REDIS_URL; delete process.env.NEXO_ATLAS_REDIS_TOKEN;
  let reads=0;
  t.mock.method(globalThis,'fetch',async()=>{reads++;throw Error('unexpected upstream read');});
  for(const url of [
    '/api/atlas-public',
    '/api/index?route=atlas-public',
    '/api/atlas-private?route=atlas-public&url=https%3A%2F%2Funtrusted.example%2Fprivate&refresh=1'
  ]){
    const res=await request(url);
    assert.equal(res.statusCode,200);
    assert.deepEqual(res.body,publicResult);
    for(const method of ['POST','PUT','PATCH','DELETE','HEAD','OPTIONS']){
      const denied=await request(url,{method});
      assert.equal(denied.statusCode,405);
      assert.deepEqual(denied.body,{error:'METHOD_NOT_ALLOWED'});
    }
  }
  assert.equal(reads,0);
});

test('actual handler sanitizes shared-store outages and never reads private data',async t=>{
  useEnvironment(t);
  const urls=[];
  t.mock.method(globalThis,'fetch',async url=>{
    urls.push(String(url));
    throw Error('SYNTHETIC_UPSTREAM_DETAIL_MUST_NOT_LEAK');
  });
  for(const route of ['atlas-private','atlas-session','world','mcp/status']){
    const res=await request(`/api/${route}`,{headers:{cookie:'__Host-atlas_session='+'a'.repeat(64)}});
    assert.equal(res.statusCode,503);
    assert.deepEqual(res.body,{error:'AUTH_UNAVAILABLE'});
    assert.equal(res.headers['Set-Cookie'],undefined);
  }
  assert.equal(urls.length,4);
  assert.ok(urls.every(url=>url===env.NEXO_ATLAS_REDIS_URL));
});

test('actual handler sanitizes private-source outages after a server-side session check',async t=>{
  useEnvironment(t);
  const urls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    urls.push(String(url));
    if(String(url)===env.NEXO_ATLAS_REDIS_URL){
      assert.equal(JSON.parse(options.body)[0],'GET');
      return Response.json({result:JSON.stringify({exp:Date.now()+30000,credential:sha(env.NEXO_ATLAS_PIN_HASH)})});
    }
    assert.equal(String(url),env.NEXO_ATLAS_PRIVATE_SOURCE_URL);
    assert.equal(options.headers.Authorization,'Bearer synthetic-source-token');
    throw Error('SYNTHETIC_SOURCE_DETAIL_MUST_NOT_LEAK');
  });
  const res=await request('/api/atlas-private',{headers:{cookie:'__Host-atlas_session='+'a'.repeat(64)}});
  assert.equal(res.statusCode,503);
  assert.deepEqual(res.body,{error:'PRIVATE_SOURCE_UNAVAILABLE'});
  assert.deepEqual(urls,[env.NEXO_ATLAS_REDIS_URL,env.NEXO_ATLAS_PRIVATE_SOURCE_URL]);
  assert.equal(res.headers['Cache-Control'],'private, no-store');
});

test('private source requires canonical auth by default and rejects unsafe explicit proxy URLs before fetching',async()=>{
  let reads=0;
  const fetcher=async()=>{reads++;throw Error('unexpected upstream read');};
  for(const url of ['not a URL','//private.example/snapshot','http://private.example/snapshot',
    'file:///tmp/private.json','data:application/json,{}','https://user:pass@private.example/snapshot']){
    await assert.rejects(readAtlasPrivatePublication({...env,NEXO_ATLAS_PRIVATE_SOURCE_URL:url},fetcher),/PRIVATE_SOURCE_NOT_CONFIGURED/);
  }
  for(const url of [undefined,''])await assert.rejects(readAtlasPrivatePublication({...env,NEXO_ATLAS_PRIVATE_SOURCE_URL:url},fetcher),/PRIVATE_SOURCE_NOT_CONFIGURED/);
  await assert.rejects(readAtlasPrivatePublication({...env,NEXO_ATLAS_PRIVATE_SOURCE_URL:undefined,NEXO_ATLAS_PRIVATE_SOURCE_TOKEN:undefined},fetcher),/AUTH_REQUIRED/);
  for(const token of [undefined,'']){
    await assert.rejects(readAtlasPrivatePublication({...env,NEXO_ATLAS_PRIVATE_SOURCE_TOKEN:token},fetcher),/PRIVATE_SOURCE_NOT_CONFIGURED/);
  }
  assert.equal(reads,0);
});

test('private source rejects oversized declared bodies before consuming their stream',async()=>{
  let consumed=false;
  await assert.rejects(readAtlasPrivatePublication(env,async()=>({
    ok:true,
    headers:new Headers({'content-length':String(MAX_BYTES+1)}),
    body:(async function*(){consumed=true;yield Buffer.from('{}');})()
  })),/PRIVATE_SOURCE_TOO_LARGE/);
  assert.equal(consumed,false);
});

test('private source enforces the byte cap when content-length is missing or underreported',async()=>{
  for(const declared of [null,'1']){
    let chunks=0,closed=false;
    const headers=new Headers();
    if(declared!==null)headers.set('content-length',declared);
    await assert.rejects(readAtlasPrivatePublication(env,async()=>({
      ok:true,headers,
      body:(async function*(){
        try{for(let n=0;n<20;n++){chunks++;yield Buffer.alloc(1024*1024);}}
        finally{closed=true;}
      })()
    })),/PRIVATE_SOURCE_TOO_LARGE/);
    assert.equal(chunks,17);
    assert.equal(closed,true);
  }
});

test('private source rejects malformed JSON and invalid publication envelopes',async()=>{
  for(const value of [null,[],{},
    {contract:'ATLAS_PUBLIC_V1',data:{}},
    {contract:'ATLAS_PRIVATE_V1'},
    ...[null,[],false,0,'private'].map(data=>({contract:'ATLAS_PRIVATE_V1',data}))]){
    await assert.rejects(readAtlasPrivatePublication(env,async()=>Response.json(value)),/PRIVATE_SOURCE_INVALID/);
  }
  for(const body of ['', '{broken-json', '<html>synthetic login page</html>']){
    await assert.rejects(readAtlasPrivatePublication(env,async()=>new Response(body)),SyntaxError);
  }
});

test('private source rejects redirects and upstream failures without following a fallback',async()=>{
  for(const status of [301,302,307,308,401,403,404,429,500,503]){
    let reads=0;
    await assert.rejects(readAtlasPrivatePublication(env,async(url,options)=>{
      reads++;
      assert.equal(String(url),env.NEXO_ATLAS_PRIVATE_SOURCE_URL);
      assert.equal(options.redirect,'error');
      assert.equal(options.cache,'no-store');
      assert.ok(options.signal instanceof AbortSignal);
      return new Response('synthetic upstream error',{status,headers:{Location:'https://untrusted.example/fallback'}});
    }),/PRIVATE_SOURCE_UNAVAILABLE/);
    assert.equal(reads,1);
  }
  await assert.rejects(readAtlasPrivatePublication(env,async()=>{throw Error('synthetic offline');}),/synthetic offline/);
});
