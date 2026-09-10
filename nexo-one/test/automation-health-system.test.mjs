import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSystemState} from '../server/compiler/system-state.mjs';

const NOW='2026-09-10T10:00:00.000Z';
const world={generatedAt:NOW,providers:[],truthGraph:{results:[]}};
const bus={fingerprint:'BUS-AUTO',generated_at:NOW,state:'LIVE',sources:[],envelopes:[]};
const automationHealth=[
  {automation:'NEXO Daily v0.1',last_checked:NOW,status:'ACTIVE_PROVIDER_CONFIRMED',readback:'PASS_PROVIDER_ENABLED_TRUE',last_run_status:'NO_OP'},
  {automation:'NEXO Core v0.1',last_checked:NOW,status:'ACTIVE_PROVIDER_CONFIRMED',readback:'PASS_PROVIDER_ENABLED_TRUE',last_run_status:'PASS'},
  {automation:'NEXO Executor v0.1',last_checked:NOW,status:'ACTIVE_PROVIDER_CONFIRMED',readback:'PASS_PROVIDER_ENABLED_TRUE',last_run_status:'PASS'},
  {automation:'NEXO Reconciler v0.1',last_checked:NOW,status:'ACTIVE_PROVIDER_CONFIRMED',readback:'PASS_PROVIDER_ENABLED_TRUE',last_run_status:'PASS'},
];

test('projeta exatamente o health canônico das quatro automações sem tratá-las como Truth Owner',()=>{
  const state=buildSystemState({world,bus,systemInput:{automationHealth},now:NOW});
  const automations=state.providers.filter(p=>p.id.startsWith('automation:'));
  assert.equal(automations.length,4);
  assert.deepEqual(automations.map(p=>p.label).sort(),automationHealth.map(x=>x.automation).sort());
  assert.ok(automations.every(p=>p.state==='LIVE'));
  assert.ok(automations.every(p=>p.expected_for.includes('NEXO')));
  assert.ok(state.graph.nodes.filter(n=>n.id.startsWith('provider:automation:')).length===4);
});
