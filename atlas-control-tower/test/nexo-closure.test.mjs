import test from 'node:test';import assert from 'node:assert/strict';import {createClosureSurface,classifyDependency} from '../lib/nexo-closure.mjs';
function gateway(seed){
 const store=new Map(Object.entries(seed||{})),writes=[];
 return {
  writes,
  async readEntity(kind,id){return kind==='work'?store.get(id)||null:null;},
  async readActiveWorkIndex(){return {work:[...store.values()]};},
  async submitTowerMutation(req){writes.push(req);const current=store.get(req.entity_name);store.set(req.entity_name,{...current,...req.changes,entity_version:Number(current.entity_version||0)+1});return {status:'COMPLETE',receipt:{accepted:true}};}
 };
}
test('dependency classifier keeps external transient separate from human auth',()=>{
 assert.equal(classifyDependency({blocker_type:'RATE_LIMIT'}).dependency_class,'EXTERNAL_TRANSIENT');
 assert.equal(classifyDependency({blocker_type:'OAUTH AUTH_REQUIRED'}).human_action_required,true);
});
test('reconcile resumes WAIT_DEPENDENCY only after all canonical deps are terminal-success',async()=>{
 const g=gateway({'W':{id:'W',entity_version:2,status:'WAIT_DEPENDENCY',owner_role:'EXECUTOR',dependency_ids:['D1']},'D1':{id:'D1',entity_version:1,status:'DONE'}});
 const out=await createClosureSurface({towerGateway:g}).reconcileWork({work_id:'W',correlation_id:'C'});
 assert.equal(out.transition,'RESUME');assert.equal(out.result.readback.status,'READY');assert.equal(g.writes.length,1);
});
test('reconcile never auto-resumes human authorization dependency',async()=>{
 const g=gateway({'W':{id:'W',entity_version:2,status:'WAIT_DEPENDENCY',owner_role:'EXECUTOR',dependency_ids:['D1'],blocker_type:'AUTH_REQUIRED'},'D1':{id:'D1',entity_version:1,status:'DONE'}});
 const out=await createClosureSurface({towerGateway:g}).reconcileWork({work_id:'W',correlation_id:'C'});
 assert.equal(out.transition,'NO_TRANSITION');assert.equal(out.reason,'HUMAN_INTERVENTION_REQUIRED');assert.equal(g.writes.length,0);
});
test('checkpoint closes only when explicit closure_ready is true',async()=>{
 const g=gateway({'W':{id:'W',entity_version:1,status:'CHECKPOINTED',closure_ready:true}});
 const out=await createClosureSurface({towerGateway:g}).reconcileWork({work_id:'W',correlation_id:'C'});
 assert.equal(out.transition,'COMPLETE');assert.equal(out.result.readback.status,'DONE');
});
