import test from 'node:test';
import assert from 'node:assert/strict';
import {NEXO_MCP_TOOL_NAMES,executeNexoMcpTool} from '../server/mcp/server.mjs';

test('MCP exposes canonical style policy tools', () => {
  assert.ok(NEXO_MCP_TOOL_NAMES.includes('get_style_policy'));
  assert.ok(NEXO_MCP_TOOL_NAMES.includes('validate_style_text'));
});

test('style policy read does not depend on science snapshot', async () => {
  const readSnapshot=()=>{throw new Error('SNAPSHOT_SHOULD_NOT_BE_READ')};
  const result=await executeNexoMcpTool({readSnapshot},'get_style_policy',{});
  assert.equal(result.policy.id,'STYLE_DIRECT_AFFIRMATIVE_V1');
  assert.match(result.instruction,/frases afirmativas diretas/i);
});

test('MCP style validator returns violations and accepts direct copy', async () => {
  const readSnapshot=()=>{throw new Error('SNAPSHOT_SHOULD_NOT_BE_READ')};
  const rejected=await executeNexoMcpTool({readSnapshot},'validate_style_text',{text:'Não falta integração, falta coordenação.'});
  assert.equal(rejected.ok,false);
  assert.equal(rejected.violations[0].code,'CONTRASTIVE_REFRAME');

  const accepted=await executeNexoMcpTool({readSnapshot},'validate_style_text',{text:'A coordenação é a prioridade de integração.'});
  assert.deepEqual(accepted,{policyId:'STYLE_DIRECT_AFFIRMATIVE_V1',ok:true,violations:[]});
});
