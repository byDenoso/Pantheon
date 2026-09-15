import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

import {createScientificMcpHttpHandler} from '../lib/scientific-mcp-http.mjs';
import {TOOL_NAME,BOOTSTRAP_TOOL_NAME,CAPABILITIES_TOOL_NAME} from '../lib/scientific-mcp.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
function responseRecorder(){
  return {statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v},status(code){this.statusCode=code;return this},json(value){this.body=value;return this},end(value=''){this.body=value;return this}};
}

function discoveryService(){return {
  async getBootstrap(){return {contract:'NEXO_CAPABILITY_BOOTSTRAP_V1',memory_dependency:false,canonical:{repository:'byDenoso/NEXO-Obsidian-Vault',ref:'main',root:'TOWER_V06'},science:{registry:'nexo.get_hypotheses',frontier:'nexo.get_hypothesis_frontier',ingress:'nexo.ingest_hypothesis'},objectives:{ingress:'nexo.ingest_objective'},hosted:{tower_write_configured:false}};},
  async getCapabilities(){return {tools:[BOOTSTRAP_TOOL_NAME,CAPABILITIES_TOOL_NAME,TOOL_NAME]};},
  async submitUtterance(){throw new Error('must not execute')},
}}

test('GET discovery is non-secret and publishes portable bootstrap plus hosted writer state',async()=>{
  const service=discoveryService();
  const handler=createScientificMcpHttpHandler({env:{},gateway:{configured:{towerWrite:false,towerRepo:'byDenoso/NEXO-Obsidian-Vault',towerRef:'main'}},service});
  const res=responseRecorder();
  await handler({method:'GET',headers:{},query:{}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.ok,true);
  assert.ok(res.body.tools.includes(TOOL_NAME));
  assert.ok(res.body.tools.includes(BOOTSTRAP_TOOL_NAME));
  assert.equal(res.body.bootstrap.memory_dependency,false);
  assert.equal(res.body.bootstrap.canonical.root,'TOWER_V06');
  assert.equal(res.body.towerWriteConfigured,false);
  assert.equal(JSON.stringify(res.body).includes('token'),false);
});

test('initialize and tools/list are discoverable without granting mutation authority',async()=>{
  const service=discoveryService();
  const handler=createScientificMcpHttpHandler({env:{},gateway:{configured:{towerWrite:false}},service});
  const init=responseRecorder();
  await handler({method:'POST',headers:{},body:{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}}},init);
  assert.equal(init.statusCode,200);assert.equal(init.body.result.serverInfo.name,'nexo-capability-bootstrap');
  const list=responseRecorder();
  await handler({method:'POST',headers:{},body:{jsonrpc:'2.0',id:2,method:'tools/list',params:{}}},list);
  const names=list.body.result.tools.map(item=>item.name);
  assert.ok(names.includes(TOOL_NAME));
  assert.ok(names.includes(BOOTSTRAP_TOOL_NAME));
});

test('public bootstrap tools/call succeeds without bearer while mutation/execution stays protected',async()=>{
  const service=discoveryService();
  const handler=createScientificMcpHttpHandler({env:{NEXO_MCP_ACCESS_KEY_SHA256:sha('test-key')},gateway:{configured:{towerWrite:false}},service});
  const res=responseRecorder();
  await handler({method:'POST',headers:{},body:{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:BOOTSTRAP_TOOL_NAME,arguments:{}}}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.result.structuredContent.memory_dependency,false);
});

test('tools/call fails closed without an authorized bearer for scientific execution',async()=>{
  let calls=0;
  const env={NEXO_MCP_ACCESS_KEY_SHA256:sha('test-key')};
  const service={...discoveryService(),submitUtterance:async()=>{calls++;return {accepted:true,tests:[]}}};
  const handler=createScientificMcpHttpHandler({env,gateway:{configured:{towerWrite:true}},service});
  const res=responseRecorder();
  await handler({method:'POST',headers:{},body:{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:TOOL_NAME,arguments:{utterance:'Teste X'}}}},res);
  assert.equal(res.statusCode,401);assert.equal(calls,0);
});

test('authorized scientific tools/call reaches the shared service and never accepts credentials as arguments',async()=>{
  let calls=0;
  const env={NEXO_MCP_ACCESS_KEY_SHA256:sha('test-key')};
  const service={...discoveryService(),submitUtterance:async()=>{calls++;return {accepted:true,tests:[{test_id:'T-1',state:'CAPABILITY_GAP'}]}}};
  const handler=createScientificMcpHttpHandler({env,gateway:{configured:{towerWrite:true}},service});
  const res=responseRecorder();
  await handler({method:'POST',headers:{authorization:'Bearer test-key'},body:{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:TOOL_NAME,arguments:{utterance:'Teste X'}}}},res);
  assert.equal(res.statusCode,200);assert.equal(calls,1);assert.equal(res.body.result.structuredContent.accepted,true);
});
