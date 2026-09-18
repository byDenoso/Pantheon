import test from 'node:test';
import assert from 'node:assert/strict';

import {createScientificMcpService, toolDescriptor} from '../lib/scientific-mcp.mjs';

function fakeGateway(){
  let mutation=null;
  let dispatches=0;
  return {
    configured:{towerRepo:'byDenoso/NEXO-Obsidian-Vault',towerRef:'main',towerWrite:true},
    async findByFingerprint(){return null;},
    async persistTest(next){mutation=next;return {accepted:true};},
    async readbackTest(testId,{fingerprint}){return {id:testId,scientific_fingerprint:fingerprint,status:'READY'};},
    async resolveCapability(){return {id:'science.demo_v1',status:'PASS'};},
    async dispatchTest(){dispatches+=1;return 'RUN-UNEXPECTED';},
    get mutation(){return mutation;},
    get dispatches(){return dispatches;},
  };
}

test('hosted bootstrap advertises canonical runtime queue protocol to new chats',async()=>{
  const gateway=fakeGateway();
  const service=createScientificMcpService({gateway});
  const bootstrap=await service.getBootstrap();
  assert.equal(bootstrap.science.execution.protocol,'SCIENTIFIC_TEST_QUEUE_V1');
  assert.equal(bootstrap.science.execution.default_submit_mode,'QUEUE_ONLY');
  assert.equal(bootstrap.science.execution.ordering,'TEST_THEN_WORK_THEN_QUEUE');
  assert.equal(bootstrap.science.execution.executor,'NEXO_CORE_LOOP_LEAN_MIN_V1');
  assert.equal(bootstrap.science.execution.runtime,'NEXO_RUNTIME');
  assert.equal(bootstrap.science.execution.github_actions,'EXPLICIT_INDEPENDENT_WITNESS_ONLY');
  assert.equal(bootstrap.science.execution.new_chat_rule,'CALL_NEXO_GET_BOOTSTRAP_BEFORE_PREPARING_OR_RUNNING_SCIENTIFIC_TESTS');
});

test('hosted scientific submit persists canonical test but never dispatches compute',async()=>{
  const gateway=fakeGateway();
  const service=createScientificMcpService({gateway});
  const result=await service.submitUtterance('Teste D00',{defaults:{execution_capability:'science.demo_v1',method:'frozen-v1',decision_rule:'frozen threshold',claim_boundary:'no automatic claim promotion'}});
  assert.equal(result.accepted,true);
  assert.equal(result.execute,false);
  assert.equal(result.ordering,'TEST_THEN_WORK_THEN_QUEUE');
  assert.equal(result.queue_contract,'SCIENTIFIC_TEST_QUEUE_V1');
  assert.equal(result.execution_owner,'NEXO_CORE_LOOP_LEAN_MIN_V1');
  assert.equal(result.runtime,'NEXO_RUNTIME');
  assert.equal(result.tests.length,1);
  assert.equal(result.tests[0].state,'QUEUED');
  assert.equal(result.tests[0].canonical_readback,true);
  assert.ok(gateway.mutation);
  assert.equal(gateway.dispatches,0);
});

test('hosted tool description describes queue admission rather than immediate execution',()=>{
  const descriptor=toolDescriptor();
  assert.match(descriptor.description,/queue/i);
  assert.doesNotMatch(descriptor.description,/dispatch/i);
});
