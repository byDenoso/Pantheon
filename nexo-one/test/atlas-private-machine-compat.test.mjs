import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash,generateKeyPairSync,createSign} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import handler from '../server/handler.mjs';
import {atlasBoundary} from '../server/atlas/boundary.mjs';
import {googleDriveConsentRoute} from '../server/auth/google-drive-consent.mjs';
import {makeSession} from '../server/auth/session.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const machineKey='synthetic-existing-machine-key';
const machineEnv={NEXO_MCP_ACCESS_KEY_SHA256:digest(machineKey)};
const nodeReq=(authorization,method='POST')=>({method,headers:{authorization}});
function output(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=JSON.parse(body);}};}
function install(t,env){const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);t.after(()=>{for(const [k,v] of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;});}
test('existing machine key passes MCP and spool ingress only, without browser or new store configuration',async()=>{
  for(const route of ['mcp','mcp/status','inbox-drop'])assert.equal(await atlasBoundary(nodeReq('Bearer '+machineKey),machineEnv,{route}),null);
  for(const route of ['atlas-private','world','system','google-drive-consent'])assert.equal((await atlasBoundary(nodeReq('Bearer '+machineKey),machineEnv,{route})).status,401);
  assert.equal((await atlasBoundary(nodeReq('Bearer incorrect'),machineEnv,{route:'mcp'})).status,401);
});
test('actual HTTP MCP keeps existing authenticated operational tool discovery',async t=>{
  install(t,machineEnv);
  const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const client=new Client({name:'synthetic-machine-compat',version:'1.0.0'});
  try{await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/api/mcp`),{requestInit:{headers:{Authorization:'Bearer '+machineKey}}}));
    const tools=await client.listTools();assert.ok(tools.tools.some(tool=>tool.name==='get_work'));assert.ok(tools.tools.some(tool=>tool.name==='register_delivery'));
  }finally{await client.close();await new Promise(resolve=>server.close(resolve));}
});
test('signed Writer OIDC passes MCP scope; invalid claims and signatures fail closed',async t=>{
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});const kid='synthetic-atlas-writer';
  const jwk={...publicKey.export({format:'jwk'}),kid,alg:'RS256',use:'sig'},now=Math.floor(Date.now()/1000);
  const claims={iss:'https://token.actions.githubusercontent.com',aud:'nexo-inbox',iat:now,exp:now+300,repository:'byDenoso/Pantheon',ref:'refs/heads/main',workflow_ref:'byDenoso/Pantheon/.github/workflows/nexo-writer-robot.yml@refs/heads/main'};
  const token=changes=>{const head=Buffer.from(JSON.stringify({alg:'RS256',kid})).toString('base64url'),body=Buffer.from(JSON.stringify({...claims,...changes})).toString('base64url');return `${head}.${body}.${createSign('RSA-SHA256').update(head+'.'+body).sign(privateKey).toString('base64url')}`;};
  t.mock.method(globalThis,'fetch',async url=>{assert.equal(String(url),'https://token.actions.githubusercontent.com/.well-known/jwks');return Response.json({keys:[jwk]});});
  assert.equal(await atlasBoundary(nodeReq('Bearer '+token({})),{},{route:'mcp'}),null);
  assert.equal((await atlasBoundary(nodeReq('Bearer '+token({})),{},{route:'atlas-private'})).status,401);
  for(const change of [{aud:'wrong'},{exp:now-1},{repository:'synthetic/fork'},{ref:'refs/heads/untrusted'},{workflow_ref:'byDenoso/Pantheon/.github/workflows/other.yml@refs/heads/main'}])assert.equal((await atlasBoundary(nodeReq('Bearer '+token(change)),{},{route:'mcp'})).status,401);
});
test('OAuth callback accepts only signed nonce-bound return, without granting session/data access',async t=>{
  const now=Date.now();const env={NEXO_SESSION_SECRET:'synthetic-session-secret-at-least-32-characters',NEXO_PASSWORD_HASH:'configured',GOOGLE_CONNECTOR:'google/alizarin-saddle',GOOGLE_CONNECT_SUBJECT_ID:'owner',VERCEL_OIDC_TOKEN:'synthetic-oidc',VERCEL_ENV:'production'};install(t,env);
  const req={method:'GET',url:'/api/google-drive-consent',headers:{host:'nexo-one-two.vercel.app',origin:'https://nexo-one-two.vercel.app',cookie:'nexo_session='+makeSession(env,now)}};
  const ready=await googleDriveConsentRoute(req,env,now);let callback;
  const start=await googleDriveConsentRoute({...req,method:'POST'},env,now,{body:{action:'start',csrfToken:ready.body.csrfToken,approveReadOnly:true},startAuthorizationImpl:async(_connector,_options,flow)=>{callback=flow.callbackUrl;return {url:'https://connect.vercel.com/authorize/synthetic'};}});
  assert.equal(start.status,200);
  const flowCookie=start.setCookie.find(c=>c.startsWith('nexo_drive_consent=')).split(';')[0];
  const returned=output();await handler({method:'GET',url:callback,headers:{host:req.headers.host,cookie:flowCookie,'sec-fetch-site':'cross-site'}},returned);
  assert.equal(returned.statusCode,303);assert.equal(returned.headers.Location,'/google-drive-connect.html?returned=1');assert.ok(!JSON.stringify(returned.headers['Set-Cookie']).includes('__Host-atlas_session='));
  for(const url of [callback.replace(/state=[^&]+/,'state=wrong'),callback+'&state=duplicate']){const denied=output();await handler({method:'GET',url,headers:{host:req.headers.host,cookie:flowCookie}},denied);assert.equal(denied.statusCode,400);}
  const denied=output();await handler({method:'GET',url:'/api/google-drive-consent',headers:req.headers},denied);assert.equal(denied.statusCode,401);
});
