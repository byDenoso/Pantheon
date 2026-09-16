import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createScientificMcpService,
  handleMcpRpc,
  toolDescriptors,
  HYPOTHESES_TOOL_NAME,
  HYPOTHESIS_TOOL_NAME,
  HYPOTHESIS_FRONTIER_TOOL_NAME,
  HYPOTHESIS_VALIDATOR_TOOL_NAME,
} from '../lib/scientific-mcp.mjs';

const complete = overrides => ({
  id: 'HYP-A',
  proposition: 'A testable proposition',
  status: 'OPEN',
  claim_boundary: 'bounded claim',
  success_criteria: ['signal'],
  kill_criteria: ['null'],
  critical_tests: ['T-1'],
  max_adaptive_followups: 2,
  reopen_policy: 'new evidence',
  priority: 4,
  expected_information_gain: 0.6,
  ...overrides,
});

const gateway = items => ({
  configured: {towerRepo:'byDenoso/NEXO-Obsidian-Vault',towerRef:'main',towerWrite:false},
  async listHypotheses(){return items},
  async readHypothesis(id){return items.find(item => (item.id || item.hypothesis_id) === id) || null},
});

function rpc(name,args={}){
  return {jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}};
}

test('hosted MCP advertises the canonical read-only hypothesis surface',()=>{
  const names=toolDescriptors().map(item=>item.name);
  for(const name of [HYPOTHESES_TOOL_NAME,HYPOTHESIS_TOOL_NAME,HYPOTHESIS_FRONTIER_TOOL_NAME,HYPOTHESIS_VALIDATOR_TOOL_NAME]){
    assert.ok(names.includes(name),`missing ${name}`);
  }
  assert.ok(!names.includes('nexo.ingest_hypothesis'),'write tool must remain unadvertised without hosted write authorization');
});

test('registry and entity reads normalize legacy identity/title fields exactly once',async()=>{
  const items=[complete({id:undefined,hypothesis_id:'HYP-LEGACY',proposition:undefined,title:'Legacy title',status:'active'})];
  const service=createScientificMcpService({gateway:gateway(items)});
  const registry=await service.getHypotheses();
  assert.equal(registry.contract,'NEXO_HYPOTHESIS_REGISTRY_V1');
  assert.equal(registry.total,1);
  assert.equal(registry.items[0].id,'HYP-LEGACY');
  assert.equal(registry.items[0].proposition,'Legacy title');
  assert.equal(registry.items[0].status,'ACTIVE');
  assert.equal(registry.items[0].contract_state,'FROZEN');
  assert.equal(registry.items[0].execution_eligible,true);
  const entity=await service.getHypothesis('HYP-LEGACY');
  assert.equal(entity.id,'HYP-LEGACY');
});

test('frontier excludes absorbing states and sorts priority then information gain then id',async()=>{
  const items=[
    complete({id:'HYP-B',priority:5,expected_information_gain:0.2,status:'OPEN'}),
    complete({id:'HYP-A',priority:5,expected_information_gain:0.9,status:'ACTIVE'}),
    complete({id:'HYP-C',priority:9,expected_information_gain:1,status:'FALSIFIED'}),
    complete({id:'HYP-D',priority:3,expected_information_gain:1,status:'RETIRED'}),
    complete({id:'HYP-E',priority:4,expected_information_gain:0.99,status:'QUEUED'}),
  ];
  const service=createScientificMcpService({gateway:gateway(items)});
  const frontier=await service.getHypothesisFrontier();
  assert.equal(frontier.contract,'NEXO_HYPOTHESIS_FRONTIER_V1');
  assert.deepEqual(frontier.items.map(item=>item.id),['HYP-A','HYP-B','HYP-E']);
  assert.deepEqual(frontier.excluded_statuses,['FALSIFIED','RETIRED']);
  assert.equal(frontier.selection_owner,'NEXO_AUTOCONSISTENTE_V1_3');
});

test('validator mirrors HYPOTHESIS_LIFECYCLE_V1 required fields',async()=>{
  const service=createScientificMcpService({gateway:gateway([])});
  const valid=await service.validateHypothesisContract(complete({hypothesis_id:'HYP-V',id:undefined}));
  assert.equal(valid.contract,'HYPOTHESIS_LIFECYCLE_V1');
  assert.equal(valid.valid,true);
  assert.deepEqual(valid.missing,[]);
  const invalid=await service.validateHypothesisContract({hypothesis_id:'HYP-X',proposition:'x'});
  assert.equal(invalid.valid,false);
  assert.ok(invalid.missing.includes('claim_boundary'));
  assert.ok(invalid.missing.includes('critical_tests'));
});

test('JSON-RPC exposes registry/frontier/validator and returns a tool error for missing entity',async()=>{
  const service=createScientificMcpService({gateway:gateway([complete({id:'HYP-A'})])});
  const listed=await handleMcpRpc(rpc(HYPOTHESES_TOOL_NAME),{service});
  assert.equal(listed.result.structuredContent.total,1);
  const frontier=await handleMcpRpc(rpc(HYPOTHESIS_FRONTIER_TOOL_NAME),{service});
  assert.equal(frontier.result.structuredContent.items[0].id,'HYP-A');
  const validated=await handleMcpRpc(rpc(HYPOTHESIS_VALIDATOR_TOOL_NAME,{hypothesis:{hypothesis_id:'HYP-X',proposition:'x'}}),{service});
  assert.equal(validated.result.structuredContent.valid,false);
  const missing=await handleMcpRpc(rpc(HYPOTHESIS_TOOL_NAME,{hypothesis_id:'../../CONTROL'}),{service});
  assert.equal(missing.result.isError,true);
  assert.match(missing.result.structuredContent.error,/HYPOTHESIS_(ID_INVALID|NOT_FOUND)/);
});
