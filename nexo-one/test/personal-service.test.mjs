import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPersonalSnapshot,executePersonalAction,personalActionFingerprint,PERSONAL_CAPABILITIES,PERSONAL_CAPABILITY_IDS} from '../server/personal/service.mjs';

const now='2026-09-15T16:45:00.000Z';
const provider=(id,items=[])=>({provider:{id,label:id,status:'AVAILABLE',lastSuccessAt:now,checkedAt:now,revision:`rev-${id}`,message:'ok',partial:false,count:items.length},items});
const fresh={state:'LIVE',observedAt:now,expiresAt:'2026-09-15T17:00:00.000Z'};

function runtime(adapterId,adapter){
  const effects=new Map(),runs=new Map();
  return {
    capabilities:PERSONAL_CAPABILITIES,
    adapters:{[adapterId]:adapter},
    effectLedger:{
      get:async id=>effects.get(id)||null,
      reserve:async record=>{if(effects.has(record.effect_key))return {acquired:false,existing:effects.get(record.effect_key)};effects.set(record.effect_key,{...record});return {acquired:true};},
      complete:async(id,patch)=>{const value={...effects.get(id),...patch};effects.set(id,value);return value;},
      fail:async(id,patch)=>{const value={...effects.get(id),...patch};effects.set(id,value);return value;}
    },
    executionRuns:{start:async record=>{runs.set(record.run_id,record);},finish:async(id,patch)=>{runs.set(id,{...runs.get(id),...patch});}},
  };
}

test('private personal snapshot normalizes provider state and derives proposals/follow-ups',async()=>{
  const task={id:'nexo:task:t1',kind:'ENTITY',title:'Entregar relatório',summary:'Prazo amanhã',source:'nexo',sourceRef:'https://docs.google.com/spreadsheets/d/x/edit',authority:'CANONICAL',freshness:fresh,attention:'ACT',observedAt:now,actions:[],contextId:'PERSONAL',personalType:'Task',status:'NEEDS_ME',dueAt:'2026-09-16T18:00:00Z'};
  const reader=async id=>provider(id,id==='nexo'?[task]:[]);
  const snapshot=await buildPersonalSnapshot({now:Date.parse(now),reader});
  assert.equal(snapshot.version,'PERSONAL_LOOP_V1');
  assert.equal(snapshot.model.entities.length,1);
  assert.equal(snapshot.model.entities[0].kind,'Task');
  assert.equal(snapshot.proposals.some(x=>x.kind==='TRACK_PERSONAL_ITEM'),true);
  assert.equal(snapshot.followUps[0].state,'OPEN');
});

test('L5 actions are denied before any execution adapter can run',async()=>{
  let called=false;
  const rt=runtime(PERSONAL_CAPABILITY_IDS.gmailDraft,{mutating:true,target:'gmail',execute:async()=>{called=true;},readback:async()=>({verified:true})});
  await assert.rejects(()=>executePersonalAction({now,proposal:{kind:'SEND_GMAIL',input:{to:'alice@example.com'}},runtime:rt}),/PERSONAL_ACTION_DENIED/);
  assert.equal(called,false);
});

test('L4 approval is bound to the exact proposal fingerprint before provider mutation',async()=>{
  let calls=0;
  const rt=runtime(PERSONAL_CAPABILITY_IDS.gmailDraft,{mutating:true,target:'gmail',execute:async()=>{calls++;return {providerObjectId:'draft-1'};},readback:async()=>({verified:true,providerObjectId:'draft-1',receiptRef:'gmail:draft:draft-1'})});
  const proposal={kind:'CREATE_GMAIL_DRAFT',input:{to:'alice@example.com',subject:'Status',body:'Tudo certo.'}};
  const fingerprint=personalActionFingerprint(proposal);
  await assert.rejects(()=>executePersonalAction({now,proposal:{...proposal,fingerprint},approval:{approved:true,proposal_fingerprint:'stale'},runtime:rt}),/APPROVAL_MISMATCH/);
  assert.equal(calls,0);
  const result=await executePersonalAction({now,proposal:{...proposal,fingerprint},approval:{approved:true,proposal_fingerprint:fingerprint},runtime:rt});
  assert.equal(result.status,'SUCCESS');
  assert.equal(result.readback.verified,true);
  assert.equal(calls,1);
});

test('L3 canonical task writes auto-execute through the existing capability fabric',async()=>{
  let observedInput;
  const rt=runtime(PERSONAL_CAPABILITY_IDS.nexoTask,{mutating:true,target:'nexo',execute:async({input})=>{observedInput=input;return {providerObjectId:`task:${input.id}`};},readback:async({providerResult})=>({verified:true,providerObjectId:providerResult.providerObjectId,receiptRef:`nexo:${providerResult.providerObjectId}`})});
  const proposal={kind:'UPSERT_NEXO_TASK',input:{kind:'Task',id:'task-1',title:'Entregar relatório',status:'NEEDS_ME',due_at:'2026-09-16T18:00:00Z'}};
  const result=await executePersonalAction({now,proposal,runtime:rt});
  assert.equal(result.status,'SUCCESS');
  assert.equal(observedInput.id,'task-1');
  assert.equal(result.capability.risk_level,'L3');
});
