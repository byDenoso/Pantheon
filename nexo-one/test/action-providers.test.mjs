import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveActionProvider} from '../server/execution/providers.mjs';

for(const provider of ['gmail','calendar','drive','nexo'])test(`${provider} resolves to Google action provider`,()=>{
  const p=resolveActionProvider(provider,{google:{execute:()=>{},readback:()=>{}}});assert.equal(typeof p.execute,'function');
});

test('github and vercel resolve explicitly',()=>{
  const p=resolveActionProvider('github',{github:{execute:()=>{},readback:()=>{}}});assert.equal(typeof p.readback,'function');
});

test('Atlas direct writes fail closed',async()=>{
  const p=resolveActionProvider('atlas');
  await assert.rejects(()=>p.execute({action_type:'atlas.write'}),e=>e.code==='CAPABILITY_BLOCKED');
});

test('unknown provider fails closed',()=>{
  assert.throws(()=>resolveActionProvider('mystery'),e=>e.code==='CAPABILITY_BLOCKED');
});
