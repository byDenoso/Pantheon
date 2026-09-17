import test from 'node:test';
import assert from 'node:assert/strict';
import {personalExecutionPolicy,PERSONAL_CAPABILITY_IDS} from '../server/personal/service.mjs';

const capability=(id,{status='PASS',risk='LOW'}={})=>({capability_id:id,status,risk});

test('LOW PASS capability with an executable adapter is autonomous',()=>{
  const result=personalExecutionPolicy({
    proposal:{kind:'UPSERT_NEXO_TASK'},
    capabilities:[capability(PERSONAL_CAPABILITY_IDS.nexoTask)],
    adapters:{[PERSONAL_CAPABILITY_IDS.nexoTask]:{execute(){},readback(){}}}
  });
  assert.equal(result.policy,'AUTO');
});

test('MEDIUM and HIGH risk retain a human gate even after private auth',()=>{
  for(const risk of ['MEDIUM','HIGH']){
    const result=personalExecutionPolicy({
      proposal:{kind:'UPSERT_NEXO_TASK'},
      capabilities:[capability(PERSONAL_CAPABILITY_IDS.nexoTask,{risk})],
      adapters:{[PERSONAL_CAPABILITY_IDS.nexoTask]:{execute(){},readback(){}}}
    });
    assert.equal(result.policy,'APPROVAL_REQUIRED');
  }
});

test('non-PASS or missing readback path fails closed',()=>{
  for(const status of ['UNVERIFIED','UNKNOWN','BLOCKED']){
    const result=personalExecutionPolicy({proposal:{kind:'UPSERT_NEXO_TASK'},capabilities:[capability(PERSONAL_CAPABILITY_IDS.nexoTask,{status})],adapters:{[PERSONAL_CAPABILITY_IDS.nexoTask]:{execute(){},readback(){}}}});
    assert.equal(result.policy,'DENY');
  }
  const missingReadback=personalExecutionPolicy({proposal:{kind:'UPSERT_NEXO_TASK'},capabilities:[capability(PERSONAL_CAPABILITY_IDS.nexoTask)],adapters:{[PERSONAL_CAPABILITY_IDS.nexoTask]:{execute(){}}}});
  assert.equal(missingReadback.policy,'DENY');
});
