import {randomBytes} from 'node:crypto';
import {ActionError,semanticFingerprint,semanticKey} from './contracts.mjs';

const FINAL=new Set(['PASS','PENDING_READBACK','BLOCKED','FAILED','DEGRADED','CONFLICT']);
const clone=value=>structuredClone(value);

export class ExecutionLedger {
  constructor({limit=200,ttlMs=8*60*60*1000,now=()=>Date.now()}={}){
    this.limit=limit;this.ttlMs=ttlMs;this.now=now;this.byReceipt=new Map();this.byKey=new Map();
  }
  prune(){
    const cutoff=this.now()-this.ttlMs;
    for(const [id,row] of this.byReceipt){if(row.created_ms<cutoff){this.byReceipt.delete(id);if(this.byKey.get(row.idempotency_key)===id)this.byKey.delete(row.idempotency_key);}}
    while(this.byReceipt.size>this.limit){const [id,row]=this.byReceipt.entries().next().value;this.byReceipt.delete(id);if(this.byKey.get(row.idempotency_key)===id)this.byKey.delete(row.idempotency_key);}
  }
  begin(intent){
    this.prune();
    const semantic=semanticKey(intent),existingId=this.byKey.get(intent.idempotency_key),existing=existingId&&this.byReceipt.get(existingId);
    if(existing){if(existing.semantic_key!==semantic)throw new ActionError('IDEMPOTENCY_CONFLICT');return clone(existing);}
    const receipt_id=`R-${randomBytes(8).toString('hex').toUpperCase()}`,created_ms=this.now();
    const row={receipt_id,action_id:intent.action_id,action_type:intent.action_type,provider:intent.provider,domain:intent.domain,capability_id:intent.capability_id,target_ref:intent.target_ref,idempotency_key:intent.idempotency_key,semantic_key:semantic,intent_fingerprint:semanticFingerprint(intent),confirmation_level:intent.confirmation_level,status:'PLANNED',trace:[{stage:'PLANNED',at:new Date(created_ms).toISOString()}],created_ms,checked_at:new Date(created_ms).toISOString(),provider_effect_id:null,source_ref:null,before_revision:null,after_revision:null,provider_response_classification:null,readback_status:null,authority_decision:null,expected:null,material:false,integrity:null,explanation:'Action planned; no provider effect dispatched.'};
    this.byReceipt.set(receipt_id,row);this.byKey.set(intent.idempotency_key,receipt_id);this.prune();return clone(row);
  }
  transition(receiptId,status,patch={}){
    const row=this.byReceipt.get(receiptId);if(!row)throw new ActionError('INVALID_INTENT');
    const at=this.now();Object.assign(row,patch,{status,checked_at:new Date(at).toISOString()});row.trace.push({stage:status,at:new Date(at).toISOString()});return clone(row);
  }
  annotate(receiptId,patch={}){
    const row=this.byReceipt.get(receiptId);if(!row)throw new ActionError('INVALID_INTENT');
    Object.assign(row,patch,{checked_at:new Date(this.now()).toISOString()});return clone(row);
  }
  ack(receiptId,effect={}){
    return this.transition(receiptId,'PROVIDER_ACK',{provider_effect_id:effect.effect_id||effect.provider_effect_id||null,source_ref:effect.source_ref||null,provider_response_classification:effect.classification||'ACK',before_revision:effect.before_revision??this.byReceipt.get(receiptId)?.before_revision??null,expected:effect.expected??null,explanation:effect.explanation||'Provider acknowledged the action.'});
  }
  finish(receiptId,verification={}){
    const status=FINAL.has(verification.status)?verification.status:'DEGRADED';
    return this.transition(receiptId,status,{after_revision:verification.after_revision??null,readback_status:verification.readback_status||null,source_ref:verification.source_ref||this.byReceipt.get(receiptId)?.source_ref||null,material:!!verification.material,explanation:verification.explanation||'Readback completed.'});
  }
  get(receiptId){const row=this.byReceipt.get(receiptId);return row?clone(row):null;}
  getByAction(actionId){for(const row of [...this.byReceipt.values()].reverse())if(row.action_id===actionId)return clone(row);return null;}
  recent(limit=30){this.prune();return [...this.byReceipt.values()].reverse().slice(0,Math.max(0,limit)).map(clone);}
  clear(){this.byReceipt.clear();this.byKey.clear();}
}

export const executionLedger=new ExecutionLedger();
