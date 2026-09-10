import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSystemState} from '../server/compiler/system-state.mjs';

const NOW='2026-09-10T10:00:00.000Z';
const fresh={state:'LIVE',observedAt:'2026-09-10T09:59:00.000Z',expiresAt:'2026-09-10T10:09:00.000Z'};

function input(){
  return {
    world:{
      generatedAt:NOW,
      fingerprint:'WORLD-1',
      providers:[
        {id:'nexo',label:'NEXO',status:'AVAILABLE',lastSuccessAt:NOW,checkedAt:NOW,revision:'n1',partial:false,message:'ok'},
        {id:'github',label:'GitHub',status:'AVAILABLE',lastSuccessAt:NOW,checkedAt:NOW,revision:'g1',partial:false,message:'ok'},
      ],
      truthGraph:{
        fingerprint:'TRUTHGRAPH-1',checked_at:NOW,material_conflicts:[],results:[
          {domain:'OLYMPUS',status:'CONFLICT',source_ref:'ssot',fingerprint:'TG-O',checked_at:NOW,material:true,
           authority:{canonical_truth:'Drive/Olympus',operational_truth:'SSOT Olympus'},
           provider:{expected:'drive',actual:'nexo',status:'AVAILABLE'},capability:{state:'PASS',ids:['CAP-GDRIVE']},explanation:'authority drift'},
        ]
      }
    },
    bus:{
      contract:'ProjectionEnvelope/v1',bus:'Pantheon/UniversalProjectionBus',fingerprint:'BUS-1',generated_at:NOW,state:'LIVE',
      sources:[{id:'NEXO_SSOT',state:'LIVE',revision:'n1',count:1}],
      envelopes:[{entity_id:'truth:1',domain:'NEXO',authority_class:'CANONICAL',source_ref:'sheet',source_revision:'n1',fingerprint:'PRJ-1',freshness:{state:'LIVE',observed_at:NOW,expires_at:null,age_ms:0},derivation_rule:'nexo-ssot:item->projection',state:'LIVE',checked_at:NOW,projection_role:'NON_AUTHORITATIVE',payload:{title:'Estado NEXO',summary:'ok'}}]
    },
    systemInput:{
      actions:[{action_id:'ACT-1',domain:'ENGINEERING',action:'Read repository state',priority:'HIGH',status:'READY',authority:'L1',last_checked:NOW,next_action:'continue',evidence_pointer:'gh',fingerprint:'act-1',lease_owner:'',lease_until:'',write_token:''}],
      executionRuns:[{run_id:'RUN-1',automation:'NEXO Executor v0.1',runtime:'SCHEDULED_TASK',domain:'ENGINEERING',lane:'ENGINEERING',action_id:'ACT-1',started_at:NOW,ended_at:NOW,status:'SUCCESS',readback:'PASS',effect_key:'EFF-1',receipt_ref:'receipt',signals_observed:'required_operation=Repository metadata/read; capability_fingerprint=cap-read',tools_used:'CAP-GITHUB-SCHEDULED-READ',attempts:'1',outcome:'provider readback verified',context_fingerprint:'input-1',quality_gate_result:'PASS',risk_class:'L1_READ_ONLY',capability_refs:'CAP-GITHUB-SCHEDULED-READ'}],
      sideQuests:[{side_quest_id:'SQ-1',parent_action_id:'ACT-HUMAN',lane:'SCIENCE',type:'HUMAN',status:'WAITING',blocker:'Need frozen null choice',required_resolution:'Choose null',owner:'Dener',wake_condition:'human_response',created_at:NOW,fingerprint:'sq-1',source_ref:'ACTION_REGISTER'}],
      capabilities:[{capability_id:'CAP-GITHUB-SCHEDULED-READ',domain:'ENGINEERING',runtime:'SCHEDULED_TASK',operation:'Repository metadata/read',status:'PASS',last_tested_at:NOW,evidence_pointer:'receipt',readback:'PASS',risk_level:'L1_READ_ONLY',notes:'read only',fingerprint:'cap-read'}],
      semanticMemory:[],proceduralMemory:[],
      learningFilaments:[{filament_id:'FIL-1',source_layer:'SEMANTIC_MEMORY',source_id:'SEM-1',source_domain:'SCIENCE',target_layer:'PROCEDURAL_MEMORY',target_id:'LESSON-1',target_domain:'OLYMPUS',filament_type:'TRANSFERABLE_METHOD',activation_rule:'null request',weight:'0.90',support_count:'4',contradiction_count:'0',status:'ACTIVE',owner:'NEXO',evidence_refs:'R1;R2',next_discriminant:'prospective check'}],
      automationHealth:[{automation:'NEXO Executor v0.1',last_checked:NOW,status:'ACTIVE_PROVIDER_CONFIRMED',readback:'PASS_PROVIDER_ENABLED_TRUE'}]
    }
  };
}

test('compila as superfícies reais em SystemState v1 sem promover projeção a verdade',()=>{
  const state=buildSystemState(input());
  assert.equal(state.contract_version,'1');
  assert.equal(state.scenario_id,'live');
  assert.equal(state.envelopes[0].authoritative,false);
  assert.equal(state.envelopes[0].projection_role,'COCKPIT');
  assert.equal(state.findings[0].domain,'OLYMPUS');
  assert.equal(state.findings[0].status,'CONFLICT');
  assert.equal(state.findings[0].severity,'P0');
});

test('mapeia capability, execução, Human Inbox e filamentos sem inventar sucesso',()=>{
  const state=buildSystemState(input());
  assert.equal(state.capabilities.find(x=>x.capability_id==='CAP-GITHUB-SCHEDULED-READ')?.status,'PASS');
  const action=state.actions.find(x=>x.action_id==='ACT-1');
  assert.equal(action?.readback.status,'CONFIRMED');
  assert.equal(action?.effect_key,'EFF-1');
  assert.equal(action?.capability_id,'CAP-GITHUB-SCHEDULED-READ');
  assert.equal(state.inbox[0].kind,'DECIDIR');
  assert.equal(state.inbox[0].action_id,'ACT-HUMAN');
  assert.equal(state.filaments[0].weight,0.9);
  assert.ok(state.graph.nodes.some(x=>x.id==='action:ACT-1'));
});

test('estado global preserva conflito P0 mesmo quando providers e bus estão LIVE',()=>{
  const state=buildSystemState(input());
  assert.equal(state.global_state,'CONFLICT');
  assert.equal(state.bus.fingerprint,'BUS-1');
  assert.ok(state.bus.consumers.some(x=>x.id==='nexo_one'));
  assert.ok(state.bus.consumers.some(x=>x.id==='atlas'));
});
