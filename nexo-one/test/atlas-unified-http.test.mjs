import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {buildPrivateUi} from '../scripts/build-private-ui.mjs';
import {validateRuntime} from '../src/private-legacy/runtime.ts';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';
import {createHash,scryptSync} from 'node:crypto';
import handler from '../server/handler.mjs';
import {fetchSession,fetchPublic,fetchPrivate,login,logoutStrict,fetchLocale} from '../src/atlas/api.ts';

test('real HTTP handler and frontend client agree on session/data/locale/logout contracts',async t=>{
  await buildPrivateUi();
  const compiled = compilePrivateTowerRuntime(makePrivateTowerFixture());
  const pin='synthetic-http-integration',salt='d'.repeat(32),values=new Map();
  const retrievalToken='retrieval-secret'; const expectedSubject=createHash('sha256').update('nexo-remote-mcp:'+retrievalToken).digest('hex');
  const env={NEXO_ATLAS_ORIGIN:'https://atlas.example',NEXO_ATLAS_PIN_HASH:`scrypt${salt}${scryptSync(pin,salt,64).toString('hex')}`,NEXO_ATLAS_REDIS_URL:'https://fixture-store.example',NEXO_ATLAS_REDIS_TOKEN:'synthetic',NEXO_ATLAS_PRIVATE_SOURCE_URL:'https://fixture-source.example',NEXO_ATLAS_PRIVATE_SOURCE_TOKEN:'synthetic',NEXO_RETRIEVAL_ENDPOINT:'https://retrieval.example/mcp',NEXO_RETRIEVAL_ATLAS_PRINCIPAL_ID:'atlas-private-owner',NEXO_RETRIEVAL_ATLAS_ROLES:'LEARNER',NEXO_RETRIEVAL_TOKEN_BINDINGS_JSON:JSON.stringify({'atlas-private-owner':{token:retrievalToken}})};
  const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
  t.after(()=>{for(const [k,v] of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;});
  const nativeFetch=globalThis.fetch;let failDelete=false,privateReads=0;
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    if(String(url)==='https://fixture-source.example/'){privateReads++;return Response.json(compiled);}
    if(String(url)===env.NEXO_RETRIEVAL_ENDPOINT){
      const msg=JSON.parse(options.body||'{}');
      if(msg.method==='initialize')return Response.json({jsonrpc:'2.0',id:msg.id,result:{protocolVersion:'2025-11-25',capabilities:{},serverInfo:{name:'nexo',version:'1.3.0'}}});
      if(msg.method==='notifications/initialized')return new Response('',{status:202});
      if(msg.method==='tools/call'&&msg.params?.name==='nexo_retrieval_capabilities')return Response.json({jsonrpc:'2.0',id:msg.id,result:{structuredContent:{authenticated_subject:expectedSubject,roles:['LEARNER'],source_mode:'DRIVE_LIVE_VERIFIED'}}});
      if(msg.method==='tools/call'&&msg.params?.name==='nexo_search')return Response.json({jsonrpc:'2.0',id:msg.id,result:{structuredContent:{answer_status:'EVIDENCE_FOUND',hits:[{id:'TEST::PRIVATE'}]}}});
      throw Error('unexpected retrieval rpc');
    }
    assert.equal(String(url),env.NEXO_ATLAS_REDIS_URL);
    const [command,key,...args]=JSON.parse(options.body);let result;
    if(command==='GET')result=values.get(key)||null;
    else if(command==='SET'){values.set(key,args[0]);result='OK';}
    else if(command==='DEL'){if(failDelete)throw Error('synthetic outage');result=Number(values.delete(key));}
    else if(command==='EVAL'){const k=args[1];result=(values.get(k)||0)+1;values.set(k,result);}
    else throw Error('unexpected command');
    return Response.json({result});
  });
  const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;let cookie='';
  const client=async(url,options={})=>{
    const res=await nativeFetch(base+url,{...options,headers:{...options.headers,Origin:env.NEXO_ATLAS_ORIGIN,Cookie:cookie,'Accept-Language':'en-US'}});
    const setCookie=res.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];return res;
  };
  assert.deepEqual(await fetchPublic(client),{contract:'ATLAS_PUBLIC_V1',items:[],links:[]});
  assert.equal((await fetchLocale(client,null)).locale,'en');
  assert.equal((await fetchLocale(client,'pt-BR')).locale,'pt-BR');
  assert.equal((await fetchSession(client)).authenticated,false);
  await assert.rejects(fetchPrivate(client),e=>e.code==='AUTH_REQUIRED');assert.equal(privateReads,0);
  const anonymousRetrieval=await nativeFetch(base+'/api/atlas-retrieval',{method:'POST',headers:{Origin:env.NEXO_ATLAS_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({name:'nexo_search',args:{query:'TEST'}})});assert.equal(anonymousRetrieval.status,401);
  const signedIn=await login(client,pin),copiedCookie=cookie;
  const session=await fetchSession(client);assert.equal(session.authenticated,true);assert.equal(session.expiresAt,signedIn.expiresAt);
  const retrieval=await client('/api/atlas-retrieval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'nexo_search',args:{query:'TEST',role:'LEARNER'}})});assert.equal(retrieval.status,200);assert.equal((await retrieval.json()).hits[0].id,'TEST::PRIVATE');
  const escalation=await client('/api/atlas-retrieval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'nexo_search',args:{query:'TEST',role:'GUARDIAO'}})});assert.equal(escalation.status,403);assert.equal((await escalation.json()).error,'ROLE_FORBIDDEN');
  const privateData = (await fetchPrivate(client)).data;
  assert.deepEqual(privateData,JSON.parse(JSON.stringify(compiled.data)));
  assert.equal(validateRuntime(privateData).ok,true);
  const frame = await client('/api/atlas-private-ui');
  assert.equal(frame.status,200); assert.match(frame.headers.get('content-type'),/text\/html/);
  assert.match(frame.headers.get('cache-control'),/no-store/);
  const html = await frame.text();
  const asset = html.match(/src="(\/api\/atlas-private-assets\/[^"]+)"/)[1];
  const chunk = await client(asset);assert.equal(chunk.status,200);assert.match(chunk.headers.get('content-type'),/javascript/);
  const anonChunk = await nativeFetch(base+asset);assert.equal(anonChunk.status,401);
  assert.equal((await nativeFetch(base+'/api/atlas-private-ui')).status,401);
  failDelete=true;assert.deepEqual(await logoutStrict(client),{revoked:false,reason:'AUTH_UNAVAILABLE',status:503});
  assert.equal(cookie,copiedCookie);
  failDelete=false;assert.deepEqual(await logoutStrict(client),{revoked:true});
  cookie=copiedCookie;assert.equal((await fetchSession(client)).authenticated,false);
  assert.equal((await client('/api/atlas-private-ui')).status,401);
  assert.equal((await client(asset)).status,401);
  await assert.rejects(fetchPrivate(client),e=>e.code==='AUTH_REQUIRED');
  assert.deepEqual(await fetchPublic(client),{contract:'ATLAS_PUBLIC_V1',items:[],links:[]});
});
