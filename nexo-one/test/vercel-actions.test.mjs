import test from 'node:test';
import assert from 'node:assert/strict';
import {executeVercel,readbackVercel} from '../server/adapters/vercel-actions.mjs';

const env={VERCEL_PROJECT_ID:'prj_nexo',VERCEL_PROJECT_NAME:'nexo-one',VERCEL_TEAM_ID:'team_x',VERCEL_READ_TOKEN:'read',VERCEL_WRITE_TOKEN:'write'};

test('deployment is pinned to the configured project',async()=>{
  let call;const requester=async(url,options)=>{call={url,options};return {id:'dpl_1',url:'nexo-preview.vercel.app',readyState:'QUEUED',meta:{githubCommitSha:'abc'}};};
  const effect=await executeVercel({action_type:'vercel.deploy',target_ref:'prj_nexo',requested_payload:{deployment_id:'dpl_source',source_revision:'abc'}},{env,requester});
  assert.match(call.url,/\/v13\/deployments\?teamId=team_x$/);
  assert.equal(call.options.token,'write');
  assert.equal(effect.effect_id,'dpl_1');
  assert.equal(effect.expected.source_revision,'abc');
});

test('write action does not fall back to read credential',async()=>{
  await assert.rejects(
    ()=>executeVercel({action_type:'vercel.deploy',target_ref:'prj_nexo',requested_payload:{deployment_id:'dpl_source',source_revision:'abc'}},{env:{...env,VERCEL_WRITE_TOKEN:''},requester:async()=>({id:'should-not-run'})}),
    error=>error.code==='AUTH_REQUIRED'
  );
});

test('deployment and promotion require approved source revision',async()=>{
  for(const action_type of ['vercel.deploy','vercel.promote']){
    await assert.rejects(
      ()=>executeVercel({action_type,target_ref:'prj_nexo',requested_payload:{deployment_id:'dpl_source'}},{env,requester:async()=>({id:'dpl_1'})}),
      error=>error.code==='TARGET_AMBIGUOUS'
    );
  }
});

test('foreign project target is rejected',async()=>{
  await assert.rejects(()=>executeVercel({action_type:'vercel.deploy',target_ref:'prj_other',requested_payload:{deployment_id:'dpl_source',source_revision:'abc'}},{env,requester:async()=>({})}),e=>e.code==='AUTHORITY_CONFLICT');
});

test('promotion uses existing project and deployment',async()=>{
  let call;const requester=async(url,options)=>{call={url,options};return {};};
  const effect=await executeVercel({action_type:'vercel.promote',target_ref:'prj_nexo',requested_payload:{deployment_id:'dpl_1',source_revision:'abc'}},{env,requester});
  assert.match(call.url,/\/v10\/projects\/prj_nexo\/promote\/dpl_1\?teamId=team_x$/);
  assert.equal(effect.effect_id,'dpl_1');
});

test('READY deployment with expected revision is PASS',async()=>{
  const requester=async()=>({id:'dpl_1',readyState:'READY',target:'production',url:'nexo.vercel.app',meta:{githubCommitSha:'abc'}});
  const result=await readbackVercel({action_type:'vercel.deploy',provider_effect_id:'dpl_1',expected:{source_revision:'abc'}},{env,requester});
  assert.equal(result.status,'PASS');
});

test('READY deployment without observable revision stays pending, never PASS',async()=>{
  const requester=async()=>({id:'dpl_1',readyState:'READY',target:'production',url:'nexo.vercel.app',meta:{}});
  const result=await readbackVercel({action_type:'vercel.deploy',provider_effect_id:'dpl_1',expected:{source_revision:'abc'}},{env,requester});
  assert.equal(result.status,'PENDING_READBACK');
  assert.equal(result.readback_status,'PENDING');
});

test('READY deployment with wrong revision is material CONFLICT',async()=>{
  const requester=async()=>({id:'dpl_1',readyState:'READY',target:'production',url:'nexo.vercel.app',meta:{githubCommitSha:'wrong'}});
  const result=await readbackVercel({action_type:'vercel.promote',provider_effect_id:'dpl_1',expected:{source_revision:'abc'}},{env,requester});
  assert.equal(result.status,'CONFLICT');
  assert.equal(result.material,true);
});
