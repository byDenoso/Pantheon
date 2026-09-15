import test from 'node:test';
import assert from 'node:assert/strict';
import {createNexoSheetStores} from '../server/execution/nexo-sheet-store.mjs';

const now='2026-09-15T16:40:00.000Z';

function memoryTransport(initial=[]){
  const rows=initial.map((row,index)=>({...row,rowNumber:index+2}));
  return {
    async list(){return rows.map(row=>({...row}));},
    async append(row){rows.push({...row,rowNumber:rows.length+2});},
    async replace(rowNumber,row){const index=rows.findIndex(x=>x.rowNumber===rowNumber);assert.notEqual(index,-1);rows[index]={...row,rowNumber};},
    snapshot(){return rows.map(row=>({...row}));}
  };
}

test('effect ledger reserves once, persists verified completion and replays from canonical state',async()=>{
  const transport=memoryTransport();
  const {effectLedger}=createNexoSheetStores({now,transport});
  const record={effect_key:'EFF-1',action_id:'A1',domain:'PERSONAL',effect_type:'gmail.draft.create',target:'gmail',desired_fingerprint:'fp',status:'PENDING',provider_object_id:null,attempt_count:1,first_attempt_at:now,last_attempt_at:now,readback_status:'PENDING',rollback_ref:null,receipt_pointer:null,last_error:null,write_token:'token'};
  const first=await effectLedger.reserve(record);
  assert.equal(first.acquired,true);
  const second=await effectLedger.reserve(record);
  assert.equal(second.acquired,false);
  assert.equal(second.existing.effect_key,'EFF-1');
  await effectLedger.complete('EFF-1',{status:'DONE',provider_object_id:'draft-1',readback_status:'PASS',receipt_pointer:'gmail:draft-1',last_attempt_at:now});
  const saved=await effectLedger.get('EFF-1');
  assert.equal(saved.status,'DONE');
  assert.equal(saved.provider_object_id,'draft-1');
  assert.equal(saved.readback_status,'PASS');
  assert.equal(saved.receipt_pointer,'gmail:draft-1');
  const row=transport.snapshot().find(x=>x.record_type==='effect');
  assert.equal(row.status,'DONE');
  assert.equal(JSON.parse(row.payload_json).write_token,'token');
});

test('effect reservation fails closed when canonical reread detects duplicate reservation',async()=>{
  const transport=memoryTransport();
  const originalAppend=transport.append;
  transport.append=async row=>{await originalAppend(row);await originalAppend(row);};
  const {effectLedger}=createNexoSheetStores({now,transport});
  const result=await effectLedger.reserve({effect_key:'EFF-RACE',action_id:'A1',domain:'PERSONAL',effect_type:'calendar.event.create',status:'PENDING'});
  assert.equal(result.acquired,false);
  assert.equal(result.conflict,'DUPLICATE_CANONICAL_RECORD');
});

test('execution runs persist start and finish without losing original execution metadata',async()=>{
  const transport=memoryTransport();
  const {executionRuns}=createNexoSheetStores({now,transport});
  await executionRuns.start({run_id:'RUN-1',action_id:'A1',domain:'PERSONAL',runtime:'NEXO',status:'IN_PROGRESS',started_at:now,readback:'PENDING',effect_key:'EFF-1'});
  await executionRuns.finish('RUN-1',{status:'SUCCESS',ended_at:now,readback:'PASS',receipt_ref:'gmail:draft-1'});
  const row=transport.snapshot().find(x=>x.record_type==='execution_run');
  const payload=JSON.parse(row.payload_json);
  assert.equal(row.status,'SUCCESS');
  assert.equal(payload.action_id,'A1');
  assert.equal(payload.effect_key,'EFF-1');
  assert.equal(payload.readback,'PASS');
  assert.equal(payload.receipt_ref,'gmail:draft-1');
});

test('personal records upsert through canonical sheet and verify semantic readback',async()=>{
  const transport=memoryTransport();
  const {personalRecords}=createNexoSheetStores({now,transport});
  const written=await personalRecords.upsert({kind:'Task',id:'task-1',status:'NEEDS_ME',title:'Entregar relatório',detail:'Prazo amanhã',due_at:'2026-09-16T18:00:00Z',correlation_id:'PCR-1'});
  assert.equal(written.verified,true);
  assert.equal(written.record.record_type,'task');
  assert.equal(JSON.parse(written.record.payload_json).due_at,'2026-09-16T18:00:00Z');
  const updated=await personalRecords.upsert({kind:'Task',id:'task-1',status:'DONE',title:'Entregar relatório',detail:'Enviado',due_at:'2026-09-16T18:00:00Z',correlation_id:'PCR-1'});
  assert.equal(updated.verified,true);
  assert.equal(transport.snapshot().filter(x=>x.record_type==='task'&&x.record_id==='task-1').length,1);
  assert.equal(transport.snapshot().find(x=>x.record_id==='task-1').status,'DONE');
});
