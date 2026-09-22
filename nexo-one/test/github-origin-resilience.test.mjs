import test from 'node:test';
import assert from 'node:assert/strict';

import {readGithubAuthority,_internal as authorityInternal} from '../../atlas-control-tower/lib/github-authority.mjs';
import {_resilience as runtimeResilience} from '../../atlas-control-tower/lib/github-canonical-runtime.mjs';

const authority={
  contract:'NEXO_ATLAS_AUTHORITY_V2',
  authority:'TOWER_V06',
  truthOwner:'byDenoso/NEXO-Obsidian-Vault@main:TOWER_V06',
  repository:'byDenoso/NEXO-Obsidian-Vault',
  ref:'main',
  controlPath:'TOWER_V06/CONTROL.json',
  projection:{role:'READ_ONLY_PROJECTION',kind:'TOWER_V3_SANITIZED_SOURCE',repository:'byDenoso/NEXO-Obsidian-Vault',ref:'main',transportPath:'TOWER_V06/snapshot/atlas-public.json'},
};

test('GitHub authority retries API 404 through Raw before failing',async()=>{
  const calls=[];
  const fetcher=async url=>{
    calls.push(String(url));
    if(String(url).includes('api.github.com'))return new Response('{}',{status:404});
    if(String(url).includes('raw.githubusercontent.com'))return new Response(JSON.stringify(authority),{status:200,headers:{'content-type':'application/json'}});
    throw new Error('unexpected '+url);
  };
  const value=await readGithubAuthority({fetcher,sleep:async()=>{}});
  assert.equal(value.contract,'NEXO_ATLAS_AUTHORITY_V2');
  assert.equal(calls.length,2);
  assert.match(calls[0],/api\.github\.com/);
  assert.match(calls[1],/raw\.githubusercontent\.com/);
});

test('GitHub resilience policy retries transient 404 and bounds stale cache',()=>{
  assert.equal(authorityInternal.retryable(404),true);
  assert.deepEqual(authorityInternal.RETRY_DELAYS_MS,[0,800,2400,6000]);
  assert.equal(runtimeResilience.TTL,60000);
  assert.equal(runtimeResilience.STALE_MAX_AGE_MS,30*60*1000);
  assert.deepEqual(runtimeResilience.RETRY_DELAYS_MS,[0,800,2400,6000]);
  assert.equal(runtimeResilience.retryable(404),true);
});
