import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSystemState} from '../server/compiler/system-state.mjs';
import {projectAutomationHealthProviders} from '../server/compiler/automation-health.mjs';

const NOW='2026-09-10T10:00:00.000Z';
const bus={fingerprint:'BUS-AUTO',generated_at:NOW,state:'LIVE',sources:[],envelopes:[]};
const automationHealth=[
  {automation:'NEXO Daily v0.1',last_checked:NOW,status:'ACTIVE_PROVIDER_CONFIRMED',readback:'PASS_PROVIDER_ENABLED_TRUE',last_run_status:'NO_OP'},
  {automation:'NEXO Core v0.1',last_checked:NOW,status:'ACTIVE_PROVIDER_CONFIRMED',readback:'PASS_PROVIDER_ENABLED_TRUE',last_run_status:'PASS'},
  {automation:'NEXO Executor v0.1',last_checked:NOW,status:'ACTIVE_PROVIDER_CONFIRMED',readback:'PASS_PROVIDER_ENABLED_TRUE',last_run_status:'PASS'},
  {automation:'NEXO Reconciler v0.1',last_checked:NOW,status:'ACTIVE_PROVIDER_CONFIRMED',readback:'PASS_PROVIDER_ENABLED_TRUE',last_run_status:'PASS'},
  {automation:'LEGACY_HEALTH_ROWS_RETIRED',last_checked:NOW,status:'RETIRED_MERGED',readback:'PASS_MARKED_RETIRED',last_run_status:'PASS_RETIRED'},
];

test('projeta exatamente o health canônico das quatro automações sem tratar legado como runtime ativo',()=>{
  const projected=projectAutomationHealthProviders(automationHealth);
  const world={generatedAt:NOW,providers:projected,truthGraph:{results:[]}};
  const state=buildSystemState({world,bus,systemInput:{},now:NOW});
  const automations=state.providers.filter(p=>p.id.startsWith('automation:'));
  assert.equal(automations.length,4);
  assert.deepEqual(automations.map(p=>p.label).sort(),automationHealth.slice(0,4).map(x=>x.automation).sort());
  assert.ok(automations.every(p=>p.state==='LIVE'));
  assert.ok(automations.every(p=>p.expected_for.includes('NEXO')));
  assert.ok(state.graph.nodes.filter(n=>n.id.startsWith('provider:automation:')).length===4);
});

test('automação com readback falho nunca aparece LIVE',()=>{
  const projected=projectAutomationHealthProviders([{automation:'NEXO Executor v0.1',last_checked:NOW,status:'DEGRADED',readback:'FAIL_PROVIDER',last_run_status:'FAILED'}]);
  assert.equal(projected[0].status,'UNAVAILABLE');
  assert.match(projected[0].message,/FAIL_PROVIDER/);
});
