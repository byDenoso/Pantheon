import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveEffectKey,
  executeCapabilityAware,
  selectCapabilityRoute,
  stableFingerprint,
} from '../server/execution/capability-fabric.mjs';

const NOW='2026-09-09T23:08:00-03:00';
const ACTOR='NEXO Executor v0.1';
const CAMB_PASS={
  capability_id:'CAP-CAMB-SCHEDULED-INVOKE',domain:'SCIENCE',runtime:'SCHEDULED_TASK',
  operation:'Hydrate and invoke canonical Portable CAMB from Drive inside Scheduled Task and persist a real checkpoint/result',
  status:'PASS',risk_level:'L2_SCIENTIFIC_BOUNDED',fingerprint:'cap-camb-scheduled-invoke-v2-pass-real-action',
};
const GITHUB_READ_PASS={
  capability_id:'CAP-GITHUB-SCHEDULED-READ',domain:'ENGINEERING',runtime:'SCHEDULED_TASK',
  operation:'Repository metadata/read',status:'PASS',risk_level:'L1_READ_ONLY',fingerprint:'cap-github-scheduled-read-v1',
};
const GITHUB_WRITE_UNVERIFIED={
  capability_id:'CAP-GITHUB-SCHEDULED-WRITE',domain:'ENGINEERING',runtime:'SCHEDULED_TASK',
  operation:'Branch/file/PR write',status:'UNVERIFIED',risk_level:'L2_REVERSIBLE_IF_ISOLATED',
  fingerprint:'cap-github-scheduled-write-v2-unverified-interactive-patch-observed',
};

function makeStores(){
  const effects=new Map(),runs=new Map();
  return {
    effects,runs,
    effectLedger:{
      async get(key){return effects.get(key)||null},
      async reserve(row){
        if(effects.has(row.effect_key))return {acquired:false,existing:effects.get(row.effect_key)};
        effects.set(row.effect_key,{...row});return {acquired:true,row:effects.get(row.effect_key)};
      },
      async complete(key,patch){const row={...effects.get(key),...patch};effects.set(key,row);return row},
      async fail(key,patch){const row={...effects.get(key),...patch};effects.set(key,row);return row},
    },
    executionRuns:{
      async start(row){runs.set(row.run_id,{...row});return runs.get(row.run_id)},
      async finish(id,patch){const row={...runs.get(id),...patch};runs.set(id,row);return row},
    },
  };
}

function leasedAction(domain='SCIENCE'){
  return {action_id:`ACT-${domain}-FABRIC-001`,domain,lease_owner:ACTOR,lease_until:'2026-09-10T00:30:00-03:00',write_token:'wt-001'};
}

test('stable fingerprints and effect keys are deterministic and route-independent',()=>{
  const a=stableFingerprint({b:2,a:{z:3,y:4}}),b=stableFingerprint({a:{y:4,z:3},b:2});
  assert.equal(a,b);
  const base={actionId:'ACT-1',requiredOperation:'Repository metadata/read',context:'SCHEDULED_TASK',inputFingerprint:a};
  assert.equal(deriveEffectKey(base),deriveEffectKey({...base,runtime:'OTHER'}));
});

test('route selection admits only exact PASS capability and deterministically minimizes risk then cost',()=>{
  const capabilities=[
    {capability_id:'CAP-B',domain:'ENGINEERING',runtime:'SCHEDULED_TASK',operation:'Repository metadata/read',status:'PASS',risk_level:'L2_REVERSIBLE',cost_weight:1},
    {capability_id:'CAP-C',domain:'ENGINEERING',runtime:'SCHEDULED_TASK',operation:'Repository metadata/read',status:'PASS',risk_level:'L1_READ_ONLY',cost_weight:5},
    {capability_id:'CAP-A',domain:'ENGINEERING',runtime:'SCHEDULED_TASK',operation:'Repository metadata/read',status:'PASS',risk_level:'L1_READ_ONLY',cost_weight:1},
    {...GITHUB_READ_PASS,status:'UNKNOWN'},
  ];
  const chosen=selectCapabilityRoute({capabilities,domain:'ENGINEERING',requiredOperation:'Repository metadata/read',context:'SCHEDULED_TASK',eligibleRuntimes:['SCHEDULED_TASK']});
  assert.equal(chosen.capability_id,'CAP-A');
});

test('CAMB scheduled PASS executes once, provider readback closes EFFECT, replay becomes NO_OP',async()=>{
  const stores=makeStores();let executeCalls=0,readbackCalls=0;
  const adapters={
    'CAP-CAMB-SCHEDULED-INVOKE':{
      mutating:true,
      async execute(){executeCalls++;return {providerObjectId:'camb-witness-001'}},
      async readback(){readbackCalls++;return {verified:true,providerObjectId:'camb-witness-001',receiptRef:'drive:camb-witness-001',fingerprint:'camb-output-v1'}},
    },
  };
  const request={
    action:leasedAction('SCIENCE'),requiredOperation:CAMB_PASS.operation,context:'SCHEDULED_TASK',input:{params:{H0:67.4,ombh2:0.0224}},
    capabilities:[CAMB_PASS],adapters,effectLedger:stores.effectLedger,executionRuns:stores.executionRuns,
    actor:ACTOR,writeToken:'wt-001',now:NOW,
  };
  const first=await executeCapabilityAware(request);
  assert.equal(first.status,'SUCCESS');
  assert.equal(first.capability.capability_id,'CAP-CAMB-SCHEDULED-INVOKE');
  assert.equal(first.runtime,'SCHEDULED_TASK');
  assert.equal(first.readback.verified,true);
  assert.equal(stores.effects.get(first.effectKey).status,'DONE');
  assert.equal(stores.effects.get(first.effectKey).readback_status,'PASS');
  const run=stores.runs.get(first.runId);
  assert.equal(run.capability_id,'CAP-CAMB-SCHEDULED-INVOKE');
  assert.equal(run.runtime,'SCHEDULED_TASK');
  assert.equal(run.input_fingerprint,first.inputFingerprint);
  assert.equal(run.effect_key,first.effectKey);
  assert.equal(run.readback,'PASS');

  const replay=await executeCapabilityAware(request);
  assert.equal(replay.status,'NO_OP_ALREADY_APPLIED');
  assert.equal(executeCalls,1);
  assert.equal(readbackCalls,1);
});

test('GitHub scheduled read PASS executes through eligible runtime and requires verified provider readback',async()=>{
  const stores=makeStores();let calls=0;
  const result=await executeCapabilityAware({
    action:{action_id:'ACT-ENG-GH-READ-001',domain:'ENGINEERING'},requiredOperation:GITHUB_READ_PASS.operation,context:'SCHEDULED_TASK',input:{repo:'byDenoso/Pantheon'},
    capabilities:[GITHUB_READ_PASS],
    adapters:{'CAP-GITHUB-SCHEDULED-READ':{mutating:false,async execute(){calls++;return {providerObjectId:'byDenoso/Pantheon'}},async readback(){return {verified:true,providerObjectId:'byDenoso/Pantheon',receiptRef:'github:repo-read',fingerprint:'repo-read-v1'}}}},
    effectLedger:stores.effectLedger,executionRuns:stores.executionRuns,actor:ACTOR,now:NOW,
  });
  assert.equal(result.status,'SUCCESS');
  assert.equal(result.capability.capability_id,'CAP-GITHUB-SCHEDULED-READ');
  assert.equal(result.readback.verified,true);
  assert.equal(calls,1);
});

test('GitHub scheduled write UNVERIFIED fails closed before adapter invocation',async()=>{
  const stores=makeStores();let calls=0;
  await assert.rejects(()=>executeCapabilityAware({
    action:leasedAction('ENGINEERING'),requiredOperation:GITHUB_WRITE_UNVERIFIED.operation,context:'SCHEDULED_TASK',input:{path:'snapshot.json'},
    capabilities:[GITHUB_WRITE_UNVERIFIED],
    adapters:{'CAP-GITHUB-SCHEDULED-WRITE':{mutating:true,async execute(){calls++;return {}},async readback(){return {verified:true}}}},
    effectLedger:stores.effectLedger,executionRuns:stores.executionRuns,actor:ACTOR,writeToken:'wt-001',now:NOW,
  }),/CAPABILITY_FAIL_CLOSED:UNVERIFIED/);
  assert.equal(calls,0);
  assert.equal(stores.effects.size,0);
  assert.equal(stores.runs.size,0);
});

test('UNKNOWN and BLOCKED capabilities also fail closed',()=>{
  for(const status of ['UNKNOWN','BLOCKED']){
    assert.throws(()=>selectCapabilityRoute({capabilities:[{...GITHUB_READ_PASS,status}],domain:'ENGINEERING',requiredOperation:GITHUB_READ_PASS.operation,context:'SCHEDULED_TASK',eligibleRuntimes:['SCHEDULED_TASK']}),new RegExp(`CAPABILITY_FAIL_CLOSED:${status}`));
  }
});

test('mutating PASS route requires a live matching lease and write token',async()=>{
  const stores=makeStores();
  await assert.rejects(()=>executeCapabilityAware({
    action:{...leasedAction('SCIENCE'),lease_until:'2026-09-09T22:00:00-03:00'},requiredOperation:CAMB_PASS.operation,context:'SCHEDULED_TASK',input:{x:1},capabilities:[CAMB_PASS],
    adapters:{'CAP-CAMB-SCHEDULED-INVOKE':{mutating:true,async execute(){return {}},async readback(){return {verified:true}}}},
    effectLedger:stores.effectLedger,executionRuns:stores.executionRuns,actor:ACTOR,writeToken:'wt-001',now:NOW,
  }),/LEASE_EXPIRED/);
});

test('execution chooses the lowest-risk PASS route that has an available adapter',async()=>{
  const stores=makeStores();
  const missingAdapter={capability_id:'CAP-LOWEST-NO-ADAPTER',domain:'ENGINEERING',runtime:'SCHEDULED_TASK',operation:GITHUB_READ_PASS.operation,status:'PASS',risk_level:'L1_READ_ONLY',cost_weight:0};
  const usable={...GITHUB_READ_PASS,capability_id:'CAP-USABLE',risk_level:'L1_READ_ONLY',cost_weight:1};
  const result=await executeCapabilityAware({
    action:{action_id:'ACT-ENG-ROUTE-001',domain:'ENGINEERING'},requiredOperation:GITHUB_READ_PASS.operation,context:'SCHEDULED_TASK',input:{repo:'byDenoso/Pantheon'},
    capabilities:[missingAdapter,usable],
    adapters:{'CAP-USABLE':{mutating:false,async execute(){return {providerObjectId:'repo'}},async readback(){return {verified:true,providerObjectId:'repo',receiptRef:'github:repo'}}}},
    effectLedger:stores.effectLedger,executionRuns:stores.executionRuns,actor:ACTOR,now:NOW,
  });
  assert.equal(result.capability.capability_id,'CAP-USABLE');
});

test('verified EFFECT remains replay-safe if execution-run finalization fails after provider readback',async()=>{
  const stores=makeStores();let providerCalls=0,finishCalls=0;
  stores.executionRuns.finish=async()=>{finishCalls++;throw new Error('RUN_LEDGER_UNAVAILABLE')};
  const request={
    action:leasedAction('SCIENCE'),requiredOperation:CAMB_PASS.operation,context:'SCHEDULED_TASK',input:{params:{H0:67.4}},capabilities:[CAMB_PASS],
    adapters:{'CAP-CAMB-SCHEDULED-INVOKE':{mutating:true,async execute(){providerCalls++;return {providerObjectId:'camb-safe'}},async readback(){return {verified:true,providerObjectId:'camb-safe',receiptRef:'drive:camb-safe'}}}},
    effectLedger:stores.effectLedger,executionRuns:stores.executionRuns,actor:ACTOR,writeToken:'wt-001',now:NOW,
  };
  await assert.rejects(()=>executeCapabilityAware(request),/RUN_LEDGER_UNAVAILABLE/);
  const [effect]=stores.effects.values();
  assert.equal(effect.status,'DONE');
  assert.equal(effect.readback_status,'PASS');
  const replay=await executeCapabilityAware(request);
  assert.equal(replay.status,'NO_OP_ALREADY_APPLIED');
  assert.equal(providerCalls,1);
  assert.ok(finishCalls>=1);
});
