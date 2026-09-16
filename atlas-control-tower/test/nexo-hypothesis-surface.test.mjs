import test from 'node:test';
import assert from 'node:assert/strict';
import {toolDescriptors} from '../lib/scientific-mcp.mjs';
import {createNexoSemanticGateway} from '../lib/nexo-semantic-gateway.mjs';

const HYPOTHESIS_TOOLS=[
  'nexo.get_hypotheses',
  'nexo.get_hypothesis',
  'nexo.get_hypothesis_frontier',
  'nexo.validate_hypothesis_contract',
];

const complete=overrides=>({
  id:'HYP-A',
  proposition:'A testable proposition',
  status:'OPEN',
  claim_boundary:'bounded claim',
  success_criteria:['signal'],
  kill_criteria:['null'],
  critical_tests:['T-1'],
  max_adaptive_followups:2,
  reopen_policy:'new evidence',
  priority:4,
  expected_information_gain:0.6,
  ...overrides,
});

function tower(items=[]){
  return {
    async listJsonDirectory(path){
      assert.equal(path,'entities/hypothesis');
      return items;
    },
    async readEntity(kind,id){
      assert.equal(kind,'hypothesis');
      return items.find(item=>String(item.id||item.hypothesis_id||item.entity_id||'')===id)||null;
    },
  };
}

test('hypothesis semantic tools are private authenticated reads, never public discovery',()=>{
  const publicNames=toolDescriptors({authenticated:false}).map(item=>item.name);
  const privateNames=toolDescriptors({authenticated:true}).map(item=>item.name);
  for(const name of HYPOTHESIS_TOOLS){
    assert.equal(publicNames.includes(name),false,`${name} leaked into public discovery`);
    assert.equal(privateNames.includes(name),true,`${name} missing from authenticated surface`);
  }
  assert.equal(privateNames.includes('nexo.ingest_hypothesis'),false,'hosted hypothesis writes remain fail-closed/unadvertised');
});

test('registry normalizes legacy identity/title fields and preserves source without creating state',async()=>{
  const semantic=createNexoSemanticGateway({towerGateway:tower([
    complete({id:undefined,hypothesis_id:'HYP-LEGACY',proposition:undefined,title:'Legacy title',status:'active'}),
  ])});
  const registry=await semantic.call('nexo.get_hypotheses',{});
  assert.equal(registry.contract,'NEXO_HYPOTHESIS_REGISTRY_V1');
  assert.equal(registry.total,1);
  assert.equal(registry.items[0].id,'HYP-LEGACY');
  assert.equal(registry.items[0].proposition,'Legacy title');
  assert.equal(registry.items[0].status,'ACTIVE');
  assert.equal(registry.items[0].contract_state,'FROZEN');
  assert.equal(registry.items[0].execution_eligible,true);
  assert.equal(registry.items[0].source.hypothesis_id,'HYP-LEGACY');
});

test('entity read validates identifier and returns normalized canonical hypothesis',async()=>{
  const semantic=createNexoSemanticGateway({towerGateway:tower([complete({id:'HYP-A'})])});
  const item=await semantic.call('nexo.get_hypothesis',{hypothesis_id:'HYP-A'});
  assert.equal(item.id,'HYP-A');
  await assert.rejects(()=>semantic.call('nexo.get_hypothesis',{hypothesis_id:'../../CONTROL'}),/INVALID_IDENTIFIER/);
  await assert.rejects(()=>semantic.call('nexo.get_hypothesis',{hypothesis_id:'HYP-MISSING'}),/HYPOTHESIS_NOT_FOUND/);
});

test('frontier mirrors Python contract: excludes only absorbing states and sorts priority then information gain then id',async()=>{
  const semantic=createNexoSemanticGateway({towerGateway:tower([
    complete({id:'HYP-B',priority:5,expected_information_gain:0.2,status:'OPEN'}),
    complete({id:'HYP-A',priority:5,expected_information_gain:0.9,status:'ACTIVE'}),
    complete({id:'HYP-C',priority:9,expected_information_gain:1,status:'FALSIFIED'}),
    complete({id:'HYP-D',priority:3,expected_information_gain:1,status:'RETIRED'}),
    complete({id:'HYP-E',priority:4,expected_information_gain:0.99,status:'QUEUED'}),
  ])});
  const frontier=await semantic.call('nexo.get_hypothesis_frontier',{});
  assert.equal(frontier.contract,'NEXO_HYPOTHESIS_FRONTIER_V1');
  assert.deepEqual(frontier.items.map(item=>item.id),['HYP-A','HYP-B','HYP-E']);
  assert.deepEqual(frontier.excluded_statuses,['FALSIFIED','RETIRED']);
  assert.equal(frontier.selection_owner,'NEXO_AUTOCONSISTENTE_V1_3');
  assert.equal(frontier.total,3);
});

test('validator mirrors HYPOTHESIS_LIFECYCLE_V1 required fields without mutation',async()=>{
  const semantic=createNexoSemanticGateway({towerGateway:tower([])});
  const valid=await semantic.call('nexo.validate_hypothesis_contract',{hypothesis:complete({id:undefined,hypothesis_id:'HYP-V'})});
  assert.equal(valid.contract,'HYPOTHESIS_LIFECYCLE_V1');
  assert.equal(valid.valid,true);
  assert.deepEqual(valid.missing,[]);
  const invalid=await semantic.call('nexo.validate_hypothesis_contract',{hypothesis:{hypothesis_id:'HYP-X',proposition:'x'}});
  assert.equal(invalid.valid,false);
  assert.ok(invalid.missing.includes('claim_boundary'));
  assert.ok(invalid.missing.includes('critical_tests'));
});
