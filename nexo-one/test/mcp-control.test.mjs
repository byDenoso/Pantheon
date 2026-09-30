import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {publication} from './fixtures/mcp-publication.mjs';
import {readResearchSnapshot,researchSnapshotFromPublication} from '../server/adapters/research-snapshot.mjs';
import {MCP_TOOL_REGISTRY,isPublicReadOnlyMcpTool,createNexoMcpWebHandler,executeNexoMcpTool,readNexoMcpStatus} from '../server/mcp/server.mjs';
import {buildAtlasResearchView} from '../server/compiler/atlas-research-api.mjs';
import handler from '../server/handler.mjs';

const snapshot=()=>researchSnapshotFromPublication(publication());
test('public MCP access boundary rejects authenticated and operational definitions',()=>{
  assert.equal(isPublicReadOnlyMcpTool({access:'PUBLIC',annotations:{readOnlyHint:true}}),true);
  for(const access of ['AUTHENTICATED','OPERATIONAL',undefined])assert.equal(isPublicReadOnlyMcpTool({access,annotations:{readOnlyHint:true}}),false);
  assert.equal(isPublicReadOnlyMcpTool({access:'PUBLIC',annotations:{readOnlyHint:false}}),false);
  assert.equal(isPublicReadOnlyMcpTool({access:'PUBLIC'}),false);
});
test('status is derived from the canonical tool registry and the shared Tower generation',async()=>{
  const s=snapshot(),status=await readNexoMcpStatus({readSnapshot:async()=>s});
  assert.equal(status.status,'READY');assert.equal(status.authority,'TOWER_V06');
  assert.deepEqual(status.tools.map(t=>t.name),Object.keys(MCP_TOOL_REGISTRY));
  for(const tool of status.tools){assert.equal(tool.access,'PUBLIC');assert.equal(tool.annotations.readOnlyHint,true);assert.equal(tool.annotations.destructiveHint,false);assert.equal(tool.annotations.idempotentHint,true);assert.equal(tool.annotations.openWorldHint,false);assert.equal(tool.inputSchema.type,'object');assert.equal(tool.inputSchema.additionalProperties,false);}
  const science=await executeNexoMcpTool({readSnapshot:async()=>s},'get_science_state');
  const httpModel=buildAtlasResearchView(s,'science-read-model').data;
  assert.equal(science.fingerprint,httpModel.fingerprint);assert.equal(status.fingerprint,science.fingerprint);
  assert.equal(science.sourceVersion,s.manifest.tower_revision);assert.equal(status.projectionFingerprint,s.manifest.projection_fingerprint);
  assert.equal(science.scienceProjection.campaigns[0].id,'C1');assert(science.provenance[0].sourceRef.startsWith('tower-live://'));
  assert(!JSON.stringify(status).includes('secret-canary'));assert(!JSON.stringify(science).includes('secret-canary'));assert(!JSON.stringify(science).includes('OLYMPUS'));
  const campaign=await executeNexoMcpTool({readSnapshot:async()=>s},'get_campaign',{id:'C1'});assert.deepEqual(campaign.tests.map(t=>t.id),['T1']);assert.deepEqual(campaign.evidence.map(t=>t.id),['E1']);
  assert.equal(buildAtlasResearchView(s,'lab-tests').data.items[0].id,'T1');
});
test('schemas fail closed and public execution cannot accept an operational action',async()=>{
  const readSnapshot=async()=>snapshot();
  for(const [name,args] of [['search_atlas',{limit:501}],['get_campaign',{id:'a'.repeat(513)}],['validate_style_text',{text:7}],['get_science_state',{command:'secret-command'}]])await assert.rejects(()=>executeNexoMcpTool({readSnapshot},name,args),/MCP_INVALID_INPUT/);
  for(const name of ['unknown','request_research','propose_hypothesis','request_test','request_battery'])await assert.rejects(()=>executeNexoMcpTool({readSnapshot},name,{}),/UNKNOWN_MCP_TOOL/);
  const status=await readNexoMcpStatus({readSnapshot:async()=>{throw Error('secret-canary');}});
  assert.equal(status.status,'DEGRADED');assert.equal(status.fingerprint,null);assert.equal(status.tools.find(t=>t.name==='get_campaign').availability,'UNAVAILABLE');assert.equal(status.tools.find(t=>t.name==='get_style_policy').availability,'AVAILABLE');assert(!JSON.stringify(status).includes('secret-canary'));
});
test('MCP initialize/discovery/call shares schemas and sanitizes source errors',async()=>{
  let unavailable=false;
  const web=createNexoMcpWebHandler({readSnapshot:async()=>{if(unavailable)throw Error('secret-canary');return snapshot();}});
  const client=new Client({name:'atlas-test',version:'1'});
  try{
    await client.connect(new StreamableHTTPClientTransport(new URL('http://local/mcp'),{fetch:(url,init)=>web.fetch(new Request(url,init))}));
    const tools=await client.listTools();assert.equal(tools.tools.length,Object.keys(MCP_TOOL_REGISTRY).length);
    assert((await client.callTool({name:'get_campaign',arguments:{id:'C1'}})).structuredContent.result.campaign);
    assert((await client.callTool({name:'search_atlas',arguments:{limit:-1}})).isError);
    await assert.rejects(()=>client.callTool({name:'nonexistent',arguments:{}}),/not found/);
    unavailable=true;const error=await client.callTool({name:'get_science_state',arguments:{}});assert(error.isError);assert(!JSON.stringify(error).includes('secret-canary'));
  }finally{await client.close();await web.close();}
});
test('new publications invalidate semantic cache, concurrent aborts stay isolated and failure is not cached',async()=>{
  const original=globalThis.fetch;let generation=publication(),reads=0,release,fail=false;
  const env={NEXO_PUBLIC_PUBLICATION_URL:'https://publication.test/mcp-cache'};
  globalThis.fetch=async()=>{reads++;await new Promise(resolve=>{release=resolve;});if(fail)throw Error('upstream failure');return Response.json(generation);};
  try{
    const controller=new AbortController();const aborted=readResearchSnapshot({env,signal:controller.signal});const survivor=readResearchSnapshot({env});controller.abort();release();await assert.rejects(()=>aborted);const first=await survivor;assert.equal(reads,1);
    const a=await executeNexoMcpTool({readSnapshot:async()=>first},'get_science_state');
    generation=publication('b','Nova campanha');const second=readResearchSnapshot({env});release();const b=await executeNexoMcpTool({readSnapshot:async()=>await second},'get_science_state');assert.notEqual(a.fingerprint,b.fingerprint);assert.equal(b.structure.campaigns[0].label,'Nova campanha');assert.equal(reads,2);
    fail=true;const unavailable=readResearchSnapshot({env});release();await assert.rejects(()=>unavailable);assert.equal(reads,3);
    const invalid=publication();invalid.build_meta.projection_fingerprint='sha256:'+'f'.repeat(64);assert.throws(()=>researchSnapshotFromPublication(invalid),/MISMATCH/);
  }finally{globalThis.fetch=original;}
});
test('HTTP metadata and MCP reject arbitrary origins and have explicit CORS and size limits',async()=>{
  const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const path of ['/api/mcp','/api/mcp/status']){const res=await fetch(base+path,{headers:{Origin:'https://attacker.test'}});assert.equal(res.status,403);assert.equal(res.headers.get('access-control-allow-origin'),null);}
    const allowed=await fetch(base+'/api/mcp/status',{method:'OPTIONS',headers:{Origin:'https://bydenoso.github.io'}});assert.equal(allowed.status,204);assert.equal(allowed.headers.get('access-control-allow-origin'),'https://bydenoso.github.io');
    const hello=await fetch(base+'/api/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Origin:base},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'browser',version:'1'}}})});assert.equal(hello.status,200);assert((await hello.text()).includes('nexo-science'));
    const big=await fetch(base+'/api/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(262145)});assert.equal(big.status,413);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
