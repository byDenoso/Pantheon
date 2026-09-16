import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

import {createScientificMcpHttpHandler} from '../lib/scientific-mcp-http.mjs';
import {handleMcpRpc,toolDescriptors} from '../lib/scientific-mcp.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const PRIVATE_TOOLS=['nexo.create_work','nexo.run_work','nexo.observe_health_issue','nexo.start_health_repair','nexo.resolve_health_issue'];

function responseRecorder(){return {statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v},status(code){this.statusCode=code;return this},json(value){this.body=value;return this},end(value=''){this.body=value;return this}}}
function discoveryService(){return {
  async getBootstrap(){return {contract:'NEXO_CAPABILITY_BOOTSTRAP_V1',memory_dependency:false,canonical:{repository:'byDenoso/NEXO-Obsidian-Vault',ref:'main',root:'TOWER_V06'},science:{},objectives:{},hosted:{tower_write_configured:true}}},
  async getCapabilities(){return {contract:'NEXO_HOSTED_CAPABILITY_SURFACE_V1'}},
  async submitUtterance(){return {accepted:true,tests:[]}},
}}
function semanticFacade(){return {
  async call(name,args){return {tool:name,args,ok:true}},
}}

test('unauthenticated tools/list exposes only public discovery/intake tools',async()=>{
  const result=await handleMcpRpc({jsonrpc:'2.0',id:1,method:'tools/list',params:{}},{service:discoveryService(),semantic:semanticFacade(),authenticated:false});
  const names=result.result.tools.map(item=>item.name);
  assert.ok(names.includes('nexo.get_bootstrap'));
  assert.ok(names.includes('nexo.get_capabilities'));
  for(const name of PRIVATE_TOOLS)assert.equal(names.includes(name),false,name);
});

test('authenticated tools/list exposes the consolidated semantic surface',async()=>{
  const names=toolDescriptors({authenticated:true}).map(item=>item.name);
  for(const name of PRIVATE_TOOLS)assert.ok(names.includes(name),name);
  assert.ok(names.includes('nexo.status'));
  assert.ok(names.includes('nexo.get_work'));
  assert.ok(names.includes('nexo.prepare_campaign'));
  assert.ok(names.includes('nexo.readback'));
});

test('unauthenticated private tools/call fails closed at HTTP boundary',async()=>{
  const env={NEXO_MCP_ACCESS_KEY_SHA256:sha('test-key')};
  const handler=createScientificMcpHttpHandler({env,gateway:{configured:{towerWrite:true}},service:discoveryService(),semantic:semanticFacade()});
  const res=responseRecorder();
  await handler({method:'POST',headers:{},body:{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'nexo.create_work',arguments:{title:'x'}}}},res);
  assert.equal(res.statusCode,401);
});

test('authorized private tools/call reaches semantic facade',async()=>{
  let called=null;
  const semantic={async call(name,args){called={name,args};return {status:'PENDING',request_id:'REQ-1'}}};
  const env={NEXO_MCP_ACCESS_KEY_SHA256:sha('test-key')};
  const handler=createScientificMcpHttpHandler({env,gateway:{configured:{towerWrite:true}},service:discoveryService(),semantic});
  const res=responseRecorder();
  await handler({method:'POST',headers:{authorization:'Bearer test-key'},body:{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'nexo.create_work',arguments:{title:'x',correlation_id:'C-1'}}}},res);
  assert.equal(res.statusCode,200);
  assert.deepEqual(called,{name:'nexo.create_work',args:{title:'x',correlation_id:'C-1'}});
  assert.equal(res.body.result.structuredContent.request_id,'REQ-1');
});
