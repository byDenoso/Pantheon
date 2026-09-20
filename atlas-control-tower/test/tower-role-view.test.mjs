import test from 'node:test';import assert from 'node:assert/strict';import {deriveRoleView} from '../lib/tower-role-view.mjs';

test('executor queue derives live from active work and runnable capabilities',()=>{
 const view=deriveRoleView({role:'EXECUTOR',control:{role_queue_limit:5},activeWork:{work:[
  {id:'W1',status:'READY',owner_role:'EXECUTOR',priority:'HIGH',task_id:'x'},
  {id:'W2',status:'READY',owner_role:'EXECUTOR',priority:'CRITICAL',task_id:'missing'},
  {id:'W3',status:'DONE',owner_role:'EXECUTOR',task_id:'x'}
 ]},capabilities:{cap:{status:'ACTIVE',task_id:'x',backend:'nexo_runtime'}}});
 assert.deepEqual(view.queue.map(x=>x.id),['W1']);
 assert.equal(view.view_model,'DERIVED_LIVE_FROM_ACTIVE_WORK');
});
test('advisor and learner derive without stale bootstrap files',()=>{
 const activeWork={work:[
  {id:'A',status:'READY',owner_role:'ADVISOR',priority:'HIGH'},
  {id:'L',status:'VERIFIED',learning_state:'PENDING',priority:'MEDIUM'}
 ]};
 assert.deepEqual(deriveRoleView({role:'ADVISOR',activeWork}).queue.map(x=>x.id),['A']);
 assert.deepEqual(deriveRoleView({role:'LEARNER',activeWork}).queue.map(x=>x.id),['L']);
});
