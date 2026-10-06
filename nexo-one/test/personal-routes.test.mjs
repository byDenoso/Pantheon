import {atlasTestSession} from './helpers/atlas-session.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import handler from '../server/handler.mjs';
import {makeSession} from '../server/auth/session.mjs';
import {clearProviderCache} from '../server/adapters/registry.mjs';

const read=()=>readFile(new URL('../server/handler.mjs',import.meta.url),'utf8');

test('personal snapshot and action routes are explicitly mounted behind the private session boundary',async()=>{
  const handler=await read();
  assert.match(handler,/buildPersonalSnapshot/);
  assert.match(handler,/executePersonalAction/);
  assert.match(handler,/route==='personal'/);
  assert.match(handler,/route==='personal-action'/);
  assert.match(handler,/if\(!privateAccess\)return send\(\{error:'AUTH_REQUIRED'\},401\)/);
});

test('personal mutation is handled before the global GET-only guard and remains same-origin',async()=>{
  const handler=await read();
  const actionIndex=handler.indexOf("route==='personal-action'");
  const globalWriteGuard=handler.indexOf("req.method!=='GET')return send({error:'WRITES_DISABLED'}");
  assert.ok(actionIndex>0&&globalWriteGuard>actionIndex);
  const actionBlock=handler.slice(actionIndex,globalWriteGuard);
  assert.match(actionBlock,/sameOrigin\(req\)/);
  assert.match(actionBlock,/req\.method!=='POST'/);
  assert.match(actionBlock,/approval/);
});

test('private personal reads use the request OIDC and reject anonymous access before provider calls',async t=>{
  const atlasSession=atlasTestSession(t);
  const fixture={NEXO_SESSION_SECRET:'test-only-personal-session-secret-32-characters',NEXO_PASSWORD_HASH:'configured',
    GOOGLE_CONNECTOR:'google/test-personal',VERCEL_OIDC_TOKEN:'stale-build-identity',
    NEXO_SOURCE_URL:'https://nexo.test/private-snapshot'};
  const previous=Object.fromEntries(Object.keys(fixture).map(key=>[key,process.env[key]]));
  const originalFetch=globalThis.fetch;const authorizations=[];
  Object.assign(process.env,fixture);clearProviderCache();
  globalThis.fetch=atlasSession.wrap(async(url,options={})=>{
    const target=String(url);
    if(target.startsWith('https://api.vercel.com/v1/connect/token/')){
      authorizations.push(options.headers.Authorization);
      return Response.json({token:'test-only-google-token'});
    }
    if(target.startsWith('https://nexo.test/'))return Response.json({version:'1',revision:'fixture',items:[]});
    return Response.json({files:[],items:[],messages:[]});
  });
  const invoke=async(cookie)=>{
    let output;const response={setHeader(){},end(body){output=JSON.parse(body);}};
    await handler({method:'GET',url:'/api/personal',headers:{host:'nexo-one-two.vercel.app',cookie,
      'x-vercel-oidc-token':'request-personal-identity'}},response);
    return {status:response.statusCode,output};
  };
  try{
    assert.equal((await invoke('')).status,401);assert.equal(authorizations.length,0);
    const result=await invoke(atlasSession.cookie+'; nexo_session='+makeSession(process.env));
    assert.equal(result.status,200);assert.equal(authorizations.length,3);
    assert.ok(authorizations.every(value=>value==='Bearer request-personal-identity'));
    assert.ok(result.output.providers.filter(p=>['gmail','calendar','drive'].includes(p.id)).every(p=>p.status==='AVAILABLE'));
    assert.ok(!JSON.stringify(result.output).includes('request-personal-identity'));
  }finally{
    globalThis.fetch=originalFetch;clearProviderCache();
    for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
