import test from 'node:test';
import assert from 'node:assert/strict';
import {materialIncident,persistMaterialIncident} from '../server/execution/integrity.mjs';

const base={
  receipt_id:'R-1',action_id:'A-1',action_type:'nexo.sheet.update',provider:'nexo',domain:'OLYMPUS',capability_id:'CAP-SHEET-WRITE',target_ref:'sheet!A1',intent_fingerprint:'ACT-ABC123',confirmation_level:'STRONG_CONFIRM',provider_effect_id:'sheet-1',source_ref:'https://docs.google.com/spreadsheets/d/sheet-1/edit',before_revision:'old',after_revision:'new',checked_at:'2026-09-10T12:00:00.000Z'
};

test('transient auth/scope/provider failures are not material Integrity incidents',()=>{
  for(const status of ['BLOCKED','PENDING_READBACK'])assert.equal(materialIncident({...base,status,provider_effect_id:null,readback_status:null}),null);
  assert.equal(materialIncident({...base,status:'DEGRADED',provider_effect_id:null,readback_status:'PENDING'}),null);
});

test('canonical readback mismatch is material',()=>{
  const incident=materialIncident({...base,status:'CONFLICT',readback_status:'MISMATCH',explanation:'mismatch'});
  assert.equal(incident.failure_signature,'CANONICAL_WRITE_READBACK_MISMATCH');
  assert.equal(incident.severity,'P0');
  assert.match(incident.check_id,/^NEXO-ACTION-INTEGRITY-/);
});

test('production deployment revision mismatch is material',()=>{
  const incident=materialIncident({...base,action_type:'vercel.promote',provider:'vercel',status:'CONFLICT',readback_status:'MISMATCH',material:true,expected:{source_revision:'abc'},after_revision:'wrong'});
  assert.equal(incident.failure_signature,'PRODUCTION_DEPLOYMENT_REVISION_MISMATCH');
  assert.equal(incident.severity,'P0');
});

test('failed strong-confirm action with acknowledged effect is material',()=>{
  const incident=materialIncident({...base,action_type:'calendar.delete',provider:'calendar',status:'FAILED',readback_status:'MISMATCH'});
  assert.equal(incident.failure_signature,'STRONG_CONFIRM_PARTIAL_EFFECT');
});

test('persist dedupes existing check_id and performs no write',async()=>{
  let writes=0;
  const incident=materialIncident({...base,status:'CONFLICT',readback_status:'MISMATCH'});
  const header=['check_id','scope','check_type','target','expected','observed','status','severity','failure_signature','remediation','readback_ref','last_checked','next_check','notes'];
  const requester=async(_url,options={})=>{
    if(options.method==='POST'){writes++;return {updates:{updatedRows:1}};}
    return {values:[header,[incident.check_id,'OLYMPUS','ACTION_EFFECT_INTEGRITY']]};
  };
  const result=await persistMaterialIncident({...base,status:'CONFLICT',readback_status:'MISMATCH'},{env:{NEXO_SHEET_ID:'sheet-1'},tokenProvider:async()=> 'tok',requester});
  assert.equal(result.deduped,true);assert.equal(result.persisted,false);assert.equal(writes,0);
});

test('persist appends canonical 14-column row then proves it by readback',async()=>{
  let reads=0,written=null;
  const receipt={...base,status:'CONFLICT',readback_status:'MISMATCH'};
  const incident=materialIncident(receipt);
  const header=['check_id','scope','check_type','target','expected','observed','status','severity','failure_signature','remediation','readback_ref','last_checked','next_check','notes'];
  const requester=async(_url,options={})=>{
    if(options.method==='POST'){written=JSON.parse(options.body).values[0];return {updates:{updatedRows:1}};}
    reads++;return reads===1?{values:[header]}:{values:[header,[incident.check_id,'OLYMPUS','ACTION_EFFECT_INTEGRITY']]};
  };
  const result=await persistMaterialIncident(receipt,{env:{NEXO_SHEET_ID:'sheet-1'},tokenProvider:async()=> 'tok',requester});
  assert.equal(result.persisted,true);assert.equal(result.readback,true);assert.equal(written.length,14);assert.equal(written[0],incident.check_id);
});
