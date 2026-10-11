import test from 'node:test';
import assert from 'node:assert/strict';
import {executeNexoMcpTool,readNexoMcpStatus} from '../server/mcp/server.mjs';

test('MCP distinguishes safe authorization, rate limit and deadline errors from source failures',async()=>{
  const cases=[
    [Object.assign(new Error('secret-canary'),{code:'AUTH_REQUIRED'}),'MCP_AUTH_REQUIRED'],
    [Object.assign(new Error('secret-canary'),{code:'RATE_LIMITED'}),'MCP_RATE_LIMITED'],
    [new DOMException('secret-canary','TimeoutError'),'MCP_TIMEOUT'],
    [new Error('secret-canary'),'MCP_SOURCE_UNAVAILABLE'],
    [Object.assign(new Error('secret-canary'),{code:'secret-canary'}),'MCP_SOURCE_UNAVAILABLE']
  ];
  for(const [sourceError,expected] of cases){
    const readSnapshot=async()=>{throw sourceError;};
    await assert.rejects(()=>executeNexoMcpTool({readSnapshot},'get_science_state'),error=>error.code===expected&&error.message===expected);
    const status=await readNexoMcpStatus({readSnapshot});
    assert.equal(status.status,'DEGRADED');
    assert.equal(status.source_error_code,expected);
    const capabilities=await executeNexoMcpTool({readSnapshot},'get_capabilities');
    assert.equal(capabilities.public_surface.source_error_code,expected);
    assert(!JSON.stringify(capabilities).includes('secret-canary'));
  }
});

test('MCP input errors remain distinct and do not read a source',async()=>{
  let reads=0;
  const readSnapshot=async()=>{reads++;throw Error('must not read');};
  await assert.rejects(()=>executeNexoMcpTool({readSnapshot},'search_atlas',{limit:0}),{code:'MCP_INVALID_INPUT'});
  await assert.rejects(()=>executeNexoMcpTool({readSnapshot},'nexo_search',{query:'NEXO'}),{code:'UNKNOWN_MCP_TOOL'});
  assert.equal(reads,0);
});
