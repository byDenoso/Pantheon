import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  authorizeRunnerKey,
  createRunnerBridge,
  deterministicRunId,
} from '../lib/durable-runner.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');

test('runner access key is verified by hash, never by plaintext config', () => {
  const expected = sha256('scheduled-secret');
  assert.equal(authorizeRunnerKey('scheduled-secret', expected), true);
  assert.equal(authorizeRunnerKey('wrong-secret', expected), false);
  assert.equal(authorizeRunnerKey('', expected), false);
});

test('effect keys deterministically map to stable UUIDs for idempotent receipts', () => {
  const a = deterministicRunId('executor:2026-09-08T03:36:00-03:00:science');
  const b = deterministicRunId('executor:2026-09-08T03:36:00-03:00:science');
  const c = deterministicRunId('executor:2026-09-08T03:36:00-03:00:engineering');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('receipt writes unverified, performs independent readback, then marks verified', async () => {
  const calls=[];
  let stored;
  const fetchImpl=async (url,opts={})=>{
    calls.push({url,opts});
    if(opts.method==='POST'){
      stored=JSON.parse(opts.body);
      assert.equal(stored.readback_verified,false);
      assert.equal(opts.headers.Authorization,'Bearer oidc');
      assert.equal(opts.headers['Content-Profile'],'nexo_ops');
      assert.match(opts.headers.Prefer,/resolution=merge-duplicates/);
      return {ok:true,status:201,json:async()=>[stored],text:async()=>''};
    }
    if(opts.method==='PATCH'){
      stored={...stored,...JSON.parse(opts.body)};
      return {ok:true,status:200,json:async()=>[stored],text:async()=>''};
    }
    assert.match(url,/\/execution_runs\?/);
    assert.match(url,/id=eq\./);
    assert.equal(opts.headers['Accept-Profile'],'nexo_ops');
    return {ok:true,status:200,json:async()=>stored?[stored]:[],text:async()=>''};
  };
  const bridge=createRunnerBridge({
    env:{VERCEL_OIDC_TOKEN:'oidc',NEXO_RUNNER_KEY_SHA256:sha256('scheduled-secret'),NEON_DATA_API_URL:'https://neon.example/rest/v1'},
    fetchImpl,
  });
  const input={
    accessKey:'scheduled-secret',
    effectKey:'executor:2026-09-08T03:36:00-03:00:science',
    loop:'NEXO Executor · 3 Lanes',lane:'SCIENCE',status:'SUCCESS',actionId:null,
    summary:'scheduled bridge canary',checkpoint:'TERMINAL',resumePointer:'',
    expectedOutcome:'receipt persisted',observedOutcome:'receipt persisted',
  };
  const result=await bridge.receipt(input);
  assert.equal(result.readbackVerified,true);
  assert.equal(result.id,deterministicRunId(input.effectKey));
  assert.equal(stored.readback_verified,true);
  assert.equal(stored.runtime_env,'NEXO_SCHEDULED_DURABLE_BRIDGE');
  assert.equal(stored.metadata.effect_key,input.effectKey);
  assert.equal(stored.metadata.loop,input.loop);
  assert.equal(stored.metadata.checkpoint,'TERMINAL');
  assert.equal(calls.length,4);

  const before=calls.length;
  const replay=await bridge.receipt(input);
  assert.equal(replay.id,result.id);
  assert.equal(replay.replay,true);
  assert.equal(calls.length,before+1,'replay must only read the existing deterministic receipt');
});

test('checkpoint is idempotent: identical effect_key becomes read-only replay', async () => {
  const calls=[];
  let stored;
  const fetchImpl=async (url,opts={})=>{
    calls.push({url,opts});
    if(opts.method==='POST'){
      stored=JSON.parse(opts.body);
      assert.match(url,/\/runtime_events$/);
      assert.equal(opts.headers['Content-Profile'],'nexo_ops');
      return {ok:true,status:201,json:async()=>[stored],text:async()=>''};
    }
    assert.match(url,/event_id=eq\./);
    return {ok:true,status:200,json:async()=>stored?[stored]:[],text:async()=>''};
  };
  const bridge=createRunnerBridge({
    env:{VERCEL_OIDC_TOKEN:'oidc',NEXO_RUNNER_KEY_SHA256:sha256('scheduled-secret'),NEON_DATA_API_URL:'https://neon.example/rest/v1'},
    fetchImpl,
  });
  const input={accessKey:'scheduled-secret',effectKey:'executor:e1',loop:'NEXO Executor · 3 Lanes',lane:'SCIENCE',step:'PERSIST',checkpoint:'WAITING_READBACK',resumePointer:'science:T-1',status:'CHECKPOINTED',summary:'resume later'};
  const result=await bridge.checkpoint(input);
  assert.equal(result.readbackVerified,true);
  assert.equal(stored.event_id,'BRIDGE::executor:e1');
  assert.equal(stored.event_type,'DURABLE_CHECKPOINT');
  assert.equal(stored.payload.resume_pointer,'science:T-1');
  assert.equal(stored.payload.checkpoint,'WAITING_READBACK');
  const occurredAt=stored.occurred_at;
  const before=calls.length;
  const replay=await bridge.checkpoint(input);
  assert.equal(replay.replay,true);
  assert.equal(stored.occurred_at,occurredAt,'replay must not rewrite checkpoint time');
  assert.equal(calls.length,before+1);
});

test('raw truth reads are allowlisted and preserve the source schema', async () => {
  let seen;
  const fetchImpl=async (url,opts={})=>{
    seen={url,opts};
    return {ok:true,status:200,json:async()=>[{entity_id:'T-1',status:'ACTIVE'}],text:async()=>''};
  };
  const bridge=createRunnerBridge({
    env:{VERCEL_OIDC_TOKEN:'oidc',NEXO_RUNNER_KEY_SHA256:sha256('scheduled-secret'),NEON_DATA_API_URL:'https://neon.example/rest/v1'},
    fetchImpl,
  });
  const result=await bridge.readTruth({accessKey:'scheduled-secret',surface:'science_entity',key:'T-1'});
  assert.equal(result.authority,'NEON_TRUTH_OWNER');
  assert.equal(result.schema,'science_v1');
  assert.equal(result.table,'entities');
  assert.equal(result.rows[0].entity_id,'T-1');
  assert.equal(seen.opts.headers['Accept-Profile'],'science_v1');
  assert.match(seen.url,/entity_id=eq\.T-1/);
  await assert.rejects(()=>bridge.readTruth({accessKey:'scheduled-secret',surface:'arbitrary_sql',key:'select *'}),/SURFACE_NOT_ALLOWED/);
});
