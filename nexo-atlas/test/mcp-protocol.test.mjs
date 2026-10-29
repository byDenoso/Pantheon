import test from 'node:test';
import assert from 'node:assert/strict';
import {readonlyMcpRoute,MCP_TOOLS} from '../worker/mcp/route.mjs';
import {MCP_GATE} from '../worker/mcp/grants.mjs';
import {RETRIEVAL_GATE} from '../worker/retrieval/route.mjs';

const modernMeta={
  'io.modelcontextprotocol/protocolVersion':'2026-07-28',
  'io.modelcontextprotocol/clientInfo':{name:'synthetic-protocol-test',version:'1'},
  'io.modelcontextprotocol/clientCapabilities':{}
};
const env={NEXO_ATLAS_MCP:MCP_GATE,NEXO_ATLAS_RETRIEVAL:RETRIEVAL_GATE,
  DB:{withSession(){throw Error('Discovery must not read private state');}}};
const request=(method,params,modern=true)=>new Request('https://example.invalid/mcp',{
  method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(modern?{'MCP-Protocol-Version':'2026-07-28','Mcp-Method':method,...(params.name?{'Mcp-Name':params.name}:{})}:{})},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:{...params,...(modern?{_meta:modernMeta}:{})}})
});

test('modern MCP discovery and tools listing work without reading private state',async()=>{
  const discovery=await readonlyMcpRoute(request('server/discover',{}),env,null);
  assert.equal(discovery.status,200);
  const body=await discovery.json();
  assert(body.result.supportedVersions.includes('2026-07-28'));
  assert.equal(body.result._meta['io.modelcontextprotocol/serverInfo'].name,'nexoresearch-readonly');
  assert.equal(discovery.headers.get('cache-control'),'private, no-store');
  assert.equal(discovery.headers.get('mcp-session-id'),null);
  const listing=await readonlyMcpRoute(request('tools/list',{}),env,null);
  assert.equal(listing.status,200);
  assert.deepEqual((await listing.json()).result.tools.map(tool=>tool.name),MCP_TOOLS);
});

test('legacy MCP initialization and tool listing remain supported without creating a grant',async()=>{
  const initialization=await readonlyMcpRoute(request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'synthetic-legacy',version:'1'}},false),env,null);
  assert.equal(initialization.status,200);
  assert.equal((await initialization.json()).result.protocolVersion,'2025-11-25');
  const listing=await readonlyMcpRoute(request('tools/list',{},false),env,null);
  assert.equal(listing.status,200);
  assert.deepEqual((await listing.json()).result.tools.map(tool=>tool.name),MCP_TOOLS);
});

test('modern tools calls still require a verified Sites identity and active owner grant',async()=>{
  for(const name of MCP_TOOLS){
    const response=await readonlyMcpRoute(request('tools/call',{name,arguments:name==='nexo_search'?{query:'NEXO'}:{}}),env,null);
    assert.equal(response.status,401);
    assert.deepEqual(await response.json(),{error:'MCP_IDENTITY_REQUIRED',available:false});
  }
});
