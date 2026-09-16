import test from 'node:test';
import assert from 'node:assert/strict';

import {createNexoSemanticGateway} from '../lib/nexo-semantic-gateway.mjs';

function fakeTower({mode='ACTIVE'}={}){
  const work=new Map(),mutations=[],dispatches=[];
  const tower={
    configured:{towerWrite:true,towerRepo:'byDenoso/NEXO-Obsidian-Vault',towerRef:'main'},
    async readControl(){return {mode,truth_owner:'TOWER_V06',write_model:'GITHUB_CAS_ENTITY_EVENT'}},
    async readEntity(kind,id){return kind==='work'?(work.get(id)||null):null},
    async readRoleView(role){return {role,queue:[...work.values()].filter(item=>item.owner_role===role&&item.status==='READY')}},
    async readReceipt(id){return {request_id:id,status:'COMPLETE'}},
    async readCapabilityManifest(){return {capabilities:{'CAP-X':{capability_id:'CAP-X',status:'PASS',backend:'SINGLE_RUNTIME'}}}},
    async readRuntimeReport(id){return {run_id:id,status:'VERIFIED'}},
    async readEvidence(id){return {evidence_id:id}},
    async readCampaignIndex(){return {campaigns:[]}},
    async readInterdomainIndex(){return {items:[]}},
    async submitTowerMutation(request){
      mutations.push(request);
      const before=work.get(request.entity_name)||{id:request.entity_name,entity_version:0};
      work.set(request.entity_name,{...before,...request.changes,id:request.entity_name,entity_version:Number(before.entity_version||0)+1});
      return {request_id:request.request_id,status:'COMPLETE',receipt:{accepted:true}};
    },
    async dispatchRuntime(payload){dispatches.push(payload);return {status:'ACCEPTED',...payload}},
  };
  return {tower,work,mutations,dispatches};
}

test('createWork matches the canonical Python generated WORK identity and returns exact readback',async()=>{
  const f=fakeTower(),gateway=createNexoSemanticGateway({towerGateway:f.tower});
  const result=await gateway.createWork({title:'Teste operacional',correlation_id:'CORR-1',domain:'SCIENCE'});
  assert.equal(result.work_id,'WORK-PLUGIN-9553DE9A0732CECD5717');
  assert.equal(f.mutations.length,1);
  assert.equal(f.mutations[0].entity_kind,'work');
  assert.equal(f.mutations[0].expected_version,0);
  assert.equal(f.mutations[0].event_type,'WORK_CREATED');
  assert.equal(f.mutations[0].changes.status,'READY');
  assert.equal(result.readback.id,result.work_id);
  assert.equal(result.readback.entity_version,1);
});

test('createWork blocks protected details exactly at the semantic boundary',async()=>{
  const f=fakeTower(),gateway=createNexoSemanticGateway({towerGateway:f.tower});
  await assert.rejects(()=>gateway.createWork({title:'W',correlation_id:'CORR-P',details:{truth_owners:['evil']}}),/PROTECTED_DETAIL_FIELD/);
  await assert.rejects(()=>gateway.createWork({title:'W',correlation_id:'CORR-P2',details:{title:'override'}}),/PROTECTED_DETAIL_FIELD/);
});

test('semantic mutations fail closed unless canonical CONTROL mode is ACTIVE',async()=>{
  const f=fakeTower({mode:'PAUSED'}),gateway=createNexoSemanticGateway({towerGateway:f.tower});
  await assert.rejects(()=>gateway.createWork({title:'W',correlation_id:'CORR-PAUSED'}),/TOWER_NOT_ACTIVE/);
  assert.equal(f.mutations.length,0);
});

test('canonical identifiers reject traversal and unsafe path material',async()=>{
  const f=fakeTower(),gateway=createNexoSemanticGateway({towerGateway:f.tower});
  await assert.rejects(()=>gateway.getWork('../../CONTROL'),/INVALID_IDENTIFIER/);
  await assert.rejects(()=>gateway.createWork({work_id:'../BAD',title:'W',correlation_id:'CORR-BAD'}),/INVALID_IDENTIFIER/);
});

test('transitionWork uses current entity_version and frozen command semantics',async()=>{
  const f=fakeTower(),gateway=createNexoSemanticGateway({towerGateway:f.tower});
  const created=await gateway.createWork({title:'W',correlation_id:'CORR-2'});
  const result=await gateway.transitionWork('start',{work_id:created.work_id,expected_version:1,writer_role:'EXECUTOR',correlation_id:'CORR-START'});
  const request=f.mutations.at(-1);
  assert.equal(request.expected_version,1);
  assert.equal(request.event_type,'WORK_STARTED');
  assert.equal(request.changes.status,'RUNNING');
  assert.equal(result.readback.status,'RUNNING');
});

test('runWork dispatches a stable NEXO runtime launch only for a declared PASS capability',async()=>{
  const f=fakeTower(),gateway=createNexoSemanticGateway({towerGateway:f.tower});
  const created=await gateway.createWork({title:'W',correlation_id:'CORR-3',details:{capability_id:'CAP-X'}});
  const result=await gateway.runWork({work_id:created.work_id,correlation_id:'CORR-RUN'});
  assert.equal(result.status,'ACCEPTED');
  assert.equal(result.capability_id,'CAP-X');
  assert.ok(result.run_id.startsWith('RUN-'));
  assert.equal(f.dispatches.length,1);
  assert.equal(f.dispatches[0].work_id,created.work_id);
});

test('runWork refuses caller-selected run_id',async()=>{
  const f=fakeTower(),gateway=createNexoSemanticGateway({towerGateway:f.tower});
  const created=await gateway.createWork({title:'W',correlation_id:'CORR-4',details:{capability_id:'CAP-X'}});
  await assert.rejects(()=>gateway.runWork({work_id:created.work_id,correlation_id:'CORR-RUN-4',run_id:'RUN-CHOSEN'}),/RUN_ID_CALLER_FORBIDDEN/);
  assert.equal(f.dispatches.length,0);
});
