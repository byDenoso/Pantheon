import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

import {createScientificMcpHttpHandler} from '../lib/scientific-mcp-http.mjs';
import {TOOL_NAME} from '../lib/scientific-mcp.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
function responseRecorder(){
  return {statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v},status(code){this.statusCode=code;return this},json(value){this.body=value;return this},end(value=''){this.body=value;return this}};
}

test('GET health is non-secret and reports writer configuration only as a boolean',async()=>{
  const handler=createScientificMcpHttpHandler({env:{},gateway:{configured:{towerWrite:false,towerRepo:'byDenoso/NEXO-Obsidian-Vault',towerRef:'main'}},service:{}});
  const res=responseRecorder();
  await handler({method:'GET',headers:{},query:{}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.ok,true);
  assert.equal(res.body.tool,TOOL_NAME);
  assert.equal(res.body.towerWriteConfigured,false);
  assert.equal(JSON.stringify(res.body).includes('token'),false);
});

test('initialize and tools/list are discoverable without granting mutation authority',async()=>{
  const service={submitUtterance:async()=>{throw new Error('must not execute')}};
  const handler=createScientificMcpHttpHandler({env:{},gateway:{configured:{towerWrite:false}},service});
  const init=responseRecorder();
  await handler({method:'POST',headers:{},body:{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}}},init);
  assert.equal(init.statusCode,200);assert.equal(init.body.result.serverInfo.name,'nexo-scientific-intake');
  const list=responseRecorder();
  await handler({method:'POST',headers:{},body:{jsonrpc:'2.0',id:2,method:'tools/list',params:{}}},list);
  assert.equal(list.body.result.tools[0].name,TOOL_NAME);
});

test('tools/call fails closed without an authorized bearer',async()=>{
  let calls=0;
  const env={NEXO_MCP_ACCESS_KEY_SHA256:sha('test-key')};
  const service={submitUtterance:async()=>{calls++;return {accepted:true,tests:[]}}};
  const handler=createScientificMcpHttpHandler({env,gateway:{configured:{towerWrite:true}},service});
  const res=responseRecorder();
  await handler({method:'POST',headers:{},body:{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:TOOL_NAME,arguments:{utterance:'Teste X'}}}},res);
  assert.equal(res.statusCode,401);assert.equal(calls,0);
});

test('authorized tools/call reaches the shared service and never accepts credentials as arguments',async()=>{
  let calls=0;
  const env={NEXO_MCP_ACCESS_KEY_SHA256:sha('test-key')};
  const service={submitUtterance:async()=>{calls++;return {accepted:true,tests:[{test_id:'T-1',state:'CAPABILITY_GAP'}]}}};
  const handler=createScientificMcpHttpHandler({env,gateway:{configured:{towerWrite:true}},service});
  const res=responseRecorder();
  await handler({method:'POST',headers:{authorization:'Bearer test-key'},body:{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:TOOL_NAME,arguments:{utterance:'Teste X'}}}},res);
  assert.equal(res.statusCode,200);assert.equal(calls,1);assert.equal(res.body.result.structuredContent.accepted,true);
});
