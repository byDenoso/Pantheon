import test from 'node:test';
import assert from 'node:assert/strict';

import {observeHealthIssue,startHealthRepair,resolveHealthIssue,_internal} from '../lib/nexo-health.mjs';

function fakeGateway(){
  const work=new Map();
  return {
    async getWork(workId){const item=work.get(workId);if(!item)throw new Error('WORK_NOT_FOUND');return structuredClone(item)},
    async createWork(input){const id=input.work_id;const entity={id,entity_version:1,status:'READY',owner_role:'EXECUTOR',...input.details,title:input.title,kind:input.kind,priority:input.priority,domain:input.domain};work.set(id,entity);return {work_id:id,readback:structuredClone(entity)}},
    async transitionWork(command,input){const entity=work.get(input.work_id);if(!entity)throw new Error('WORK_NOT_FOUND');const details=input.details||{};let changes={...details};if(command==='start')changes={...changes,status:'RUNNING',owner_role:input.writer_role};if(command==='result')changes={...changes,status:input.outcome};if(command==='handoff')changes={...changes,owner_role:input.target_role};const next={...entity,...changes,entity_version:entity.entity_version+1};work.set(input.work_id,next);return {work_id:input.work_id,readback:structuredClone(next)}},
    async mutateWork({work,changes}){const next={...work,...changes,entity_version:Number(work.entity_version||0)+1};work=next;this._work.set(next.id,next);return {work_id:next.id,readback:structuredClone(next)}},
    _work:work,
  };
}
const issue={invariant_or_defect_code:'META_DUPLICATE',affected_entity_kind:'AUTOMATION',affected_entity_id:'META-A',root_cause_code:'SAME_EFFECT',severity:'P0',material_state:'unchanged',evidence_refs:['EV-1']};

test('health fingerprint is byte-for-byte compatible with the canonical Python implementation',()=>{
  assert.equal(_internal.fingerprint(issue),'A2D1635A54123B3691977B856EE23743DAADBE99B48F3CD5203F1092B009836A');
  assert.equal(_internal.workIdFor(_internal.fingerprint(issue)),'WORK-HEALTH-A2D1635A54123B369197');
});

test('same health fingerprint dedupes unchanged observations and reuses one work id',async()=>{
  const gateway=fakeGateway();
  const first=await observeHealthIssue(gateway,issue);
  const second=await observeHealthIssue(gateway,issue);
  assert.equal(first.status,'HEALTH_ISSUE_CREATED');
  assert.equal(second.status,'NO_OP_DUPLICATE_HEALTH_ISSUE');
  assert.equal(second.notify,false);
  assert.equal(second.work_id,first.work_id);
  assert.equal(first.readback.affected_entity_kind,'AUTOMATION');
  assert.equal(first.readback.affected_entity_id,'META-A');
  assert.equal(first.readback.invariant_or_defect_code,'META_DUPLICATE');
});

test('health repair progresses NEW -> REPAIRING -> RESOLVED and both terminal helpers are idempotent',async()=>{
  const gateway=fakeGateway();
  const first=await observeHealthIssue(gateway,issue);
  const repair=await startHealthRepair(gateway,{work_id:first.work_id,repair_action:'apply smallest safe fix'});
  assert.equal(repair.state,'REPAIRING');
  const repairAgain=await startHealthRepair(gateway,{work_id:first.work_id,repair_action:'apply smallest safe fix'});
  assert.equal(repairAgain.status,'NO_OP_ALREADY_REPAIRING');
  const resolved=await resolveHealthIssue(gateway,{work_id:first.work_id,resolution_summary:'fixed and verified',resolution_evidence_refs:['EV-FIX']});
  assert.equal(resolved.state,'RESOLVED');
  assert.deepEqual(resolved.readback.resolution_evidence_refs,['EV-FIX']);
  const resolvedAgain=await resolveHealthIssue(gateway,{work_id:first.work_id,resolution_summary:'fixed and verified',resolution_evidence_refs:['EV-FIX']});
  assert.equal(resolvedAgain.status,'NO_OP_ALREADY_RESOLVED');
});

test('a resolved fingerprint recurring becomes REGRESSED under the same work identity',async()=>{
  const gateway=fakeGateway();
  const first=await observeHealthIssue(gateway,issue);
  await startHealthRepair(gateway,{work_id:first.work_id,repair_action:'fix'});
  await resolveHealthIssue(gateway,{work_id:first.work_id,resolution_summary:'done',resolution_evidence_refs:['EV-FIX']});
  const regressed=await observeHealthIssue(gateway,{...issue,material_state:'returned'});
  assert.equal(regressed.state,'REGRESSED');
  assert.equal(regressed.work_id,first.work_id);
  assert.equal(regressed.notify,true);
});

test('resolution requires evidence readback references',async()=>{
  const gateway=fakeGateway();
  const first=await observeHealthIssue(gateway,issue);
  await assert.rejects(()=>resolveHealthIssue(gateway,{work_id:first.work_id,resolution_summary:'done',resolution_evidence_refs:[]}),/RESOLUTION_EVIDENCE_REQUIRED/);
});
