import test from 'node:test';
import assert from 'node:assert/strict';
import {cockpitAutomationRuns,enhanceCockpitRoute} from '../lib/cockpit-projection.mjs';

const snapshot={
 access:'PUBLIC_SANITIZED',authority:'GOOGLE_DRIVE',projectionOnly:true,fingerprint:'sha256:test',sourceModifiedAt:'2026-09-12T03:00:00Z',
 sections:{
  SYSTEM:[
   {system_id:'roles',key:'AUTOMATION_ROLES',value:'DAILY|ADVISOR|EXECUTOR|LEARNER|EMERGENT',status:'ACTIVE',updated_at:'2026-09-12T02:00:00Z'},
   {system_id:'runtime',key:'RUNTIME_STATUS',value:'PASS',status:'PASS',updated_at:'2026-09-12T02:00:00Z'}
  ],
  EVENTS:[
   {event_id:'e1',timestamp:'2026-09-12T03:05:00Z',event_type:'EXECUTION_RUN',source_role:'EXECUTOR',state_to:'PASS',result:'PASS | READBACK_VERIFIED'},
   {event_id:'e2',timestamp:'2026-09-12T03:20:00Z',event_type:'LEARNING',source_role:'LEARNER',state_to:'PASS',result:'PASS'}
  ],WORK:[],THREADS:[],KNOWLEDGE:[],DECISIONS:[]
 },projections:{}
};

test('cockpit automation projection returns the five canonical roles',()=>{
 const runs=cockpitAutomationRuns(snapshot);
 assert.equal(runs.length,5);
 const executor=runs.find(run=>run.id==='automation:EXECUTOR');
 assert.equal(executor.updatedAt,'2026-09-12T03:05:00Z');
 assert.equal(executor.metadata.source,'CANONICAL_SSOT');
 assert.equal(executor.metadata.readback_verified,true);
});

test('root graph adds operations and hides Olympus on public sanitized access',()=>{
 const projected={source:'drive',freshness:'LIVE',nodes:[{id:'system:NEXO',type:'SYSTEM'},{id:'system:SCIENCE',type:'SYSTEM'},{id:'system:OLYMPUS',type:'SYSTEM'}],edges:[{source:'system:NEXO',target:'system:SCIENCE',type:'CONTAINS'},{source:'system:NEXO',target:'system:OLYMPUS',type:'CONTAINS'}]};
 const result=enhanceCockpitRoute(snapshot,'graph',{focus:'system:NEXO'},projected);
 assert.ok(result.nodes.some(node=>node.id==='system:OPERATIONS'));
 assert.ok(!result.nodes.some(node=>node.id==='system:OLYMPUS'));
 assert.ok(result.edges.some(edge=>edge.target==='system:OPERATIONS'));
});

test('operations graph exposes drill-down domains and timestamped events',()=>{
 const root=enhanceCockpitRoute(snapshot,'graph',{focus:'system:OPERATIONS'},{source:'drive',freshness:'LIVE'});
 assert.ok(root.nodes.some(node=>node.id==='domain:AUTOMATIONS'));
 assert.ok(root.nodes.some(node=>node.id==='domain:EVENTS'));
 assert.ok(root.nodes.some(node=>node.id==='domain:SYSTEM'));
 const ops=enhanceCockpitRoute(snapshot,'ops',{},{});
 assert.equal(ops.counts.runs,5);
 assert.equal(ops.events[0].updatedAt,'2026-09-12T03:20:00Z');
});
