import test from 'node:test';import assert from 'node:assert/strict';import {composeScientificBattery} from '../lib/nexo-scientific-battery.mjs';
const contract={question:'Q',dataset_and_selection:'D',null:'N',rival:'R',priors:'P',likelihood:'L',covariance:'C',observable:'O',cuts:'X',parameterization:'PAR',method:'M',decision_rule:'RULE',success_criteria:['S'],kill_criteria:['K'],claim_boundary:'B'};
const hypothesis={id:'H-1',hypothesis_id:'H-1',proposition:'P',status:'OPEN',critical_tests:['T1'],frozen_test_contracts:{T1:contract}};
const ctx={battery_contracts:{},battery_manifests:{},canonical_tests:[],canonical_work:[],capabilities:{'scientific.generic_contract_executor_v1':{status:'ACTIVE',backend:'nexo_runtime'}},recipes:{}};
test('composer emits deterministic READY battery from frozen canonical science only',()=>{
 const out=composeScientificBattery(hypothesis,ctx);assert.equal(out.state,'READY');assert.equal(out.tests.length,1);assert.equal(out.tests[0].capability_id,'scientific.generic_contract_executor_v1');assert.match(out.battery_manifest.battery_fingerprint,/^sha256:/);
});
test('composer refuses missing scientific field instead of inventing it',()=>{
 const bad=structuredClone(hypothesis);delete bad.frozen_test_contracts.T1.covariance;const out=composeScientificBattery(bad,ctx);assert.equal(out.state,'NEEDS_DENER');assert.ok(out.missing_fields.includes('covariance'));assert.equal(out.canonical_mutations,0);
});
test('composer does not reopen absorbing hypothesis silently',()=>{
 const out=composeScientificBattery({...hypothesis,status:'FALSIFIED'},ctx);assert.equal(out.state,'ABSORBED');assert.equal(out.canonical_mutations,0);
});
test('composer returns capability gap when no registered runnable adapter exists',()=>{
 const out=composeScientificBattery(hypothesis,{...ctx,capabilities:{}});assert.equal(out.state,'CAPABILITY_GAP');assert.equal(out.engineering_gaps[0].scientific_specification_preserved,true);
});
