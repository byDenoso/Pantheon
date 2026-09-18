import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chooseExecutor} from './fallback-router.mjs';
import {runVercelFallbackShard} from './vercel-sandbox.mjs';

export const LIVE_CANARY_BRANCH='feat/nexo-vercel-failover-live-canary-v1';
export const LIVE_CANARY_ID='NEXO-VERCEL-FAILOVER-CANARY-V1';

function canonicalJson(value){
  if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export async function runLiveVercelFallbackCanary({env=process.env,fetchImpl=fetch}={}){
  if(env.VERCEL_GIT_COMMIT_REF!==LIVE_CANARY_BRANCH)throw new Error('LIVE_CANARY_BRANCH_ONLY');
  const commitSha=String(env.VERCEL_GIT_COMMIT_SHA||'');
  if(!/^[0-9a-f]{40}$/i.test(commitSha))throw new Error('LIVE_CANARY_COMMIT_MISSING');

  const route=chooseExecutor({mode:'auto',github:{available:false,remainingMinutes:null},estimatedMinutes:1,reserveMinutes:15});
  assert.deepEqual(route,{backend:'vercel_sandbox',reason:'GITHUB_UNAVAILABLE'});

  const contract={
    canary_id:LIVE_CANARY_ID,
    work_id:'WORK::NEXO-VERCEL-FAILOVER-CANARY-V1',
    gate_id:'EXECUTOR_ROUTING_V1',
    shard_id:'LIVE-CANARY-001',
    expected_backend:'vercel_sandbox',
    scientific_effect:'NONE',
    input_class:'SYNTHETIC_OPERATIONAL_CANARY',
  };
  const expectedResultHash=`sha256:${createHash('sha256').update(canonicalJson(contract)).digest('hex')}`;
  const receipt=await runVercelFallbackShard({
    job:{
      runId:`vercel-${env.VERCEL_DEPLOYMENT_ID||commitSha.slice(0,12)}`,
      workId:contract.work_id,
      gateId:contract.gate_id,
      shardId:contract.shard_id,
      commitSha,
      runner:'science/runtime/vercel_fallback_canary.py',
      contractBase64:Buffer.from(JSON.stringify(contract),'utf8').toString('base64'),
    },
    env,
    fetchImpl,
  });
  assert.equal(receipt.status,'COMPLETE');
  assert.equal(receipt.backend,'vercel_sandbox');
  assert.equal(receipt.validationStatus,'PASS');
  assert.equal(receipt.exitCode,0);
  assert.equal(receipt.resultHash,expectedResultHash);
  assert.match(receipt.sessionRef,/^sbx_/);

  return {schema_version:'1',canary_id:LIVE_CANARY_ID,router_decision:route,contract,contract_hash:expectedResultHash,receipt,commit_sha:commitSha};
}
