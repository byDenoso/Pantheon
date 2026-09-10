import test from 'node:test';
import assert from 'node:assert/strict';
import {executeGitHub,readbackGitHub} from '../server/adapters/github-actions.mjs';

const env={GITHUB_REPOSITORY:'byDenoso/Pantheon',GITHUB_TOKEN:'t'};

test('issue create is pinned to configured repository',async()=>{
  let call;const requester=async(url,options)=>{call={url,options};return {number:41,id:9,html_url:'https://github.com/byDenoso/Pantheon/issues/41',updated_at:'2026-09-10T12:00:00Z'};};
  const effect=await executeGitHub({action_type:'github.issue.create',target_ref:'byDenoso/Pantheon',requested_payload:{title:'Canary',body:'x'}},{env,requester});
  assert.match(call.url,/repos\/byDenoso\/Pantheon\/issues$/);
  assert.equal(effect.effect_id,'issue:41');
});

test('foreign repository target is rejected',async()=>{
  await assert.rejects(()=>executeGitHub({action_type:'github.issue.create',target_ref:'someone/else',requested_payload:{title:'x'}},{env,requester:async()=>({})}),e=>e.code==='AUTHORITY_CONFLICT');
});

test('merge requires explicit PR number',async()=>{
  await assert.rejects(()=>executeGitHub({action_type:'github.merge',target_ref:'byDenoso/Pantheon',requested_payload:{}},{env,requester:async()=>({})}),e=>e.code==='TARGET_AMBIGUOUS');
});

test('matching issue readback is PASS',async()=>{
  const requester=async()=>({number:41,title:'Canary',state:'open',updated_at:'2026-09-10T12:01:00Z',html_url:'https://github.com/byDenoso/Pantheon/issues/41'});
  const result=await readbackGitHub({action_type:'github.issue.create',provider_effect_id:'issue:41',expected:{title:'Canary'}},{env,requester});
  assert.equal(result.status,'PASS');
  assert.equal(result.readback_status,'MATCH');
});

test('commit readback SHA mismatch is FAILED',async()=>{
  const requester=async()=>({sha:'def456',html_url:'https://github.com/byDenoso/Pantheon/commit/def456'});
  const result=await readbackGitHub({action_type:'github.pr.create',provider_effect_id:'commit:abc123',expected:{sha:'abc123'}},{env,requester});
  assert.equal(result.status,'FAILED');
});
