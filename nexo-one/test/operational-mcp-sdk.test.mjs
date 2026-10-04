import test from 'node:test';
import assert from 'node:assert/strict';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createNexoMcpWebHandler,NEXO_MCP_TOOL_NAMES} from '../server/mcp/server.mjs';
import {sha256,OPERATIONAL_TOOL_NAMES,createOperationalService} from '../server/mcp/operational-tools.mjs';
import {createOperationalQueue,isOperationalEnvelope,SPOOL_ID} from '../server/mcp/operational-queue.mjs';

test('installed MCP SDK exposes role tools only to the existing authenticated principal',async()=>{
  const key='TEST-ONLY-NOT-A-DEPLOYMENT-CREDENTIAL';
  const previous=process.env.NEXO_MCP_ACCESS_KEY_SHA256;
  process.env.NEXO_MCP_ACCESS_KEY_SHA256=sha256(key);
  const handler=createNexoMcpWebHandler({readSnapshot:async()=>{throw Error('must not read Tower for capabilities');}});
  const connect=async(auth)=>{
    const client=new Client({name:'operational-sdk-test',version:'1'},{versionNegotiation:{mode:'auto'}});
    const transport=new StreamableHTTPClientTransport(new URL('http://test.local/mcp'),{
      fetch:(url,init)=>{
        const request=new Request(url,init);
        if(auth)request.headers.set('Authorization',`Bearer ${key}`);
        return handler.fetch(request);
      }
    });
    await client.connect(transport);return client;
  };
  let authorized,anonymous;
  try{
    authorized=await connect(true);
    const list=await authorized.listTools();
    assert.deepEqual(list.tools.map(x=>x.name),[...NEXO_MCP_TOOL_NAMES,...OPERATIONAL_TOOL_NAMES]);
    const result=await authorized.callTool({name:'get_role_capabilities',arguments:{role:'EXECUTOR'}});
    assert.ok(!result.isError);const body=JSON.parse(result.content[0].text);
    assert.equal(body.routine_approval_required,false);
    assert.deepEqual(body.request_execution_includes,['claim','prepare','validate','dispatch','collect','register']);
    anonymous=await connect(false);
    assert.deepEqual((await anonymous.listTools()).tools.map(x=>x.name),NEXO_MCP_TOOL_NAMES);
    assert.deepEqual((await authorized.listTools()).tools.map(x=>x.name),[...NEXO_MCP_TOOL_NAMES,...OPERATIONAL_TOOL_NAMES]);
  }finally{
    await authorized?.close().catch(()=>{});await anonymous?.close().catch(()=>{});await handler.close();
    if(previous===undefined)delete process.env.NEXO_MCP_ACCESS_KEY_SHA256;else process.env.NEXO_MCP_ACCESS_KEY_SHA256=previous;
  }
});

test('capability discovery requires neither a Tower read nor a durable record',async()=>{
  const forbidden=()=>{throw Error('unnecessary I/O');};
  const service=createOperationalService({readState:forbidden,submitIntent:forbidden});
  const result=await service.call('get_role_capabilities',{role:'ENGENHEIRO'},{authenticated:true,id:'a'.repeat(64),roles:['ENGENHEIRO']});
  assert.equal(result.antigravity_required,false);
  assert.equal(result.routine_approval_required,false);
});

test('fresh blocked retry links the latest matching terminal intent before hashing',async()=>{
  const principal={authenticated:true,id:'a'.repeat(64),roles:['EXECUTOR']};
  const first='op-'+'1'.repeat(48),latest='op-'+'2'.repeat(48);
  const work={id:'OPERATIONAL-CONTROL-DRIVE-SUM-V1',role:'EXECUTOR',scope:'ENGINEERING_OPERATIONAL_ONLY',
    definition_sha256:'f'.repeat(64),version:8,owner:principal.id,state:'BLOCKED',resume_state:'CLAIMED',
    error:{code:'DRIVE_HTTP_403',retryable:false,stage:'DRIVE_METADATA_READ'},outbox:null,processed:{
      [first]:{intent_id:first,disposition:'BLOCKED',action:'request_execution',principal:principal.id,expected_version:2},
      [latest]:{intent_id:latest,disposition:'STALE_VERSION',action:'request_execution',principal:principal.id,expected_version:5}
    }};
  let submitted;
  const service=createOperationalService({readState:async()=>({authority:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',readback:'PASS',revision:'sha256:'+ 'a'.repeat(64),work:[work]}),
    submitIntent:async(intent)=>{submitted=intent;return {readback:'PASS',body_sha256:sha256(intent)};}});
  const result=await service.call('request_execution',{work_id:work.id},principal);
  assert.equal(submitted.supersedes,latest);
  const {id,...identity}=submitted;
  assert.equal(id,'op-'+sha256(identity).slice(0,48));
  assert.equal(result.intent_id,id);
  assert.equal(result.canonical_state,'BLOCKED');
});

test('only legacy blocked work without a terminal intent receipt uses the explicit migration path',async()=>{
  const principal={authenticated:true,id:'a'.repeat(64),roles:['EXECUTOR']};
  const work={id:'OPERATIONAL-CONTROL-DRIVE-SUM-V1',role:'EXECUTOR',scope:'ENGINEERING_OPERATIONAL_ONLY',
    definition_sha256:'f'.repeat(64),version:3,owner:principal.id,state:'BLOCKED',resume_state:'CLAIMED',
    error:{code:'LEGACY_BLOCKED',retryable:false},outbox:null,processed:{}};
  let submitted;
  const service=createOperationalService({readState:async()=>({authority:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',readback:'PASS',revision:'sha256:'+ 'a'.repeat(64),work:[work]}),
    submitIntent:async(intent)=>{submitted=intent;return {readback:'PASS',body_sha256:sha256(intent)};}});
  const result=await service.call('request_execution',{work_id:work.id},principal);
  assert.equal(Object.hasOwn(submitted,'supersedes'),false);
  assert.equal(result.recovery_mode,'LEGACY_BLOCKED_WITHOUT_TERMINAL_INTENT_RECEIPT');
});

test('existing spool verifies exact body, destination, and idempotent repeat',async()=>{
  const principal={authenticated:true,id:'a'.repeat(64)};
  const identity={contract:'NEXO_OPERATIONAL_INTENT_V1',action:'request_execution',work_id:'OPERATIONAL-CONTROL-DRIVE-SUM-V1',principal:principal.id,expected_version:1,role_session:{},supersedes:'op-'+'1'.repeat(48)};
  const intent={...identity,id:'op-'+sha256(identity).slice(0,48)};
  const spool={spreadsheetId:SPOOL_ID,title:'Sheet1',columns:{stable:0,envelope:1},rows:[]};
  let writes=0;
  const submit=createOperationalQueue({read:async()=>spool,append:async(_,{stableId,envelope})=>{writes++;spool.rows.push([stableId,Buffer.from(JSON.stringify(envelope)).toString('base64url')]);}});
  assert.equal((await submit(intent,principal)).readback,'PASS');
  assert.equal((await submit(intent,principal)).reused,true);assert.equal(writes,1);
  const changedLink={...intent,supersedes:'op-'+'2'.repeat(48)};
  await assert.rejects(()=>submit(changedLink,principal),/INTENT_HASH_MISMATCH/);
  const malformed={...intent,supersedes:'not-an-intent'};
  malformed.id='op-'+sha256(Object.fromEntries(Object.entries(malformed).filter(([key])=>key!=='id'))).slice(0,48);
  await assert.rejects(()=>submit(malformed,principal),/SUPERSESSION_ID_INVALID/);
  spool.rows[0][1]=Buffer.from(JSON.stringify({...intent,work_id:'changed'})).toString('base64url');
  await assert.rejects(()=>submit(intent,principal),/SPOOL_IDENTITY_CONFLICT/);
  spool.spreadsheetId='wrong';await assert.rejects(()=>submit(intent,principal),/SPOOL_DESTINATION_MISMATCH/);
  assert.equal(isOperationalEnvelope({kind:'BATCH',payload:{items:[intent]}}),true);
});
