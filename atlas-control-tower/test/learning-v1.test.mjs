import test from 'node:test';
import assert from 'node:assert/strict';
import {relationView,emergentLearning} from '../lib/learning.mjs';

const node=(id,subtype,status,metadata={})=>({id,type:'LEARNING_RELATION',subtype,label:id,status,metadata});

test('learning_v1 native counters are surfaced without synthesising scores',()=>{
  const v=relationView(node('P1','PATTERN','CANDIDATE',{supporting_count:3,contradicting_count:1,prospective_success_count:2,prospective_failure_count:0}));
  assert.equal(v.support,3);
  assert.equal(v.contradiction,1);
  assert.equal(v.successes,2);
  assert.equal(v.failures,0);
});

test('explicit observations appear as new emergent evidence even when outcome status is PASS_NO_OP',()=>{
  const buckets=emergentLearning([
    node('O1','OBSERVATION','PASS_NO_OP'),
    node('P1','PATTERN','CANDIDATE',{supporting_count:3,contradicting_count:0})
  ]);
  assert.equal(buckets.find(b=>b.id==='new').count,1);
  assert.equal(buckets.find(b=>b.id==='strengthening').count,1);
});
