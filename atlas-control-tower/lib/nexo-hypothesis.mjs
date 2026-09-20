import {createHash} from 'node:crypto';

const ABSORBING=new Set(['FALSIFIED','RETIRED']);
const REQUIRED=Object.freeze(['hypothesis_id','proposition']);
const RECOMMENDED=Object.freeze(['claim_boundary','success_criteria','kill_criteria','critical_tests','max_adaptive_followups','reopen_policy']);
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const clean=value=>String(value??'').trim().replace(/\s+/g,' ');
const upper=value=>clean(value).toUpperCase();
function present(value){if(Array.isArray(value))return value.length>0;return value!==null&&value!==undefined&&clean(value)!=='';}
function entityId(item={}){return clean(item.id||item.hypothesis_id||item.entity_id);}
function proposition(item={}){return clean(item.proposition||item.hypothesis||item.title);}
function requireIdentifier(value,field='hypothesis_id'){const normalized=clean(value);if(!normalized||normalized.includes('..')||!IDENTIFIER.test(normalized))throw new Error(`INVALID_IDENTIFIER:${field}`);return normalized;}
function numericSortValue(value){const raw=clean(value);return /^\d+(?:\.\d+)?$/.test(raw)?Number(raw):0;}

export function validateHypothesisContract(item={}){
  const normalized={...item,hypothesis_id:entityId(item),proposition:proposition(item)};
  const missing=REQUIRED.filter(field=>!present(normalized[field]));
  const recommended_missing=RECOMMENDED.filter(field=>!present(normalized[field]));
  return {contract:'HYPOTHESIS_LIFECYCLE_V1',valid:missing.length===0,missing,required:[...REQUIRED],recommended_missing,policy:'MINIMUM_IDENTITY_THEN_RESOLVE_BY_TESTING'};
}

export function normalizeHypothesis(item={}){
  const id=entityId(item),prop=proposition(item),status=upper(item.status||'OPEN'),validation=validateHypothesisContract(item);
  return {
    id,
    proposition:prop,
    status,
    contract_state:validation.valid?'FROZEN':upper(item.contract_state||'NEEDS_FREEZE'),
    execution_eligible:Boolean(validation.valid&&!ABSORBING.has(status)),
    priority:item.priority,
    expected_information_gain:item.expected_information_gain,
    domain:item.domain,
    program_id:item.program_id,
    entity_version:item.entity_version,
    missing_contract_fields:validation.missing,
    source:item,
  };
}

export function createHypothesisSurface({towerGateway}){
  if(!towerGateway)throw new Error('TOWER_GATEWAY_REQUIRED');
  async function getHypotheses(){
    if(typeof towerGateway.listJsonDirectory!=='function')throw new Error('HYPOTHESIS_REGISTRY_READ_UNAVAILABLE');
    const raw=await towerGateway.listJsonDirectory('entities/hypothesis');
    const items=(Array.isArray(raw)?raw:[]).filter(item=>item&&typeof item==='object'&&!Array.isArray(item)).map(normalizeHypothesis).filter(item=>item.id);
    return {contract:'NEXO_HYPOTHESIS_REGISTRY_V1',items,total:items.length};
  }
  async function getHypothesis(hypothesisId){
    const id=requireIdentifier(hypothesisId,'hypothesis_id');
    const item=await towerGateway.readEntity('hypothesis',id);
    if(!item)throw new Error(`HYPOTHESIS_NOT_FOUND:${id}`);
    return normalizeHypothesis(item);
  }
  async function ingestHypothesis(payload={}){
    const prop=proposition(payload);
    if(!prop)throw new Error('HYPOTHESIS_PROPOSITION_REQUIRED');
    const registry=await getHypotheses(),normalized=prop.toLocaleLowerCase('pt-BR');
    const duplicate=registry.items.find(item=>String(item.proposition||'').toLocaleLowerCase('pt-BR')===normalized);
    if(duplicate)return {status:'DUPLICATE',outcome:'MERGED_EXISTING_IDENTITY',hypothesis_id:duplicate.id,readback:'PASS'};
    const explicit=clean(payload.hypothesis_id);
    const material=[normalized,clean(payload.domain).toLowerCase(),clean(payload.claim_boundary).toLowerCase()].join('|');
    const digest=createHash('sha256').update(material).digest('hex').slice(0,20).toUpperCase();
    const id=explicit?requireIdentifier(explicit,'hypothesis_id'):'HYP-USER-'+digest;
    const candidate={hypothesis_id:id,proposition:prop,claim_boundary:payload.claim_boundary,success_criteria:payload.success_criteria,kill_criteria:payload.kill_criteria,critical_tests:payload.critical_tests,max_adaptive_followups:payload.max_adaptive_followups,reopen_policy:payload.reopen_policy};
    const validation=validateHypothesisContract(candidate),correlation=clean(payload.correlation_id)||'CORR-'+id;
    const changes={id,hypothesis_id:id,entity_type:'SCIENTIFIC_HYPOTHESIS',status:'OPEN',contract_state:validation.valid?'FROZEN':'NEEDS_FREEZE',proposition:prop,origin:clean(payload.origin)||'USER_DIRECTED',authority:clean(payload.authority)||'USER_DIRECTED',correlation_id:correlation};
    for(const key of ['claim_boundary','success_criteria','kill_criteria','critical_tests','max_adaptive_followups','reopen_policy','domain','program_id','priority','expected_information_gain','title','scope'])if(payload[key]!==undefined&&payload[key]!==null)changes[key]=payload[key];
    const requestDigest=createHash('sha256').update(canonicalJson({id,changes})).digest('hex').slice(0,20).toUpperCase();
    const request={request_id:'REQ-API-HYP-'+requestDigest,entity_kind:'hypothesis',entity_name:id,expected_version:0,writer_role:'ADVISOR',event_type:'HYPOTHESIS_CREATED',material:true,correlation_id:correlation,changes};
    const persisted=await towerGateway.submitTowerMutation(request),readback=await towerGateway.readEntity('hypothesis',id);
    if(!readback)throw new Error('HYPOTHESIS_READBACK_MISSING');
    return {hypothesis_id:id,contract_state:changes.contract_state,execution_eligible:validation.valid,missing_contract_fields:validation.missing,recommended_missing:validation.recommended_missing,status:persisted?.status||'COMPLETE',receipt:persisted?.receipt||persisted,readback:'PASS',entity:readback};
  }
  async function getHypothesisFrontier(){
    const registry=await getHypotheses();
    const items=registry.items.filter(item=>!ABSORBING.has(item.status)).sort((a,b)=>{
      const byPriority=numericSortValue(b.priority)-numericSortValue(a.priority);if(byPriority)return byPriority;
      const byGain=numericSortValue(b.expected_information_gain)-numericSortValue(a.expected_information_gain);if(byGain)return byGain;
      return String(a.id).localeCompare(String(b.id));
    });
    return {contract:'NEXO_HYPOTHESIS_FRONTIER_V1',items,total:items.length,excluded_statuses:[...ABSORBING].sort(),selection_owner:'NEXO_AUTOCONSISTENTE_V1_3'};
  }
  return {getHypotheses,getHypothesis,getHypothesisFrontier,validateHypothesisContract,ingestHypothesis};
}

export const _internal={ABSORBING,REQUIRED,RECOMMENDED,entityId,proposition,requireIdentifier,numericSortValue,present};
