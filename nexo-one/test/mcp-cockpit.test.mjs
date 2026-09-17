import test from 'node:test';
import assert from 'node:assert/strict';
import {executeNexoMcpTool,NEXO_MCP_TOOL_NAMES} from '../server/mcp/server.mjs';

const system={contract_version:'1',capabilities:[{capability_id:'CAP-1',status:'PASS'}],runs:[{run_id:'RUN-1'}],graph:{nodes:[{id:'n1'}],edges:[]},filaments:[{id:'f1'}],providers:[{id:'github',state:'LIVE'}]};
const world={version:'1',access:'PUBLIC',providers:[{id:'gmail',status:'AUTH_REQUIRED',message:'Private provider'}],items:[]};
const callbacks={readSnapshot:async()=>({version:'snapshot'}),readSystemState:async()=>system,readWorldState:async()=>world};

test('cockpit MCP read tools are registered',()=>{
  for(const name of ['get_system_state','get_world_state','get_capabilities','get_execution_runs','get_graph','get_learning_state','get_provider_health'])assert.equal(NEXO_MCP_TOOL_NAMES.includes(name),true,name);
});

test('cockpit MCP tools project the canonical public read models',async()=>{
  assert.equal((await executeNexoMcpTool(callbacks,'get_system_state')).contract_version,'1');
  assert.equal((await executeNexoMcpTool(callbacks,'get_world_state')).access,'PUBLIC');
  assert.deepEqual((await executeNexoMcpTool(callbacks,'get_capabilities')).items,system.capabilities);
  assert.deepEqual((await executeNexoMcpTool(callbacks,'get_execution_runs')).items,system.runs);
  assert.deepEqual((await executeNexoMcpTool(callbacks,'get_graph')),system.graph);
  assert.deepEqual((await executeNexoMcpTool(callbacks,'get_learning_state')).items,system.filaments);
  assert.deepEqual((await executeNexoMcpTool(callbacks,'get_provider_health')).items,system.providers);
});

test('public world tool preserves auth-required placeholders without private payload',async()=>{
  const out=await executeNexoMcpTool(callbacks,'get_world_state');
  assert.equal(out.providers[0].status,'AUTH_REQUIRED');
  assert.equal(JSON.stringify(out).includes('private-message-body'),false);
});
