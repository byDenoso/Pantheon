import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

import {readPublicSystemInput} from '../server/compiler/public-system-input.mjs';

async function projection(actions) {
  const dir = await mkdtemp(join(tmpdir(), 'nexo-public-input-'));
  const file = join(dir, 'projection.json');
  await writeFile(file, JSON.stringify({actions, learning:[], crossDomain:[]}), 'utf8');
  return readPublicSystemInput({url:pathToFileURL(file)});
}

test('generic OPEN action does not become a human gate', async()=>{
  const actionId='SYSTEM_FIX_REQUIRED::EXECUTOR_STARVATION::OLY-SELCHANGE-T01-R2';
  const state=await projection([{
    id:actionId,
    status:'OPEN',
    title:'Executor starvation on abstract longitudinal-method validation',
    summary:'System recovery only',
    updatedAt:'2026-09-18T21:56:00Z'
  }]);
  assert.equal(state.actions.length,1);
  assert.equal(state.actions[0].action_id,actionId);
  assert.equal(state.sideQuests.length,0);
});

test('explicit human-required projection still enters Human Inbox input', async()=>{
  const state=await projection([{
    id:'HUMAN-ACTION-1',
    status:'OPEN',
    humanRequired:true,
    title:'Choose frozen option',
    summary:'Human decision is explicit',
    updatedAt:'2026-09-18T21:56:00Z'
  }]);
  assert.equal(state.sideQuests.length,1);
  assert.equal(state.sideQuests[0].parent_action_id,'HUMAN-ACTION-1');
  assert.equal(state.sideQuests[0].type,'HUMAN');
});
