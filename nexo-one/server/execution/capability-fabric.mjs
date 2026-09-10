import {createHash} from 'node:crypto';

const PASS='PASS';
const FAIL_CLOSED=new Set(['UNVERIFIED','UNKNOWN','BLOCKED']);
const DONE='DONE';
const READBACK_PASS='PASS';
const FABRIC_VERSION='CAPABILITY_AWARE_EXECUTION_FABRIC_V1';

function text(value){return String(value??'').trim()}
function upper(value){return text(value).toUpperCase()}

function canonical(value){
  if(value===null||typeof value!=='object'){
    if(typeof value==='number'&&!Number.isFinite(value))return String(value);
    if(typeof value==='bigint')return value.toString();
    if(value===undefined)return null;
    return value;
  }
  if(Array.isArray(value))return value.map(canonical);
  return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])]));
}

export function stableFingerprint(value){
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export function deriveEffectKey({actionId,requiredOperation,context,inputFingerprint}={}){
  const payload={
    action_id:text(actionId),
    required_operation:text(requiredOperation),
    context:upper(context),
    input_fingerprint:text(inputFingerprint),
  };
  if(!payload.action_id)throw new Error('ACTION_ID_REQUIRED');
  if(!payload.required_operation)throw new Error('REQUIRED_OPERATION_REQUIRED');
  if(!payload.context)throw new Error('EXECUTION_CONTEXT_REQUIRED');
  if(!payload.input_fingerprint)throw new Error('INPUT_FINGERPRINT_REQUIRED');
  return `EFF-CAE-${stableFingerprint(payload).slice(0,40)}`;
}

function riskRank(value){
  const match=upper(value).match(/^L(\d+)/);
  return match?Number(match[1]):Number.MAX_SAFE_INTEGER;
}

function costRank(capability){
  for(const key of ['cost_weight','cost_rank','cost']){
    const value=Number(capability?.[key]);
    if(Number.isFinite(value))return value;
  }
  return 0;
}

function capabilityContext(capability){
  return upper(capability?.context||capability?.execution_context||capability?.runtime);
}

function domainMatches(capabilityDomain,requestedDomain){
  const requested=upper(requestedDomain),candidate=upper(capabilityDomain);
  if(!requested||!candidate)return false;
  if(candidate===requested)return true;
  return candidate.split(/[\s/,|]+/).filter(Boolean).includes(requested);
}

export function selectCapabilityRoute({capabilities=[],domain,requiredOperation,context,eligibleRuntimes=[]}={}){
  const operation=text(requiredOperation),executionContext=upper(context);
  if(!operation)throw new Error('REQUIRED_OPERATION_REQUIRED');
  if(!executionContext)throw new Error('EXECUTION_CONTEXT_REQUIRED');
  const runtimeSet=new Set((eligibleRuntimes||[]).map(upper).filter(Boolean));
  const candidates=(Array.isArray(capabilities)?capabilities:[]).filter(capability=>
    domainMatches(capability?.domain,domain)&&
    text(capability?.operation)===operation&&
    capabilityContext(capability)===executionContext&&
    (!runtimeSet.size||runtimeSet.has(upper(capability?.runtime)))
  );
  const pass=candidates.filter(capability=>upper(capability?.status)===PASS);
  if(!pass.length){
    const closed=candidates.map(capability=>upper(capability?.status)).filter(status=>FAIL_CLOSED.has(status));
    if(closed.length){
      const priority=['BLOCKED','UNVERIFIED','UNKNOWN'];
      const status=priority.find(value=>closed.includes(value))||closed.sort()[0];
      throw new Error(`CAPABILITY_FAIL_CLOSED:${status}`);
    }
    throw new Error('CAPABILITY_PASS_ROUTE_NOT_FOUND');
  }
  return [...pass].sort((a,b)=>
    riskRank(a.risk_level)-riskRank(b.risk_level)||
    costRank(a)-costRank(b)||
    upper(a.runtime).localeCompare(upper(b.runtime))||
    text(a.capability_id).localeCompare(text(b.capability_id))
  )[0];
}

function runId(effectKey){
  return `RUN-CAE-${stableFingerprint(effectKey).slice(0,32)}`;
}

function verifiedEffect(effect){
  return upper(effect?.status)===DONE&&upper(effect?.readback_status)===READBACK_PASS;
}

function validateLease({action,actor,writeToken,now}){
  if(text(action?.lease_owner)!==text(actor))throw new Error('LEASE_OWNER_MISMATCH');
  if(!text(writeToken)||text(action?.write_token)!==text(writeToken))throw new Error('WRITE_TOKEN_MISMATCH');
  const until=Date.parse(text(action?.lease_until)),at=Date.parse(text(now)||new Date().toISOString());
  if(!Number.isFinite(until))throw new Error('LEASE_REQUIRED');
  if(!Number.isFinite(at))throw new Error('EXECUTION_TIME_INVALID');
  if(until<=at)throw new Error('LEASE_EXPIRED');
}

function requireStores(effectLedger,executionRuns){
  for(const [name,store,methods] of [
    ['EFFECT_LEDGER',effectLedger,['get','reserve','complete','fail']],
    ['EXECUTION_RUNS',executionRuns,['start','finish']],
  ]){
    if(!store||methods.some(method=>typeof store[method]!=='function'))throw new Error(`${name}_ADAPTER_REQUIRED`);
  }
}

export async function executeCapabilityAware({
  action,requiredOperation,context,input,capabilities,eligibleRuntimes,adapters={},effectLedger,executionRuns,
  actor,writeToken,now=new Date().toISOString(),
}={}){
  const actionId=text(action?.action_id||action?.id),domain=upper(action?.domain),executionContext=upper(context);
  if(!actionId)throw new Error('ACTION_ID_REQUIRED');
  if(!domain)throw new Error('ACTION_DOMAIN_REQUIRED');
  requireStores(effectLedger,executionRuns);

  const inputFingerprint=stableFingerprint(input??null);
  const runtimeCandidates=(eligibleRuntimes?.length?eligibleRuntimes:[executionContext]).map(upper);
  const capability=selectCapabilityRoute({capabilities,domain,requiredOperation,context:executionContext,eligibleRuntimes:runtimeCandidates});
  const capabilityId=text(capability.capability_id),runtime=upper(capability.runtime);
  const adapter=adapters[capabilityId];
  if(!adapter||typeof adapter.execute!=='function'||typeof adapter.readback!=='function')throw new Error('CAPABILITY_RUNTIME_ADAPTER_MISSING');

  const effectKey=deriveEffectKey({actionId,requiredOperation,context:executionContext,inputFingerprint});
  const existing=await effectLedger.get(effectKey);
  if(verifiedEffect(existing)){
    return {status:'NO_OP_ALREADY_APPLIED',capability,runtime,inputFingerprint,effectKey,runId:null,readback:{verified:true,replay:true,receiptRef:existing.receipt_pointer||null}};
  }

  const mutating=adapter.mutating!==false;
  if(mutating)validateLease({action,actor,writeToken,now});

  const reserved=await effectLedger.reserve({
    effect_key:effectKey,action_id:actionId,domain,effect_type:text(requiredOperation),target:text(adapter.target||capability.provider||runtime),
    desired_fingerprint:inputFingerprint,status:'PENDING',provider_object_id:null,attempt_count:1,first_attempt_at:now,last_attempt_at:now,
    readback_status:'PENDING',rollback_ref:text(capability.rollback)||null,receipt_pointer:null,last_error:null,write_token:mutating?text(writeToken):null,
  });
  if(!reserved?.acquired){
    if(verifiedEffect(reserved?.existing))return {status:'NO_OP_ALREADY_APPLIED',capability,runtime,inputFingerprint,effectKey,runId:null,readback:{verified:true,replay:true,receiptRef:reserved.existing.receipt_pointer||null}};
    throw new Error('EFFECT_RESERVATION_CONFLICT');
  }

  const id=runId(effectKey);
  await executionRuns.start({
    run_id:id,automation:text(actor)||'CAPABILITY_AWARE_EXECUTOR',runtime,domain,lane:domain,action_id:actionId,started_at:now,status:'IN_PROGRESS',
    material_change:false,readback:'PENDING',effect_key:effectKey,receipt_ref:null,failure_signature:null,tools_used:capabilityId,
    signals_observed:`required_operation=${text(requiredOperation)}; capability_fingerprint=${text(capability.fingerprint)}`,
    context_fingerprint:inputFingerprint,strategy_family:FABRIC_VERSION,risk_class:text(capability.risk_level),
    capability_id:capabilityId,input_fingerprint:inputFingerprint,
  });

  try{
    const providerResult=await adapter.execute({action,input,capability,runtime,context:executionContext,inputFingerprint,effectKey,writeToken,actor});
    const readback=await adapter.readback({action,input,capability,runtime,context:executionContext,inputFingerprint,effectKey,providerResult,writeToken,actor});
    if(readback?.verified!==true)throw new Error('PROVIDER_READBACK_UNVERIFIED');
    const providerObjectId=text(readback.providerObjectId||providerResult?.providerObjectId)||null;
    const receiptRef=text(readback.receiptRef)||null;
    const completed=await effectLedger.complete(effectKey,{
      status:DONE,provider_object_id:providerObjectId,last_attempt_at:now,readback_status:READBACK_PASS,receipt_pointer:receiptRef,last_error:null,
    });
    await executionRuns.finish(id,{
      ended_at:now,status:'SUCCESS',material_change:mutating,readback:READBACK_PASS,receipt_ref:receiptRef,outcome:'provider readback verified',
      quality_gate_result:PASS,accuracy_or_equivalence:text(readback.fingerprint||readback.providerFingerprint)||'READBACK_VERIFIED',
    });
    return {status:'SUCCESS',capability,runtime,inputFingerprint,effectKey,runId:id,providerResult,readback,effect:completed};
  }catch(error){
    const message=text(error?.message||error)||'EXECUTION_FAILED';
    await effectLedger.fail(effectKey,{status:'FAILED',last_attempt_at:now,readback_status:'FAIL',last_error:message});
    await executionRuns.finish(id,{ended_at:now,status:'FAILED',material_change:false,readback:'FAIL',failure_signature:message,outcome:message,quality_gate_result:'FAIL'});
    throw error;
  }
}
