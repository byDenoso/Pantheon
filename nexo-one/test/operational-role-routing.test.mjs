import test from 'node:test';
import assert from 'node:assert/strict';
import {createOperationalService} from '../server/mcp/operational-tools.mjs';

const principal=roles=>({id:'a'.repeat(64),authenticated:true,roles});
function fixture(){
  const recovery=(id,owner_role,target_role,status='WAIT_DEPENDENCY')=>({
    id:`WORK::${id}`,test_id:`TEST-${id}`,kind:'DEPENDENCY_RECOVERY',owner_role,target_role,status,version:2});
  const recoveryRows=[recovery('ENGINEERING','ADVISOR','ADVISOR'),
    recovery('INCOMING-SCIENCE','ADVISOR','LEARNER'),recovery('SCIENCE','LEARNER','LEARNER'),
    recovery('INCOMING-EXECUTOR','ADVISOR','EXECUTOR'),recovery('CLOSED','ADVISOR','ADVISOR','DONE')];
  return {authority:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',readback:'PASS',revision:'revision-1',work:[],
    science:{recovery:recoveryRows,batteries:[],tests:recoveryRows.map(row=>({
      id:row.test_id,status:'BLOCKED_INPUT',domain:'SCIENCE',version:1,
      readiness:{verified:true,eligible:false,policy:'SCIENTIFIC_INTEGRITY_V1',reasons:['RECIPE_BINDING_MISSING']}}))}};
}
function harness(state=fixture()){
  let writes=0;
  const service=createOperationalService({readState:async()=>state,
    submitIntent:async()=>{writes++;throw new Error('UNEXPECTED_WRITE');},
    submitScientificRequest:async()=>{writes++;throw new Error('UNEXPECTED_WRITE');}});
  return {state,service,writes:()=>writes,queue:(role,args={})=>
    service.call('get_scientific_queue',{role,...args},principal([role]))};
}

test('Engineer discovers canonical ADVISOR recovery work',async()=>{
  const h=harness(),q=await h.queue('ENGENHEIRO');
  assert(q.recoveries.some(row=>row.id==='WORK::ENGINEERING'));
  assert.equal(h.writes(),0);
});
test('Scientist receives LEARNER work rather than unrelated engineering',async()=>{
  const q=await harness().queue('CIENTISTA');
  assert.deepEqual(q.recoveries.map(row=>row.id),['WORK::INCOMING-SCIENCE','WORK::SCIENCE']);
});
test('Incoming recipient can prepare before ACK without changing current ownership',async()=>{
  const h=harness(),before=JSON.stringify(h.state),q=await h.queue('CIENTISTA');
  const row=q.recoveries.find(item=>item.id==='WORK::INCOMING-SCIENCE');
  assert.equal(row?.owner_role,'ADVISOR');assert.equal(row.target_role,'LEARNER');
  assert.equal(JSON.stringify(h.state),before);assert.equal(h.writes(),0);
});
test('Executor sees its incoming handoff despite a different current owner',async()=>{
  const q=await harness().queue('EXECUTOR');
  assert(q.recoveries.some(row=>row.id==='WORK::INCOMING-EXECUTOR'));
});
test('Closed recovery does not consume an active queue page',async()=>{
  const q=await harness().queue('ENGENHEIRO');
  assert(!q.recoveries.some(row=>row.id==='WORK::CLOSED'));
  assert(!q.tests.some(row=>row.id==='TEST-CLOSED'));
});
test('Closed history remains addressable by its exact test ID',async()=>{
  const q=await harness().queue('ENGENHEIRO',{test_id:'TEST-CLOSED'});
  assert.equal(q.recoveries[0]?.status,'DONE');assert.equal(q.next_cursor,null);
});
test('Paginated incoming queue loses or duplicates no records',async()=>{
  const h=harness(),seen=[],tests=[];let cursor;
  do{
    const q=await h.queue('CIENTISTA',{limit:1,...(cursor?{cursor}:{})});
    seen.push(...q.recoveries.map(x=>x.id));tests.push(...q.tests.map(x=>x.id));cursor=q.next_cursor;
  }while(cursor);
  assert.deepEqual(seen,['WORK::INCOMING-SCIENCE','WORK::SCIENCE']);
  assert.equal(new Set(tests).size,tests.length);
});
test('Capability binding advertises the same canonical roles as the queue',async()=>{
  const h=harness();
  for(const [role,owner] of [['ENGENHEIRO','ADVISOR'],['CIENTISTA','LEARNER']]){
    const c=await h.service.call('get_role_capabilities',{role},principal([role]));
    assert(c.scientific_queue.owner_role_binding.includes(owner));
  }
});
test('Unauthenticated and cross-role queue reads are still rejected',async()=>{
  const h=harness();
  await assert.rejects(h.service.call('get_scientific_queue',{role:'ENGENHEIRO'},null),{code:'AUTHENTICATION_REQUIRED'});
  await assert.rejects(h.service.call('get_scientific_queue',{role:'ENGENHEIRO'},principal(['CIENTISTA'])),{code:'ROLE_FORBIDDEN'});
});
test('A cursor cannot cross roles, principals, or Tower revisions',async()=>{
  const h=harness(),q=await h.queue('CIENTISTA',{limit:1});assert(q.next_cursor);
  await assert.rejects(h.queue('ENGENHEIRO',{cursor:q.next_cursor}),{code:'SCIENCE_CURSOR_SCOPE_MISMATCH'});
  await assert.rejects(h.service.call('get_scientific_queue',{role:'CIENTISTA',cursor:q.next_cursor},
    {...principal(['CIENTISTA']),id:'b'.repeat(64)}),{code:'SCIENCE_CURSOR_SCOPE_MISMATCH'});
  h.state.revision='revision-2';
  await assert.rejects(h.queue('CIENTISTA',{cursor:q.next_cursor}),{code:'SCIENCE_CURSOR_STALE'});
});
test('Visibility never makes a blocked incoming test executable',async()=>{
  const h=harness();
  const r=await h.service.call('request_scientific_execution',{test_id:'TEST-INCOMING-EXECUTOR'},principal(['EXECUTOR']));
  assert.equal(r.status,'BLOCKED');assert.equal(r.reason_code,'CANONICAL_TEST_NOT_READY');
  assert.equal(r.no_mutation,true);assert.equal(h.writes(),0);
});
test('Scientist cannot dispatch by exploiting incoming visibility',async()=>{
  const h=harness();
  await assert.rejects(h.service.call('request_scientific_execution',{test_id:'TEST-INCOMING-SCIENCE'},principal(['CIENTISTA'])),{code:'ROLE_FORBIDDEN'});
  assert.equal(h.writes(),0);
});

test('Intermediate RESULT work is not mistaken for a closed delivery',async()=>{
  const h=harness();
  h.state.science.recovery.push({id:'WORK::RESULT',test_id:'TEST-RESULT',kind:'ACTION',owner_role:'EXECUTOR',status:'RESULT'});
  const q=await h.queue('EXECUTOR');
  assert(q.recoveries.some(row=>row.id==='WORK::RESULT'));
});

for(const name of ['get_role_session','get_work']){
  test(`${name} includes real scientific work even without an operational canary`,async()=>{
    const state=fixture();let reads=0;
    const service=createOperationalService({readState:async()=>{reads++;return state;},
      submitIntent:async()=>assert.fail('unexpected mutation'),submitScientificRequest:async()=>assert.fail('unexpected mutation')});
    const result=await service.call(name,{role:'CIENTISTA'},principal(['CIENTISTA']));
    assert.deepEqual(result.available,[]);
    assert.equal(result.scientific_queue.total_recoveries,2);
    assert.equal(result.scientific_queue.next_tool,'get_scientific_queue');
    assert.equal(reads,1);
  });
}
