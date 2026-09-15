import test from 'node:test';
import assert from 'node:assert/strict';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createNexoMcpWebHandler,NEXO_MCP_TOOL_NAMES} from '../server/mcp/server.mjs';

const snapshot={
  sourceModifiedAt:'2026-09-12T12:00:00Z',generatedAt:'2026-09-12T12:01:00Z',
  sections:{WORK:[{work_id:'T-H0',thread_id:'THR::SCIENCE::ROOT',kind:'TEST',question:'H0 test',status:'DONE',primary_campaign:'CAMP-H0',source_ref:'SRC-T'}],EVENTS:[],KNOWLEDGE:[],DECISIONS:[],SYSTEM:[],THREADS:[]},
  projections:{Science:[
    {record_type:'program',record_id:'PROG-EXP',status:'ACTIVE',title:'Expansion',domain:'EXPANSION',source_ref:'SRC-P'},
    {record_type:'campaign',record_id:'CAMP-H0',program_id:'PROG-EXP',status:'ACTIVE',title:'H0 campaign',domain:'D1',source_ref:'SRC-C'},
    {record_type:'observation',record_id:'OBS-H0',observation_id:'OBS-H0',observation_kind:'scalar',metric_id:'cosmology.H0',metric_value:71.5884,unit:'km/s/Mpc',campaign_id:'CAMP-H0',test_id:'T-H0',domains:['D1'],source_ref:'SRC-O'}
  ],Engineering:[],Olympus:[]}
};

test('official MCP client negotiates 2026-07-28 and sees only read-only NEXO tools',async()=>{
  const handler=createNexoMcpWebHandler({readSnapshot:async()=>snapshot});
  const transport=new StreamableHTTPClientTransport(new URL('http://test.local/mcp'),{
    fetch:(url,init)=>handler.fetch(new Request(url,init))
  });
  const client=new Client({name:'nexo-mcp-test',version:'1.0.0'},{versionNegotiation:{mode:'auto'}});
  try{
    await client.connect(transport);
    assert.equal(client.getNegotiatedProtocolVersion(),'2026-07-28');
    const list=await client.listTools();
    assert.deepEqual(list.tools.map(tool=>tool.name),NEXO_MCP_TOOL_NAMES);
    for(const tool of list.tools){
      assert.equal(tool.annotations?.readOnlyHint,true,tool.name);
      assert.equal(tool.annotations?.destructiveHint,false,tool.name);
      assert.equal(tool.annotations?.idempotentHint,true,tool.name);
      assert.equal(tool.annotations?.openWorldHint,false,tool.name);
    }
    const result=await client.callTool({name:'get_h0_stacks',arguments:{}});
    assert.equal(result.isError,undefined);
    assert.equal(result.content[0]?.type,'text');
    const payload=JSON.parse(result.content[0].text);
    assert.equal(payload.items.length,1);
    assert.equal(payload.items[0].metricId,'cosmology.H0');
    assert.equal(payload.items[0].value,71.5884);

    const style=await client.callTool({name:'validate_style_text',arguments:{text:'A integração é a prioridade atual.'}});
    assert.equal(style.isError,undefined);
    const stylePayload=JSON.parse(style.content[0].text);
    assert.equal(stylePayload.policyId,'STYLE_DIRECT_AFFIRMATIVE_V1');
    assert.equal(stylePayload.ok,true);
  }finally{
    await client.close().catch(()=>{});
    await handler.close();
  }
});
