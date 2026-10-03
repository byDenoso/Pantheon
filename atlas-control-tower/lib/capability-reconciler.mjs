import {createHash} from 'node:crypto';

const text=value=>String(value??'').trim();
const canonical=value=>{
  if(value===null||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(canonical);
  return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])]));
};
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export function normalizeCapabilityCandidate(candidate={}){
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))throw new Error('CAPABILITY_CANDIDATE_INVALID');
  const capability_id=text(candidate.capability_id);
  const input_schema=candidate.input_schema??candidate.contract?.input??[];
  const effect_schema=candidate.effect_schema??candidate.contract?.output??[];
  const side_effect_class=text(candidate.side_effect_class||candidate.scope||'UNKNOWN').toUpperCase();
  const dependencies=Array.isArray(candidate.dependencies)?[...candidate.dependencies].map(text).filter(Boolean).sort():[];
  const acceptance_criteria=candidate.acceptance_criteria??candidate.contract?.verification??[];
  if(!capability_id)throw new Error('CAPABILITY_ID_REQUIRED');
  if(!input_schema||!effect_schema)throw new Error('CAPABILITY_SCHEMA_REQUIRED');
  return canonical({
    capability_id,
    version:text(candidate.version||'1.0.0'),
    input_schema,
    effect_schema,
    side_effect_class,
    dependencies,
    acceptance_criteria,
    provider:text(candidate.provider||candidate.backend),
    implementation_ref:text(candidate.implementation_ref||candidate.executable),
    status:text(candidate.status||'CANDIDATE').toUpperCase()
  });
}

export function semanticCapabilityFingerprint(candidate={}){
  const n=normalizeCapabilityCandidate(candidate);
  return `sha256:${hash({input_schema:n.input_schema,effect_schema:n.effect_schema,side_effect_class:n.side_effect_class,dependencies:n.dependencies,acceptance_criteria:n.acceptance_criteria})}`;
}

function entriesOf(manifest={}){
  const caps=manifest?.capabilities??{};
  return Array.isArray(caps)?caps.map(item=>[item.capability_id,item]):Object.entries(caps);
}
function fingerprintOf(value){
  if(text(value?.semantic_fingerprint))return text(value.semantic_fingerprint);
  try{return semanticCapabilityFingerprint(value);}catch{return null;}
}

export function classifyCapabilityCandidate(candidate,manifest={}){
  const normalized=normalizeCapabilityCandidate(candidate),fingerprint=semanticCapabilityFingerprint(normalized);
  const entries=entriesOf(manifest),sameId=entries.find(([id])=>id===normalized.capability_id)?.[1]??null;
  if(sameId){
    const existingFingerprint=fingerprintOf({...sameId,capability_id:normalized.capability_id});
    if(existingFingerprint===fingerprint)return {classification:'UNCHANGED',fingerprint,existing:sameId};
    const existingVersion=text(sameId.version||'1.0.0');
    return {classification:existingVersion===normalized.version?'CONFLICT':'UPDATE',fingerprint,existing:sameId};
  }
  const duplicate=entries.find(([id,value])=>id!==normalized.capability_id&&fingerprintOf({...value,capability_id:id})===fingerprint);
  if(duplicate)return {classification:'DUPLICATE',fingerprint,existing_id:duplicate[0],existing:duplicate[1]};
  return {classification:'NEW',fingerprint,existing:null};
}

export function reconcileCapabilityCandidate(candidate,manifest={}){
  const normalized=normalizeCapabilityCandidate(candidate),result=classifyCapabilityCandidate(normalized,manifest);
  return {...result,candidate:{...normalized,semantic_fingerprint:result.fingerprint,reconciliation_state:'CANDIDATE'},canonical_write_required:['NEW','UPDATE'].includes(result.classification),trusted:false,executable:false};
}

export function classifyCapabilityDrift(observedCandidates=[],manifest={}){
  const observed=new Set(observedCandidates.map(item=>normalizeCapabilityCandidate(item).capability_id));
  return entriesOf(manifest).map(([capability_id,value])=>({capability_id,state:observed.has(capability_id)?'OBSERVED':'STALE',canonical:value}));
}
