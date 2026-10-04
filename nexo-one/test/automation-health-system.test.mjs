import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSystemState} from '../server/compiler/system-state.mjs';
import {projectAutomationHealthProviders} from '../server/compiler/automation-health.mjs';

const NOW='2026-09-10T10:00:00.000Z';
const NOW_MS=Date.parse(NOW);
const bus={fingerprint:'BUS-AUTO',generated_at:NOW,state:'LIVE',sources:[],envelopes:[]};
const automationHealth=[
  {automation:'NEXO Daily v0.1',last_checked:NOW,status:'ACTIVE_PROVIDER_CONFIRMED',readback:'PASS_PROVIDER_ENABLED_TRUE',last_run_status:'NO_OP'},
  {automation:'NEXO Core v0.1',last_checked:NOW,status:'ACTIVE_PROVIDER_CONFIRMED',readback:'PASS_PROVIDER_ENABLED_TRUE',last_run_status:'PASS'},
  {automation:'NEXO Executor v0.1',last_checked:NOW,status:'ACTIVE_PROVIDER_CONFIRMED',readback:'PASS_PROVIDER_ENABLED_TRUE',last_run_status:'PASS'},
  {automation:'NEXO Reconciler v0.1',last_checked:NOW,status:'ACTIVE_PROVIDER_CONFIRMED',readback:'PASS_PROVIDER_ENABLED_TRUE',last_run_status:'PASS'},
  {automation:'LEGACY_HEALTH_ROWS_RETIRED',last_checked:NOW,status:'RETIRED_MERGED',readback:'PASS_MARKED_RETIRED',last_run_status:'PASS_RETIRED'},
];

test('projects producer statuses while keeping provider health non-authoritative',()=>{
  const projected=projectAutomationHealthProviders(automationHealth,{now:NOW_MS});
  const world={generatedAt:NOW,providers:projected,truthGraph:{results:[]}};
  const state=buildSystemState({world,bus,systemInput:{},now:NOW});
  const automations=state.providers.filter(p=>p.id.startsWith('automation:'));
  assert.equal(automations.length,4);
  assert.deepEqual(automations.map(p=>p.label).sort(),automationHealth.slice(0,4).map(x=>x.automation).sort());
  assert.ok(automations.every(p=>p.state==='LIVE'));
  assert.ok(automations.every(p=>p.expected_for.includes('NEXO')));
  assert.ok(state.graph.nodes.filter(n=>n.id.startsWith('provider:automation:')).length===4);
  const daily=projected.find(p=>p.label==='NEXO Daily v0.1');
  assert.equal(daily.status,'AVAILABLE');
  assert.equal(daily.productivityState,'NOT_DEMONSTRATED');
  assert.match(daily.message,/execution=UNKNOWN \(NO_OP\)/);
});

test('INACTIVE is unavailable even with a passing readback and successful previous run',()=>{
  const projected=projectAutomationHealthProviders([{
    automation:'NEXO Executor v0.1',last_checked:NOW,status:'INACTIVE',
    readback:'PASS_PROVIDER_ENABLED_TRUE',last_run_status:'SUCCESS',last_run_at:NOW,
  }],{now:NOW_MS});
  assert.equal(projected[0].status,'UNAVAILABLE');
  const state=buildSystemState({world:{generatedAt:NOW,providers:projected,truthGraph:{results:[]}},bus,systemInput:{},now:NOW});
  assert.notEqual(state.providers.find(p=>p.id===projected[0].id).state,'LIVE');
});

test('unknown status/readback combinations fail closed instead of matching substrings',()=>{
  const projected=projectAutomationHealthProviders([
    {automation:'NEXO Executor v0.1',last_checked:NOW,status:'SUPERACTIVE',readback:'PASS_PROVIDER_ENABLED_TRUE'},
    {automation:'NEXO Reconciler v0.1',last_checked:NOW,status:'ACTIVE_PROVIDER_CONFIRMED',readback:'NOT_PASS_PROVIDER_ENABLED_TRUE'},
    {automation:'NEXO Core v0.1',last_checked:NOW,status:'ACTIVE_PROVIDER_CONFIRMED',readback:'FAIL_PROVIDER'},
  ],{now:NOW_MS});
  assert.deepEqual(projected.map(p=>p.status),['UNAVAILABLE','UNKNOWN','UNAVAILABLE']);
});

test('stale config evidence is STALE and missing timestamps are UNKNOWN',()=>{
  const projected=projectAutomationHealthProviders([
    {automation:'NEXO Executor v0.1',last_checked:'2026-01-01T00:00:00Z',status:'ACTIVE_PROVIDER_CONFIRMED',readback:'PASS_PROVIDER_ENABLED_TRUE'},
    {automation:'NEXO Reconciler v0.1',status:'ACTIVE_PROVIDER_CONFIRMED',readback:'PASS_PROVIDER_ENABLED_TRUE'},
  ],{now:NOW_MS});
  assert.deepEqual(projected.map(p=>p.status),['STALE','UNKNOWN']);
  assert.ok(projected.every(p=>!p.lastSuccessAt));
});

test('a fresh execution failure degrades availability without treating NO_OP as productivity',()=>{
  const projected=projectAutomationHealthProviders([{
    automation:'NEXO Executor v0.1',last_checked:NOW,status:'ACTIVE_PROVIDER_CONFIRMED',
    readback:'PASS_PROVIDER_ENABLED_TRUE',last_run_status:'FAILED',last_run_at:NOW,
  }],{now:NOW_MS});
  assert.equal(projected[0].status,'UNAVAILABLE');
  assert.equal(projected[0].executionState,'FAILED');
  assert.equal(projected[0].productivityState,'NO_PRODUCTIVE_OUTPUT');
});
