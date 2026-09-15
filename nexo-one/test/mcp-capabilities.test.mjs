import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNexoBootstrap,
  buildHypothesisRegistry,
  buildHypothesisFrontier,
  validateFrozenContract,
  buildExecutionFrontier,
  buildResultClosureStatus,
  dedupeCandidate
} from '../server/mcp/capabilities.mjs';
import {executeNexoMcpTool} from '../server/mcp/server.mjs';

const snapshot={
  sourceModifiedAt:'2026-09-15T18:00:00Z',generatedAt:'2026-09-15T18:01:00Z',
  sections:{
    HYPOTHESIS:[
      {hypothesis_id:'H-OPEN',proposition:'W causes Z',status:'OPEN',priority:8,expected_information_gain:0.9,claim_boundary:'Only Z',success_criteria:['S1'],kill_criteria:['K1'],critical_tests:['T1'],max_adaptive_followups:2,reopen_policy:'external-only'},
      {hypothesis_id:'H-DEAD',proposition:'A causes B',status:'FALSIFIED',priority:10,expected_information_gain:1}
    ],
    TEST:[
      {test_id:'T-RUN',hypothesis_id:'H-OPEN',status:'RUNNING'},
      {test_id:'T-DONE',hypothesis_id:'H-OPEN',status:'VERIFIED',result_ref:'R-1'}
    ],
    RUN:[{run_id:'RUN-1',test_id:'T-RUN',status:'RUNNING',lease_owner:'executor-00'}],
    RESULT:[{result_id:'R-1',test_id:'T-DONE',hypothesis_id:'H-OPEN',status:'VERIFIED'}],
    CLAIM:[],READBACK:[],WORK:[],EVENTS:[],KNOWLEDGE:[],DECISIONS:[],SYSTEM:[],THREADS:[]
  },
  projections:{Science:[],Engineering:[],Olympus:[]}
};

test('bootstrap declares canonical Tower and portable ingress contract',()=>{
  const out=buildNexoBootstrap(snapshot,{mutationAvailable:false});
  assert.equal(out.canonical.repository,'byDenoso/NEXO-Obsidian-Vault');
  assert.equal(out.canonical.ref,'main');
  assert.equal(out.canonical.root,'TOWER_V06');
  assert(out.ingressTypes.includes('SCIENTIFIC_HYPOTHESIS'));
  assert(out.ingressTypes.includes('ENGINEERING_OBJECTIVE'));
  assert(out.ingressTypes.includes('OLYMPUS_OBJECTIVE'));
  assert.equal(out.mutationAvailable,false);
  assert.match(out.scientificLoop,/RESULT/);
});

test('hypothesis registry preserves terminal hypotheses but frontier excludes absorbing states',()=>{
  const registry=buildHypothesisRegistry(snapshot);
  assert.deepEqual(registry.items.map(item=>item.id),['H-OPEN','H-DEAD']);
  const frontier=buildHypothesisFrontier(snapshot);
  assert.deepEqual(frontier.items.map(item=>item.id),['H-OPEN']);
});

test('frozen contract validator deterministically reports missing scientific fields',()=>{
  const ok=validateFrozenContract(snapshot.sections.HYPOTHESIS[0]);
  assert.equal(ok.valid,true);
  const bad=validateFrozenContract({hypothesis_id:'H-X',proposition:'X'});
  assert.equal(bad.valid,false);
  assert(bad.missing.includes('claim_boundary'));
  assert(bad.missing.includes('kill_criteria'));
});

test('execution frontier exposes active TEST/RUN ownership without manufacturing slots',()=>{
  const out=buildExecutionFrontier(snapshot);
  assert.deepEqual(out.activeTests.map(item=>item.id),['T-RUN']);
  assert.deepEqual(out.activeRuns.map(item=>item.id),['RUN-1']);
  assert.equal(out.activeRuns[0].owner,'executor-00');
});

test('closure diagnosis flags terminal result with missing reconciliation, claim decision and readback',()=>{
  const out=buildResultClosureStatus(snapshot);
  assert.equal(out.items.length,1);
  assert.equal(out.items[0].resultId,'R-1');
  assert.equal(out.items[0].closed,false);
  assert(out.items[0].missing.includes('HYPOTHESIS_RECONCILIATION'));
  assert(out.items[0].missing.includes('CLAIM_UPDATE_OR_NO_CHANGE'));
  assert(out.items[0].missing.includes('NEXT_TEST_OR_TERMINALIZE'));
  assert(out.items[0].missing.includes('READBACK'));
});

test('candidate dedupe matches normalized proposition before creating a second identity',()=>{
  const out=dedupeCandidate(snapshot,{kind:'SCIENTIFIC_HYPOTHESIS',proposition:'  w CAUSES z  '});
  assert.equal(out.duplicate,true);
  assert.equal(out.matchId,'H-OPEN');
});

test('MCP mutations fail closed without an injected canonical writer',async()=>{
  await assert.rejects(
    ()=>executeNexoMcpTool({readSnapshot:async()=>snapshot},'ingest_hypothesis',{proposition:'C causes D'}),
    /MCP_MUTATION_CAPABILITY_UNAVAILABLE/
  );
});

test('ingest_hypothesis routes a stable mutation envelope through the injected governed writer',async()=>{
  const calls=[];
  const result=await executeNexoMcpTool({
    readSnapshot:async()=>snapshot,
    mutateCanonical:async mutation=>{calls.push(mutation);return {status:'COMPLETED',readback:{verified:true,ref:'H-NEW'}};}
  },'ingest_hypothesis',{
    hypothesis_id:'H-NEW',
    proposition:'C causes D',
    claim_boundary:'Only D',
    success_criteria:['S'],kill_criteria:['K'],critical_tests:['T'],max_adaptive_followups:1,reopen_policy:'external-only'
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].operation,'hypothesis.ingest');
  assert.equal(calls[0].entity.hypothesis_id,'H-NEW');
  assert.equal(calls[0].entity.status,'OPEN');
  assert.equal(result.readback.verified,true);
});
