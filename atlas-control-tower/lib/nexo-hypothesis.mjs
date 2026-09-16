const ABSORBING=new Set(['FALSIFIED','RETIRED']);
const REQUIRED=Object.freeze([
  'hypothesis_id','proposition','claim_boundary','success_criteria','kill_criteria','critical_tests','max_adaptive_followups','reopen_policy'
]);
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
  return {contract:'HYPOTHESIS_LIFECYCLE_V1',valid:missing.length===0,missing,required:[...REQUIRED]};
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
  async function getHypothesisFrontier(){
    const registry=await getHypotheses();
    const items=registry.items.filter(item=>!ABSORBING.has(item.status)).sort((a,b)=>{
      const byPriority=numericSortValue(b.priority)-numericSortValue(a.priority);if(byPriority)return byPriority;
      const byGain=numericSortValue(b.expected_information_gain)-numericSortValue(a.expected_information_gain);if(byGain)return byGain;
      return String(a.id).localeCompare(String(b.id));
    });
    return {contract:'NEXO_HYPOTHESIS_FRONTIER_V1',items,total:items.length,excluded_statuses:[...ABSORBING].sort(),selection_owner:'NEXO_AUTOCONSISTENTE_V1_3'};
  }
  return {getHypotheses,getHypothesis,getHypothesisFrontier,validateHypothesisContract};
}

export const _internal={ABSORBING,REQUIRED,entityId,proposition,requireIdentifier,numericSortValue,present};
