import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash,scryptSync} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createNexoMcpWebHandler,NEXO_MCP_TOOL_NAMES} from '../server/mcp/server.mjs';
import {OPERATIONAL_TOOL_NAMES} from '../server/mcp/operational-tools.mjs';
import {atlasBoundary} from '../server/atlas/boundary.mjs';
import apiHandler from '../server/handler.mjs';

const url='http://public-mcp.test/api/mcp';
const PUBLIC_STATUS_TOOL='get_public_catalog_status';
const privateCanary={
  authority:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',
  public:'PUBLIC_SOURCE_CANARY',
  peer:'PEER_PRIVATE_CANARY',
  olympus:'OLYMPUS_PRIVATE_CANARY',
  board:'BOARD_PRIVATE_CANARY',
  tower:'TOWER_PRIVATE_CANARY',
  worker:'AGENT_PRIVATE_CANARY',
  credential:'Bearer PRIVATE_TOKEN_CANARY'
};

function rpc(method,params={},id=1){return {jsonrpc:'2.0',id,method,params};}
async function post(handler,body,headers={}){
  return handler.fetch(new Request(url,{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json, text/event-stream',...headers},
    body:JSON.stringify(body)
  }));
}

test('anonymous SDK discovery exposes only a generic degraded public catalog status',async()=>{
  let privateReads=0;
  const web=createNexoMcpWebHandler({readSnapshot:async()=>{privateReads++;return privateCanary;}});
  const transport=new StreamableHTTPClientTransport(new URL(url),{
    fetch:(requestUrl,init)=>web.fetch(new Request(requestUrl,init))
  });
  const client=new Client({name:'anonymous-public-catalog-test',version:'1.0.0'});
  try{
    await client.connect(transport);
    const listed=await client.listTools();
    assert.deepEqual(listed.tools.map(tool=>tool.name),[PUBLIC_STATUS_TOOL]);
    assert.equal(listed.tools[0].annotations?.readOnlyHint,true);
    assert.equal(listed.tools[0].annotations?.destructiveHint,false);
    assert.deepEqual((await client.listResources()).resources,[]);
    assert.deepEqual((await client.listPrompts()).prompts,[]);
    const result=await client.callTool({name:PUBLIC_STATUS_TOOL,arguments:{}});
    assert.equal(result.isError,undefined);
    const payload=JSON.parse(result.content[0].text);
    assert.deepEqual(payload,{
      contract:'NEXO_PUBLIC_CATALOG_STATUS_V1',
      status:'DEGRADED',
      availability:'UNAVAILABLE',
      items:[],
      reason:'CATALOG_UNAVAILABLE'
    });
    assert.equal(JSON.stringify(payload).includes('CANARY'),false);
    assert.equal(privateReads,0,'anonymous discovery/status must not read the old research or Tower snapshot');
  }finally{
    await client.close().catch(()=>{});
    await web.close();
  }
});

test('anonymous private reads, non-allowlisted tools and mutations all return the same generic 401',async()=>{
  let privateReads=0;
  const web=createNexoMcpWebHandler({readSnapshot:async()=>{privateReads++;return privateCanary;}});
  try{
    const forbidden=[
      ...[...NEXO_MCP_TOOL_NAMES,...OPERATIONAL_TOOL_NAMES].map(name=>rpc('tools/call',{name,arguments:{}})),
      rpc('resources/read',{uri:'private://canary'}),
      rpc('prompts/get',{name:'private-canary'}),
      rpc('tools/call',{name:'unknown-private-alias',arguments:{}})
    ];
    const responses=[];
    for(const body of forbidden){
      const response=await post(web,body);
      responses.push({status:response.status,body:await response.json()});
    }
    for(const response of responses){
      assert.equal(response.status,401);
      assert.deepEqual(response.body,{error:'AUTH_REQUIRED'});
    }
    assert.equal(new Set(responses.map(response=>JSON.stringify(response))).size,1,'denials must not reveal tool/resource existence');
    assert.equal(privateReads,0);
  }finally{await web.close();}
});

test('anonymous MCP requests do not reflect credentials or cache private payloads across clients',async()=>{
  let privateReads=0;
  const web=createNexoMcpWebHandler({readSnapshot:async()=>{privateReads++;return privateCanary;}});
  try{
    for(const canary of ['COOKIE_PRIVATE_CANARY','HEADER_PRIVATE_CANARY']){
      const response=await post(web,rpc('tools/call',{name:PUBLIC_STATUS_TOOL,arguments:{},_meta:{trace:canary}}),{
        cookie:`__Host-atlas_session=${canary}`,
        authorization:`Basic ${canary}`,
        'mcp-session-id':canary,
        'last-event-id':canary
      });
      assert.equal(response.status,200);
      assert.equal(response.headers.get('cache-control'),'private, no-store');
      assert.equal(response.headers.get('mcp-session-id'),null);
      const body=await response.text();
      assert.equal(body.includes(canary),false);
      assert.equal(body.includes('PRIVATE_CANARY'),false);
    }
    assert.equal(privateReads,0);
  }finally{await web.close();}
});

test('valid Atlas session retains the existing read-only MCP tools without operational writes',async t=>{
  const keys=['NEXO_MCP_ACCESS_KEY_SHA256','NEXO_RUNNER_KEY_SHA256','NEXO_ATLAS_PIN_HASH','NEXO_ATLAS_ORIGIN','NEXO_ATLAS_REDIS_URL','NEXO_ATLAS_REDIS_TOKEN'];
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const salt='e'.repeat(32),pinHash=`scrypt$${salt}$${scryptSync('synthetic-only-session-passphrase',salt,64).toString('hex')}`;
  Object.assign(process.env,{
    NEXO_MCP_ACCESS_KEY_SHA256:'',NEXO_RUNNER_KEY_SHA256:'',NEXO_ATLAS_PIN_HASH:pinHash,
    NEXO_ATLAS_ORIGIN:'https://atlas.example',NEXO_ATLAS_REDIS_URL:'https://redis.example',NEXO_ATLAS_REDIS_TOKEN:'synthetic-only-redis-token'
  });
  t.after(()=>{for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;});
  const token='d'.repeat(64),credential=createHash('sha256').update(pinHash).digest('hex'),exp=Date.now()+5*60*1000;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(String(url),'https://redis.example');
    assert.equal(options.redirect,'error');
    assert.deepEqual(JSON.parse(options.body),['GET',`atlas:session:${createHash('sha256').update(token).digest('hex')}`]);
    return Response.json({result:JSON.stringify({exp,credential})});
  });
  let snapshotReads=0;
  const web=createNexoMcpWebHandler({readSnapshot:async()=>{snapshotReads++;return {
    sourceModifiedAt:'2026-10-11T00:00:00Z',generatedAt:'2026-10-11T00:00:01Z',
    sections:{WORK:[],EVENTS:[],KNOWLEDGE:[],DECISIONS:[],SYSTEM:[],THREADS:[]},
    projections:{Science:[],Engineering:[],Olympus:[]}
  };}});
  const originResponses=[];
  for(const origin of [undefined,'https://attacker.example','https://nexo-one-two.vercel.app']){
    const headers={cookie:`__Host-atlas_session=${token}`};
    if(origin)headers.origin=origin;
    const response=await post(web,rpc('tools/list'),headers);
    const body=await response.text();
    originResponses.push({origin:origin||'(absent)',status:response.status,exposesScienceTool:body.includes('get_science_state')});
  }
  assert.deepEqual(originResponses,[undefined,'https://attacker.example','https://nexo-one-two.vercel.app'].map(origin=>({
    origin:origin||'(absent)',status:403,exposesScienceTool:false
  })));
  assert.equal(snapshotReads,0,'same-origin rejection must precede private snapshot access');
  const transport=new StreamableHTTPClientTransport(new URL(url),{
    fetch:(requestUrl,init)=>{const request=new Request(requestUrl,init);request.headers.set('cookie',`__Host-atlas_session=${token}`);request.headers.set('origin','https://atlas.example');return web.fetch(request);}
  });
  const client=new Client({name:'atlas-session-mcp-test',version:'1.0.0'},{versionNegotiation:{mode:'auto'}});
  try{
    await client.connect(transport);
    const listed=await client.listTools();
    assert.deepEqual(listed.tools.map(tool=>tool.name),NEXO_MCP_TOOL_NAMES);
    assert.equal(listed.tools.some(tool=>OPERATIONAL_TOOL_NAMES.includes(tool.name)),false);
    const result=await client.callTool({name:'get_science_state',arguments:{}});
    assert.equal(result.isError,undefined);
    assert.equal(snapshotReads,1);
  }finally{await client.close().catch(()=>{});await web.close();}
});

test('anonymous boundary permits only the MCP POST surface; status/private endpoints remain protected',async()=>{
  assert.equal(await atlasBoundary({method:'POST',headers:{}},{},{route:'mcp'}),null);
  assert.equal(await atlasBoundary({method:'OPTIONS',headers:{}},{},{route:'mcp'}),null);
  assert.deepEqual(await atlasBoundary({method:'GET',headers:{}},{},{route:'mcp'}),{
    status:405,body:{error:'METHOD_NOT_ALLOWED'}
  });
  for(const route of ['mcp/status','atlas-private']){
    assert.deepEqual(await atlasBoundary({method:'GET',headers:{}},{},{route}),{
      status:401,body:{error:'AUTH_REQUIRED'}
    });
  }
});

test('mounted /api/mcp negotiates the official client without auth and keeps status/private routes at 401',async t=>{
  const keys=['NEXO_MCP_ACCESS_KEY_SHA256','NEXO_RUNNER_KEY_SHA256','NEXO_ATLAS_PIN_HASH','NEXO_ATLAS_ORIGIN','NEXO_ATLAS_REDIS_URL','NEXO_ATLAS_REDIS_TOKEN'];
  const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  for(const key of keys)delete process.env[key];
  t.after(()=>{for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;});
  const server=http.createServer(apiHandler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const client=new Client({name:'anonymous-mounted-mcp-test',version:'1.0.0'},{versionNegotiation:{mode:'auto'}});
  try{
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`)));
    assert.deepEqual((await client.listTools()).tools.map(tool=>tool.name),[PUBLIC_STATUS_TOOL]);
    const result=await client.callTool({name:PUBLIC_STATUS_TOOL,arguments:{}});
    assert.equal(JSON.parse(result.content[0].text).availability,'UNAVAILABLE');
    const deniedBodies=[];
    for(const body of [
      rpc('tools/call',{name:OPERATIONAL_TOOL_NAMES[0],arguments:{canary:'PRIVATE_CANARY'}}),
      rpc('resources/read',{uri:'private://PRIVATE_CANARY'}),
      rpc('prompts/get',{name:'PRIVATE_CANARY'})
    ]){
      const response=await fetch(`${base}/api/mcp`,{
        method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream'},
        body:JSON.stringify(body)
      });
      deniedBodies.push({status:response.status,body:await response.json()});
    }
    assert.deepEqual(deniedBodies,[
      {status:401,body:{error:'AUTH_REQUIRED'}},
      {status:401,body:{error:'AUTH_REQUIRED'}},
      {status:401,body:{error:'AUTH_REQUIRED'}}
    ]);
    for(const path of ['/api/mcp/status','/api/atlas-private']){
      const response=await fetch(base+path);
      assert.equal(response.status,401,path);
      assert.deepEqual(await response.json(),{error:'AUTH_REQUIRED'});
    }
  }finally{
    await client.close().catch(()=>{});
    await new Promise(resolve=>server.close(resolve));
  }
});
