import {normalizeIntent,ActionError} from './contracts.mjs';
import {gateIntent} from './gate.mjs';
import {executionLedger} from './ledger.mjs';
import {resolveActionProvider} from './providers.mjs';
import {readProvider} from '../adapters/registry.mjs';

const terminal=new Set(['PASS','BLOCKED','FAILED','CONFLICT']);
const denied=new Set(['AUTH_REQUIRED','SCOPE_REQUIRED','CAPABILITY_BLOCKED','AUTHORITY_CONFLICT','TARGET_AMBIGUOUS','CONFIRMATION_REQUIRED','IDEMPOTENCY_CONFLICT']);

async function defaultLoadTruth({env,now,signal}){
  const result=await readProvider('nexo',{env,now,access:'PRIVATE',force:true,timeout:8000});
  if(result.provider.status!=='AVAILABLE'||!result.truthGraphInput)throw new ActionError(result.provider.status==='AUTH_REQUIRED'?'AUTH_REQUIRED':'PROVIDER_UNAVAILABLE');
  return {truthGraphInput:result.truthGraphInput,revision:result.provider.revision,provider:result.provider};
}
async function defaultLoadProvider(provider,{env,now}){return readProvider(provider,{env,now,access:'PRIVATE',force:true,timeout:8000});}

export function createBroker({ledger=executionLedger,loadTruth=defaultLoadTruth,loadProvider=defaultLoadProvider,resolveProvider=resolveActionProvider,now=()=>Date.now()}={}){
  async function authority(intent,ctx,confirmed){
    const truth=await loadTruth({...ctx,now:now()});
    const decision=gateIntent(intent,{truthGraphInput:truth.truthGraphInput,confirmed});
    return {truth,decision};
  }
  async function planAction(input,ctx={}){
    const intent=normalizeIntent(input,now());
    const existing=ledger.begin(intent);
    if(existing.status!=='PLANNED')return existing;
    const synthetic=intent.confirmation_level==='STRONG_CONFIRM'?'STRONG_CONFIRM':intent.confirmation_level==='CONFIRM'?'CONFIRM':true;
    const {truth,decision}=await authority(intent,ctx,synthetic);
    let before=truth.revision||null;
    try{const provider=await loadProvider(intent.provider,{...ctx,now:now()});before=provider?.provider?.revision||before;}catch{}
    return ledger.transition(existing.receipt_id,'GATED',{authority_decision:decision.authority,capability_decision:decision.capability,before_revision:before,explanation:intent.confirmation_level==='NONE'?'Action is gated and may execute without human confirmation.':`Action is gated and requires ${intent.confirmation_level}.`});
  }
  async function performReadback(receipt,ctx={}){
    if(!receipt.provider_effect_id)return ledger.finish(receipt.receipt_id,{status:'PENDING_READBACK',readback_status:'PENDING',explanation:'Provider effect identity is unavailable; readback must resolve before retry.'});
    ledger.transition(receipt.receipt_id,'READBACK',{explanation:'Reading provider effect back before final status.'});
    const provider=resolveProvider(receipt.provider);
    try{
      const verification=await provider.readback(ledger.get(receipt.receipt_id),{...ctx,now:now()});
      return ledger.finish(receipt.receipt_id,verification);
    }catch(error){
      const code=error?.code;
      if(['READBACK_TIMEOUT','PROVIDER_UNAVAILABLE','RATE_LIMITED'].includes(code))return ledger.finish(receipt.receipt_id,{status:'PENDING_READBACK',readback_status:'PENDING',explanation:`Readback pending: ${code}.`});
      if(code==='AUTH_REQUIRED'||code==='SCOPE_REQUIRED')return ledger.finish(receipt.receipt_id,{status:'DEGRADED',readback_status:'PENDING',explanation:`Readback blocked by ${code}.`});
      return ledger.finish(receipt.receipt_id,{status:'FAILED',readback_status:'MISMATCH',explanation:'Provider readback failed.'});
    }
  }
  async function executeAction(input,ctx={}){
    const intent=normalizeIntent(input,now());
    let receipt=ledger.begin(intent);
    if(receipt.provider_effect_id)return terminal.has(receipt.status)?receipt:performReadback(receipt,ctx);
    if(terminal.has(receipt.status))return receipt;
    const {truth,decision}=await authority(intent,ctx,ctx.confirmed);
    receipt=ledger.transition(receipt.receipt_id,'GATED',{authority_decision:decision.authority,capability_decision:decision.capability,before_revision:receipt.before_revision||truth.revision||null});
    receipt=ledger.transition(receipt.receipt_id,'CONFIRMED',{explanation:intent.confirmation_level==='NONE'?'No human confirmation required.':`${intent.confirmation_level} accepted by private session.`});
    const provider=resolveProvider(intent.provider);
    try{
      receipt=ledger.transition(receipt.receipt_id,'DISPATCHED',{explanation:'Action dispatched to the governed provider adapter.'});
      const effect=await provider.execute(intent,{...ctx,now:now()});
      receipt=ledger.ack(receipt.receipt_id,effect);
    }catch(error){
      const code=error?.code||'PROVIDER_UNAVAILABLE',status=denied.has(code)?'BLOCKED':code==='RATE_LIMITED'?'DEGRADED':'FAILED';
      ledger.finish(receipt.receipt_id,{status,readback_status:null,explanation:`Provider dispatch stopped: ${code}.`});
      throw error instanceof ActionError?error:new ActionError(code);
    }
    return performReadback(receipt,ctx);
  }
  async function readbackAction(id,ctx={}){
    const receipt=ledger.get(id)||ledger.getByAction(id);if(!receipt)throw new ActionError('INVALID_INTENT');
    return performReadback(receipt,ctx);
  }
  return {planAction,executeAction,readbackAction,recentActions:(limit=30)=>ledger.recent(limit),clear:()=>ledger.clear()};
}

export const actionBroker=createBroker();
