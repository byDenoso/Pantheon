import test from 'node:test';
import assert from 'node:assert/strict';
import * as z from 'zod/v4';
import {operationalStateFromTower,TOWER_ID} from '../server/mcp/operational-state.mjs';
import {createOperationalService,registerOperationalTools,OPERATIONAL_TOOL_NAMES,MUTATIONS,SCIENTIFIC_MUTATION,sha256} from '../server/mcp/operational-tools.mjs';

const revision='sha256:'+'a'.repeat(64);
function liveTower(){
  return {contract:'NEXO_TOWER_LIVE_V1',stable_file_id:TOWER_ID,storage:'GOOGLE_DRIVE_PRIVATE',
    revision,state_fingerprint:revision,files:{
      'entities/artifact/OPERATIONAL-CONTROL-DRIVE-SUM-V1.json':{entity_version:2,value:{kind:'NEXO_OPERATIONAL_WORK_V1',payload:{id:'OPERATIONAL-CONTROL-DRIVE-SUM-V1'}}},
      'entities/test/T-DEH26-007-FRACTAL-MICRO-NORMALIZATION.json':{value:{entity_version:2,kind:'TEST',id:'T-DEH26-007-FRACTAL-MICRO-NORMALIZATION',
        domain:'SCIENCE',status:'BLOCKED_INPUT',priority:'P0',roadmap_id:'RM-DARK-ENERGY-NATURE-20260923-V1',
        display_name:'private title should not escape the facade',method:'private scientific text',
        readiness:{policy:'SCIENTIFIC_INTEGRITY_V1',eligible:false,reasons:['INPUT_PROVENANCE_INCOMPLETE','RECIPE_BINDING_MISSING'],input_scope:'RECORDED_BINDING_NOT_NETWORK_ATTESTATION'}}},
      'entities/test/OLY-SECRET.json':{value:{entity_version:1,kind:'TEST',id:'T-PUBLIC',domain:'SCIENCE',status:'READY'}},
      'entities/test/T-PRIVATE-VISIBILITY.json':{value:{entity_version:1,kind:'TEST',id:'T-PRIVATE-VISIBILITY',domain:'SCIENCE',visibility:'PRIVATE',status:'READY'}},
      'entities/test/T-CLIENT-PRIVATE.json':{value:{entity_version:1,kind:'TEST',id:'CLIENT-C-123',domain:'SCIENCE',status:'READY'}},
      'entities/test/PERSON-P-123.json':{value:{entity_version:1,kind:'TEST',id:'T-PERSON-PRIVATE',domain:'SCIENCE',status:'READY'}},
      'entities/test/T-SEMANTIC-OLY.json':{value:{entity_version:1,kind:'TEST',id:'T-SEMANTIC-OLY',domain:'SCIENCE',
        semantic:{domain_id:'olympus'},status:'READY'}},
      'entities/work/WORK::RECOVERY-TEST.json':{value:{entity_version:3,kind:'DEPENDENCY_RECOVERY',id:'WORK::RECOVERY-TEST',domain:'SCIENCE',
        owner_role:'LEARNER',target_role:'LEARNER',status:'WAIT_DEPENDENCY',test_id:'T-DEH26-007-FRACTAL-MICRO-NORMALIZATION',
        roadmap_id:'RM-DARK-ENERGY-NATURE-20260923-V1',priority:'P0',question:'private recovery prose',
        recovery:{validation:{policy:'SCIENTIFIC_INTEGRITY_V1',eligible:false,reasons:['INPUT_PROVENANCE_INCOMPLETE','RECIPE_BINDING_MISSING']}}}},
      'entities/work/WORK::ENGINEERING.json':{value:{entity_version:1,kind:'DEPENDENCY_RECOVERY',id:'WORK::ENGINEERING',domain:'SCIENCE',
        owner_role:'ENGINEER',status:'WAIT_DEPENDENCY',test_id:'OTHER-TEST'}},
      'evolution/batteries.json':{value:{batteries:[{id:'bat-existing',status:'DONE',tests:[{test_id:'T-DEH26-007-FRACTAL-MICRO-NORMALIZATION',attempt_id:'attempt-1'}]}]}}
    }};
}

test('authenticated scientific facade reads the existing Tower queue with assigned-role scope and blocker reasons',async()=>{
  const state=operationalStateFromTower(liveTower(),{body_verified:true,file_id:TOWER_ID});
  const principal={authenticated:true,id:'a'.repeat(64),roles:['CIENTISTA']};
  let submits=0;
  const service=createOperationalService({readState:async()=>state,submitIntent:async()=>{submits++;throw new Error('not used');},
    submitScientificRequest:async()=>{submits++;throw new Error('not used');}});
  const result=await service.call('get_scientific_queue',{role:'CIENTISTA',test_id:'T-DEH26-007-FRACTAL-MICRO-NORMALIZATION'},principal);
  assert.equal(result.contract,'NEXO_SCIENTIFIC_QUEUE_VIEW_V1');
  assert.equal(result.revision,revision);
  assert.equal(result.evidence.readback,'PASS');
  assert.equal(result.capabilities.can_reserve,false);
  assert.equal(result.capabilities.can_dispatch,false);
  assert.deepEqual(result.tests[0].readiness.recorded_reasons,['INPUT_PROVENANCE_INCOMPLETE','RECIPE_BINDING_MISSING']);
  assert.equal(result.tests[0].readiness.recorded_eligible,false);
  assert.equal(result.recoveries[0].status,'WAIT_DEPENDENCY');
  assert.equal(result.tests[0].attempt,null,'historical battery row is not the test’s exact current attempt');
  const rendered=JSON.stringify(result);
  assert.doesNotMatch(rendered,/private title|private scientific text|private recovery prose|OLY-SECRET|T-PUBLIC|T-PRIVATE-VISIBILITY|CLIENT-C-123|T-PERSON-PRIVATE|T-SEMANTIC-OLY/);
  assert.equal(submits,0);
  assert.ok(OPERATIONAL_TOOL_NAMES.includes('get_scientific_queue'));
  assert.ok(!MUTATIONS.includes('get_scientific_queue'));
});

test('science queue cannot escape the authenticated role binding or canonical Tower readback gate',async()=>{
  const state=operationalStateFromTower(liveTower(),{body_verified:true,file_id:TOWER_ID});
  const service=createOperationalService({readState:async()=>state,submitIntent:async()=>{throw new Error('not used');},
    submitScientificRequest:async()=>{throw new Error('not used');}});
  await assert.rejects(()=>service.call('get_scientific_queue',{role:'CIENTISTA'},null),/AUTHENTICATION_REQUIRED/);
  await assert.rejects(()=>service.call('get_scientific_queue',{role:'CIENTISTA'},
    {authenticated:true,id:'b'.repeat(64),roles:['EXECUTOR']}),/ROLE_FORBIDDEN/);
  await assert.rejects(()=>service.call('get_scientific_queue',{role:'ENGENHEIRO',test_id:'T-DEH26-007-FRACTAL-MICRO-NORMALIZATION'},
    {authenticated:true,id:'c'.repeat(64),roles:['ENGENHEIRO']}),/SCIENCE_WORK_NOT_FOUND_OR_FORBIDDEN/);
  const stale=createOperationalService({readState:async()=>({...state,readback:'FAILED'}),submitIntent:async()=>{throw new Error('not used');},
    submitScientificRequest:async()=>{throw new Error('not used');}});
  await assert.rejects(()=>stale.call('get_scientific_queue',{role:'CIENTISTA'},
    {authenticated:true,id:'d'.repeat(64),roles:['CIENTISTA']}),/CANONICAL_STATE_UNAVAILABLE/);
});

test('Executor attempt projection matches both canonical battery and attempt identifiers',async()=>{
  const tower=liveTower();
  const testRecord=tower.files['entities/test/T-DEH26-007-FRACTAL-MICRO-NORMALIZATION.json'].value;
  testRecord.owner_role='EXECUTOR';testRecord.battery_id='bat-current';testRecord.attempt_id='attempt-current';
  tower.files['evolution/batteries.json'].value.batteries.push(
    {id:'bat-current',status:'RUNNING',tests:[{test_id:testRecord.id,attempt_id:'attempt-current'}]});
  const state=operationalStateFromTower(tower,{body_verified:true,file_id:TOWER_ID});
  const service=createOperationalService({readState:async()=>state,submitIntent:()=>{throw new Error('not used');},
    submitScientificRequest:()=>{throw new Error('not used');}});
  const result=await service.call('get_scientific_queue',{role:'EXECUTOR',test_id:testRecord.id},
    {authenticated:true,id:'9'.repeat(64),roles:['EXECUTOR']});
  assert.deepEqual(result.tests[0].attempt,{id:'bat-current',status:'RUNNING',attempt_id:'attempt-current'});
});

test('role capabilities expose science queue requests only to Executor and distinguish request from dispatch',async()=>{
  const state=operationalStateFromTower(liveTower(),{body_verified:true,file_id:TOWER_ID});
  const service=createOperationalService({readState:async()=>state,submitIntent:()=>{throw new Error('not used');},
    submitScientificRequest:()=>{throw new Error('not used');}});
  const capabilities=await service.call('get_role_capabilities',{role:'CIENTISTA'},
    {authenticated:true,id:'e'.repeat(64),roles:['CIENTISTA']});
  assert.deepEqual(capabilities.scientific_queue.tools,['get_scientific_queue']);
  assert.equal(capabilities.scientific_queue.mode,'READ_ONLY');
  assert.equal(capabilities.scientific_queue.revision,revision);
  assert.equal(capabilities.scientific_queue.dispatch,false);
  assert.equal(capabilities.scientific_queue.reservation,false);
  assert.ok(!Object.keys(capabilities.scientific_queue).some(key=>/execute|submit|run/i.test(key)));
  const executor=await service.call('get_role_capabilities',{role:'EXECUTOR'},
    {authenticated:true,id:'f'.repeat(64),roles:['EXECUTOR']});
  assert.deepEqual(executor.scientific_queue.tools,['get_scientific_queue',SCIENTIFIC_MUTATION]);
  assert.equal(executor.scientific_queue.dispatch,false);
  assert.equal(executor.scientific_queue.exercised,false);
});

test('Executor can enqueue only canonically READY and attested tests through the Writer spool',async()=>{
  const tower=liveTower();
  const value=tower.files['entities/test/T-DEH26-007-FRACTAL-MICRO-NORMALIZATION.json'].value;
  value.status='READY';value.owner_role='EXECUTOR';
  value.recipe='seed_bounds';value.recipe_params={seed:17};value.prereg_hash='c'.repeat(64);
  value.readiness={policy:'SCIENTIFIC_INTEGRITY_V1',eligible:true,reasons:[],input_scope:'CANONICAL_FROZEN_INPUT'};
  const state=operationalStateFromTower(tower,{body_verified:true,file_id:TOWER_ID});
  const principal={authenticated:true,id:'1'.repeat(64),roles:['EXECUTOR']};
  const submitted=[];
  let reads=0;
  const service=createOperationalService({readState:async()=>({...state,revision:`sha256:${String.fromCharCode(98+reads++).repeat(64)}`}),submitIntent:async()=>{throw new Error('not used');},
    submitScientificRequest:async(stableId,envelope)=>{
      submitted.push({stableId,envelope});
      return {readback:'PASS',stable_id:stableId,body_sha256:sha256({...envelope,_via:'INBOX_GATEWAY_SHEET'}),reused:submitted.length>1};
    }});
  const discovery=await service.call('get_scientific_queue',{role:'EXECUTOR'},principal);
  assert.equal(discovery.tests[0].id,value.id,'an unreserved READY test is discoverable by the Executor');
  const first=await service.call(SCIENTIFIC_MUTATION,{test_id:value.id},principal);
  const again=await service.call(SCIENTIFIC_MUTATION,{test_id:value.id},principal);
  assert.equal(first.status,'PENDING_WRITER');
  assert.equal(first.queue_readback,'PASS');
  assert.equal(first.writer_readiness,'REVALIDATION_REQUIRED');
  assert.equal(first.reservation,'PENDING_WRITER_VALIDATION');
  assert.equal(first.dispatch,'NOT_DISPATCHED_BY_MCP');
  assert.equal(again.idempotent,true);
  assert.notEqual(first.revision,again.revision,'unrelated Tower revisions remain evidence and do not change the per-test retry identity');
  assert.equal(submitted.length,2);
  assert.equal(submitted[0].stableId,submitted[1].stableId);
  assert.deepEqual(submitted[0].envelope,submitted[1].envelope);
  assert.equal(submitted[0].envelope.kind,'TEST_BATTERY');
  assert.equal(submitted[0].envelope.source,'MCP_EXECUTOR');
  assert.deepEqual(submitted[0].envelope.payload.tests[0],{test_id:value.id,recipe:'seed_bounds',params:{seed:17}});
  assert.ok(OPERATIONAL_TOOL_NAMES.includes(SCIENTIFIC_MUTATION));
  assert.ok(!MUTATIONS.includes(SCIENTIFIC_MUTATION));
});

test('blocked scientific request is not enqueued and the mutation stays Executor-only',async()=>{
  const tower=liveTower();
  const blocked=tower.files['entities/test/T-DEH26-007-FRACTAL-MICRO-NORMALIZATION.json'].value;
  blocked.owner_role='EXECUTOR';
  const state=operationalStateFromTower(tower,{body_verified:true,file_id:TOWER_ID});
  let submits=0;
  const service=createOperationalService({readState:async()=>state,submitIntent:async()=>{throw new Error('not used');},
    submitScientificRequest:async()=>{submits++;throw new Error('blocked requests must not reach the spool');}});
  const executor={authenticated:true,id:'2'.repeat(64),roles:['EXECUTOR']};
  const result=await service.call(SCIENTIFIC_MUTATION,{test_id:blocked.id},executor);
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.reason_code,'CANONICAL_TEST_NOT_READY');
  assert.equal(result.no_mutation,true);
  assert.equal(submits,0);
  await assert.rejects(()=>service.call(SCIENTIFIC_MUTATION,{test_id:blocked.id},
    {authenticated:true,id:'3'.repeat(64),roles:['CIENTISTA']}),/ROLE_FORBIDDEN/);
});

test('queued and dispatch-pending exact attempts prevent a second scientific request',async()=>{
  for(const status of ['QUEUED','DISPATCH_PENDING']){
    const tower=liveTower();
    const testRecord=tower.files['entities/test/T-DEH26-007-FRACTAL-MICRO-NORMALIZATION.json'].value;
    testRecord.status='READY';testRecord.owner_role='EXECUTOR';testRecord.recipe='seed_bounds';
    testRecord.recipe_params={seed:17};testRecord.prereg_hash='c'.repeat(64);
    testRecord.readiness={policy:'SCIENTIFIC_INTEGRITY_V1',eligible:true,reasons:[]};
    testRecord.battery_id='bat-active';testRecord.attempt_id='attempt-active';
    tower.files['evolution/batteries.json'].value.batteries=[{id:'bat-active',status,tests:[
      {test_id:testRecord.id,attempt_id:'attempt-active'}]}];
    const state=operationalStateFromTower(tower,{body_verified:true,file_id:TOWER_ID});
    let submits=0;
    const service=createOperationalService({readState:async()=>state,submitIntent:()=>{throw new Error('not used');},
      submitScientificRequest:()=>{submits++;throw new Error('active attempts must not be re-enqueued');}});
    const result=await service.call(SCIENTIFIC_MUTATION,{test_id:testRecord.id},
      {authenticated:true,id:'5'.repeat(64),roles:['EXECUTOR']});
    assert.equal(result.status,'BLOCKED');assert.equal(result.reason_code,'ACTIVE_CANONICAL_ATTEMPT_EXISTS');
    assert.equal(result.no_mutation,true);assert.equal(submits,0);
  }
});

test('terminal attempts leave broad discovery but remain available by exact test lookup',async()=>{
  const tower=liveTower();
  const testRecord=tower.files['entities/test/T-DEH26-007-FRACTAL-MICRO-NORMALIZATION.json'].value;
  testRecord.status='READY';testRecord.owner_role='EXECUTOR';testRecord.battery_id='bat-lifecycle';testRecord.attempt_id='attempt-lifecycle';
  tower.files['evolution/batteries.json'].value.batteries=[{id:'bat-lifecycle',status:'RUNNING',tests:[
    {test_id:testRecord.id,attempt_id:'attempt-lifecycle'}]}];
  const activeState=operationalStateFromTower(tower,{body_verified:true,file_id:TOWER_ID});
  const principal={authenticated:true,id:'7'.repeat(64),roles:['EXECUTOR']};
  const service=createOperationalService({readState:async()=>activeState,submitIntent:()=>{throw new Error('not used');},
    submitScientificRequest:()=>{throw new Error('not used');}});
  const active=await service.call('get_scientific_queue',{role:'EXECUTOR'},principal);
  assert.equal(active.tests[0].attempt.status,'RUNNING');
  testRecord.status='DONE';tower.files['evolution/batteries.json'].value.batteries[0].status='DONE';
  const doneState=operationalStateFromTower(tower,{body_verified:true,file_id:TOWER_ID});
  const doneService=createOperationalService({readState:async()=>doneState,submitIntent:()=>{throw new Error('not used');},
    submitScientificRequest:()=>{throw new Error('not used');}});
  const broad=await doneService.call('get_scientific_queue',{role:'EXECUTOR'},principal);
  assert.equal(broad.tests.length,0);
  const detail=await doneService.call('get_scientific_queue',{role:'EXECUTOR',test_id:testRecord.id},principal);
  assert.equal(detail.tests[0].status,'DONE');
  assert.deepEqual(detail.tests[0].attempt,{id:'bat-lifecycle',status:'DONE',attempt_id:'attempt-lifecycle'});
});

test('authenticated MCP registration exposes the queue mutation only to Executor principals',()=>{
  const namesFor=roles=>{
    const definitions=[];
    registerOperationalTools({registerTool:(name,definition)=>definitions.push({name,definition})},
      {service:{call:async()=>({})},principal:{authenticated:true,id:'4'.repeat(64),roles},z});
    return definitions;
  };
  const scientist=namesFor(['CIENTISTA']);
  assert.ok(!scientist.some(item=>item.name===SCIENTIFIC_MUTATION));
  const executor=namesFor(['EXECUTOR']);
  const tool=executor.find(item=>item.name===SCIENTIFIC_MUTATION);
  assert.ok(tool);
  assert.equal(tool.definition.annotations.readOnlyHint,false);
  assert.deepEqual(tool.definition.inputSchema.parse({test_id:'T-READY-001'}),{test_id:'T-READY-001'});
  assert.throws(()=>tool.definition.inputSchema.parse({test_id:'T-READY-001',role:'CIENTISTA'}));
});

test('scientific queue cursors page all tests and recoveries and bind pages to role, principal, and revision',async()=>{
  const tower=liveTower();
  for(const path of Object.keys(tower.files))if(path.startsWith('entities/test/')||path.startsWith('entities/work/'))delete tower.files[path];
  const testIds=[...Array.from({length:205},(_,index)=>`T-READY-${String(index).padStart(3,'0')}`),
    'T-a-001','T.Z-001','T_A-001','T-0-001'];
  for(const [index,testId] of testIds.entries()){
    const suffix=String(index).padStart(3,'0'),workId=index<205?`WORK-RECOVERY-${suffix}`:`WORK-${testId.slice(2)}`;
    tower.files[`entities/test/${testId}.json`]={value:{entity_version:1,kind:'TEST',id:testId,domain:'SCIENCE',
      status:'READY',owner_role:'LEARNER',recipe:'seed_bounds',recipe_params:{seed:index},prereg_hash:'d'.repeat(64),
      readiness:{policy:'SCIENTIFIC_INTEGRITY_V1',eligible:true,reasons:[]}}};
    tower.files[`entities/work/${workId}.json`]={value:{entity_version:1,kind:'DEPENDENCY_RECOVERY',id:workId,domain:'SCIENCE',
      owner_role:'LEARNER',target_role:'LEARNER',status:'WAIT_DEPENDENCY',test_id:testId}};
  }
  const state=operationalStateFromTower(tower,{body_verified:true,file_id:TOWER_ID});
  let currentState=state;
  const service=createOperationalService({readState:async()=>currentState,submitIntent:()=>{throw new Error('not used');},
    submitScientificRequest:()=>{throw new Error('not used');}});
  const principal={authenticated:true,id:'6'.repeat(64),roles:['CIENTISTA']};
  let cursor,tests=[],recoveries=[];
  do{
    const page=await service.call('get_scientific_queue',{role:'CIENTISTA',limit:100,...(cursor?{cursor}:{})},principal);
    tests.push(...page.tests.map(item=>item.id));recoveries.push(...page.recoveries.map(item=>item.id));
    cursor=page.next_cursor;
  }while(cursor);
  assert.equal(tests.length,testIds.length);assert.equal(new Set(tests).size,testIds.length);
  assert.equal(recoveries.length,testIds.length);assert.equal(new Set(recoveries).size,testIds.length);
  assert.ok(tests.includes('T-READY-204'));assert.ok(recoveries.includes('WORK-RECOVERY-204'));
  for(const testId of ['T-a-001','T.Z-001','T_A-001','T-0-001'])assert.ok(tests.includes(testId));
  const first=await service.call('get_scientific_queue',{role:'CIENTISTA',limit:100},principal);
  currentState={...state,revision:'sha256:'+'b'.repeat(64)};
  await assert.rejects(()=>service.call('get_scientific_queue',{role:'CIENTISTA',limit:100,cursor:first.next_cursor},principal),
    /SCIENCE_CURSOR_STALE/);
});