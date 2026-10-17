import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimePrincipal} from '../server/mcp/runtime-principals.mjs';
import {operationalPrincipal} from '../server/mcp/operational-auth.mjs';
import {createOperationalService,registerOperationalTools,sha256} from '../server/mcp/operational-tools.mjs';
import {operationalStateFromTower,TOWER_ID} from '../server/mcp/operational-state.mjs';
import * as z from 'zod/v4';
const token='TEST-ONLY-RUNTIME-IDENTITY-NOT-A-CREDENTIAL';
const row={subject:'a'.repeat(64),runtime:'gemini-cli',token_sha256:sha256(token),roles:['CIENTISTA'],
  allowed_tools:['get_role_capabilities','get_scientific_queue'],expires_at:'2099-01-01T00:00:00Z',revoked:false};
const raw=entries=>JSON.stringify({schema:'NEXO_MCP_RUNTIME_PRINCIPALS_V1',principals:entries});
const principal=()=>runtimePrincipal(raw([row]),token);
const state={authority:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',readback:'PASS',revision:'sha256:'+'b'.repeat(64),work:[],
  control:{execution_primary:'CHATGPT_RUNTIME',github_actions_science_role:'DISABLED_BUDGET_EXHAUSTED'},
  science:{tests:[],recovery:[],batteries:[]}};
const service=()=>createOperationalService({readState:async()=>state,submitIntent:async()=>{throw Error('unexpected write');},
  submitScientificRequest:async()=>{throw Error('unexpected write');}});
test('runtime identity is deployment-bound, explicitly scoped and contains no token/hash',()=>{
  assert.deepEqual(principal(),{authenticated:true,id:row.subject,runtime:'gemini-cli',roles:row.roles,allowed_tools:row.allowed_tools});
  assert.equal(runtimePrincipal(raw([row]),'incorrect-token-with-enough-length'),null);
});
test('revoked, expired, duplicate and malformed grants fail closed',()=>{
  assert.equal(runtimePrincipal(raw([{...row,revoked:true}]),token),null);
  assert.equal(runtimePrincipal(raw([{...row,expires_at:'2020-01-01T00:00:00Z'}]),token),null);
  for(const input of ['{}','[]',raw([row,row]),raw([{...row,roles:['ROOT']}]),raw([{...row,allowed_tools:['anything']}])])
    assert.throws(()=>runtimePrincipal(input,token),/MCP_PRINCIPAL_CONFIG_INVALID/);
});
test('configured runtime registry cannot fall back to the old shared key',async()=>{
  const request=new Request('https://test.invalid/api/mcp',{headers:{Authorization:`Bearer ${token}`}});
  for(const config of ['invalid',raw([{...row,revoked:true}]),raw([])]){
    assert.equal(await operationalPrincipal(request,{NEXO_MCP_PRINCIPALS_JSON:config,NEXO_MCP_ACCESS_KEY_SHA256:sha256(token)}),null);
  }
  assert.equal((await operationalPrincipal(request,{NEXO_MCP_PRINCIPALS_JSON:raw([row])})).runtime,'gemini-cli');
});
test('read-only clients cannot discover or invoke writes or impersonate another role',async()=>{
  const names=[];registerOperationalTools({registerTool:name=>names.push(name)},{service:service(),principal:principal(),z});
  assert.deepEqual(names,row.allowed_tools);
  await assert.rejects(()=>service().call('request_execution',{work_id:'test'},principal()),/TOOL_FORBIDDEN/);
  await assert.rejects(()=>service().call('get_scientific_queue',{role:'EXECUTOR'},principal()),/ROLE_FORBIDDEN/);
  const result=await service().call('get_role_capabilities',{role:'CIENTISTA'},principal());
  assert.equal(result.execution,'CHATGPT_RUNTIME');
  assert.equal(result.runtime,'gemini-cli');assert.deepEqual(result.tools,row.allowed_tools);
});
test('Cientista reads LEARNER; Engenheiro reads ADVISOR, without cross-role recovery leaks',async()=>{
  const science={tests:[],batteries:[],recovery:[
    {id:'learn',owner_role:'LEARNER',test_id:'T1'},
    {id:'engineer',owner_role:'ADVISOR',test_id:'T2'}]};
  const svc=createOperationalService({readState:async()=>({...state,science}),submitIntent:()=>{},submitScientificRequest:()=>{}});
  for(const [role,id] of [['CIENTISTA','learn'],['ENGENHEIRO','engineer']]){
    const result=await svc.call('get_scientific_queue',{role},{authenticated:true,id:row.subject,roles:[role]});
    assert.deepEqual(result.recoveries.map(x=>x.id),[id]);
  }
});
test('CONTROL projection preserves canonical execution facts and excludes arbitrary contents',()=>{
  const revision='sha256:'+'c'.repeat(64);
  const tower={contract:'NEXO_TOWER_LIVE_V1',stable_file_id:TOWER_ID,storage:'GOOGLE_DRIVE_PRIVATE',revision,state_fingerprint:revision,
    files:{'CONTROL.json':{value:{...state.control,secret:'DO-NOT-RETURN',write_guard:'LIVE_TOWER_CAS_READBACK'}}}};
  const result=operationalStateFromTower(tower,{body_verified:true,file_id:TOWER_ID});
  assert.equal(result.control.execution_primary,'CHATGPT_RUNTIME');assert.equal(result.control.write_guard,'LIVE_TOWER_CAS_READBACK');
  assert.doesNotMatch(JSON.stringify(result),/DO-NOT-RETURN/);
});

test('JSON arrays cannot masquerade as principal identifiers or role names',()=>{
  for(const malformed of [{...row,subject:[row.subject]},{...row,token_sha256:[row.token_sha256]},
    {...row,runtime:['gemini-cli']},{...row,roles:[['CIENTISTA']]}])
    assert.throws(()=>runtimePrincipal(raw([malformed]),token),/MCP_PRINCIPAL_CONFIG_INVALID/);
});

test('Streamable HTTP SDK verifies three distinct synthetic runtimes; unauthorized writes remain unavailable',async()=>{
  const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');
  const {createMcpHandler}=await import('@modelcontextprotocol/server');
  const {createNexoMcpServer}=await import('../server/mcp/server.mjs');
  const entries=['dot','automation-cientista','gemini-cli'].map((runtime,index)=>({
    ...row,runtime,subject:String(index+1).repeat(64),
    token_sha256:sha256(`SYNTHETIC-ONLY-${runtime}-SDK-TEST-KEY`)}));
  for(const entry of entries){
    const client=new Client({name:entry.runtime,version:'test'},{versionNegotiation:{mode:'auto'}});
    let handler;
    const transport=new StreamableHTTPClientTransport(new URL('https://test.invalid/api/mcp'),{fetch:async(url,init)=>{
      const request=new Request(url,init);
      request.headers.set('Authorization',`Bearer SYNTHETIC-ONLY-${entry.runtime}-SDK-TEST-KEY`);
      const p=await operationalPrincipal(request,{NEXO_MCP_PRINCIPALS_JSON:raw(entries)});
      assert.equal(p.runtime,entry.runtime);
      handler??=createMcpHandler(()=>createNexoMcpServer({readSnapshot:()=>{throw Error('not used');},
        operational:{principal:p,service:service()}}),{responseMode:'json'});
      return handler.fetch(request);
    }});
    try{
      await client.connect(transport);
      const names=(await client.listTools()).tools.map(x=>x.name);
      assert.ok(names.includes('get_scientific_queue'));assert.ok(!names.includes('request_execution'));
      const result=await client.callTool({name:'get_role_capabilities',arguments:{role:'CIENTISTA'}});
      const payload=JSON.parse(result.content[0].text);
      assert.equal(payload.principal_id,entry.subject);assert.equal(payload.runtime,entry.runtime);
      assert.equal(payload.execution,'CHATGPT_RUNTIME');
    }finally{await client.close().catch(()=>{});await handler?.close();}
  }
});

test('scoped SDK mutation writes one synthetic spool item, verifies bytes and never claims canonical application',async()=>{
  const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');
  const {createMcpHandler}=await import('@modelcontextprotocol/server');
  const {createNexoMcpServer}=await import('../server/mcp/server.mjs');
  const {createOperationalQueue,SPOOL_ID}=await import('../server/mcp/operational-queue.mjs');
  const p={...principal(),runtime:'automation-executor',roles:['EXECUTOR'],allowed_tools:['claim_work','get_result']};
  const work={id:'LOCAL-CANARY',role:'EXECUTOR',scope:'ENGINEERING_OPERATIONAL_ONLY',
    definition_sha256:'d'.repeat(64),version:1,state:'READY'};
  const spool={spreadsheetId:SPOOL_ID,title:'LOCAL_FIXTURE_ONLY',columns:{stable:0,envelope:1},rows:[]};
  let appends=0;
  const submit=createOperationalQueue({read:async()=>spool,append:async(_,{stableId,envelope})=>{
    appends++;spool.rows.push([stableId,Buffer.from(JSON.stringify(envelope)).toString('base64url')]);}});
  const svc=createOperationalService({readState:async()=>({...state,work:[work]}),submitIntent:submit,
    submitScientificRequest:()=>{throw Error('unexpected science');}});
  const handler=createMcpHandler(()=>createNexoMcpServer({readSnapshot:()=>{throw Error('not used');},
    operational:{principal:p,service:svc}}),{responseMode:'json'});
  const client=new Client({name:'local-write-canary',version:'test'},{versionNegotiation:{mode:'auto'}});
  try{
    await client.connect(new StreamableHTTPClientTransport(new URL('https://test.invalid/api/mcp'),{
      fetch:(url,init)=>handler.fetch(new Request(url,init))}));
    const invoke=async()=>JSON.parse((await client.callTool({name:'claim_work',arguments:{work_id:work.id}})).content[0].text);
    const first=await invoke(),again=await invoke();
    assert.equal(first.state,'PENDING_WRITER');assert.equal(first.queue_readback,'PASS');
    assert.equal(first.canonical_state,'READY');assert.equal(again.intent_id,first.intent_id);
    assert.equal(again.idempotent,true);assert.equal(appends,1);
    const result=JSON.parse((await client.callTool({name:'get_result',arguments:{work_id:work.id}})).content[0].text);
    assert.equal(result.canonical,false);
  }finally{await client.close().catch(()=>{});await handler.close();}
});
