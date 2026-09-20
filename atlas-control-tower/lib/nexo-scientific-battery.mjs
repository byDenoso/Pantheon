import {createHash} from 'node:crypto';
import {scientificFingerprintV2} from './nexo-roadmap.mjs';
import {validateHypothesisContract} from './nexo-hypothesis.mjs';

const REQUIRED_TEST_FIELDS=['question','dataset_and_selection','null','rival','priors','likelihood','covariance','observable','cuts','parameterization','method','decision_rule','success_criteria','kill_criteria','claim_boundary'];
const ABSORBING=new Set(['FALSIFIED','RETIRED']);
const ACTIVE_BATTERY=new Set(['READY','QUEUED','DISPATCHED','RUNNING','CHECKPOINTED','WAIT_DEPENDENCY']);
const TERMINAL_BATTERY=new Set(['DONE','VERIFIED','FAILED','INCONCLUSIVE','SUPERSEDED','REJECTED']);
const RUNNABLE=new Set(['ACTIVE','PROVEN','VALIDATED_CURRENT','PASS']);
const GENERIC='scientific.generic_contract_executor_v1';
const clean=value=>String(value??'').trim().replace(/\s+/g,' ');
const present=value=>Array.isArray(value)?value.some(x=>clean(x)):value&&typeof value==='object'?Object.keys(value).length>0:value!==null&&value!==undefined&&clean(value)!=='';
const canonical=value=>{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);};
const sha=value=>'sha256:'+createHash('sha256').update(canonical(value)).digest('hex');
const stableId=(prefix,fingerprint)=>prefix+'-'+String(fingerprint).replace(/^sha256:/,'').slice(0,20).toUpperCase();
const documentId=value=>clean(value?.id||value?.contract||value?.name||value?.battery_id);

function needsDener(missing,question,extra={}){return {state:'NEEDS_DENER',battery_manifest:null,tests:[],reused:[],engineering_gaps:[],science_dispatch:false,capability_creation:false,canonical_mutations:0,missing_fields:missing,question,needs_dener:{missing_fields:missing,question,...extra}};}
function mergeCandidate(result,ambiguous,key,candidate){
  const id=clean(key);if(!id||ambiguous.has(id))return;
  if(!result.has(id)){result.set(id,structuredClone(candidate));return;}
  if(canonical(result.get(id))!==canonical(candidate)){result.delete(id);ambiguous.add(id);}
}
function contractMap(documents=[]){
  const result=new Map(),ambiguous=new Set();
  for(const document of documents){
    if(!document||typeof document!=='object'||Array.isArray(document))continue;
    const inline=document.frozen_test_contracts;if(inline&&typeof inline==='object'&&!Array.isArray(inline))for(const [key,value] of Object.entries(inline))if(value&&typeof value==='object'&&!Array.isArray(value))mergeCandidate(result,ambiguous,key,value);
    const gates=document.gates;if(gates&&typeof gates==='object'&&!Array.isArray(gates))for(const [key,value] of Object.entries(gates))if(value&&typeof value==='object'&&!Array.isArray(value))mergeCandidate(result,ambiguous,key,value);
    const tests=document.tests;
    if(tests&&typeof tests==='object'&&!Array.isArray(tests))for(const [key,value] of Object.entries(tests))if(value&&typeof value==='object'&&!Array.isArray(value))mergeCandidate(result,ambiguous,key,value);
    if(Array.isArray(tests))for(const value of tests)if(value&&typeof value==='object'&&!Array.isArray(value)){const key=clean(value.id||value.test_id);if(key)mergeCandidate(result,ambiguous,key,value);}
    if(['question','dataset_and_selection','method','decision_rule','claim_boundary'].some(key=>Object.hasOwn(document,key))){const id=documentId(document);if(id)mergeCandidate(result,ambiguous,id,document);}
  }
  return Object.fromEntries(result);
}
function keyed(documents=[]){const result={};for(const doc of documents)if(doc&&typeof doc==='object'&&!Array.isArray(doc)){const id=documentId(doc);if(id)result[id]=structuredClone(doc);}return result;}
async function canonicalContext(gateway){
  const [contracts,manifests,tests,active,capManifest,recipes]=await Promise.all([
    gateway.listJsonDirectory('contracts'),gateway.listJsonDirectory('manifests'),gateway.listJsonDirectory('entities/test'),
    gateway.readActiveWorkIndex().catch(()=>({work:[]})),gateway.readCapabilityManifest(),gateway.listJsonDirectory('recipes').catch(()=>[])
  ]);
  return {battery_contracts:contractMap(contracts),battery_manifests:keyed(manifests),canonical_tests:tests||[],canonical_work:active?.work||[],capabilities:capManifest?.capabilities||{},recipes:keyed(recipes)};
}
function resolveTestContract(testRef,hypothesis,ctx){
  const frozen=hypothesis.frozen_test_contracts;if(frozen&&typeof frozen==='object'&&!Array.isArray(frozen)&&frozen[testRef]&&typeof frozen[testRef]==='object')return structuredClone(frozen[testRef]);
  if(ctx.battery_contracts[testRef])return structuredClone(ctx.battery_contracts[testRef]);
  const entity=ctx.canonical_tests.find(item=>clean(item?.id||item?.test_id)===testRef);
  if(entity){const candidate=entity.frozen_test||entity.frozen_contract||entity;if(candidate&&typeof candidate==='object')return structuredClone(candidate);}
  return null;
}
function capabilityBinding(contract,hypothesis,ctx){
  const explicit=clean(contract.capability_id||contract.capability||hypothesis.capability_id);
  if(explicit)return {id:explicit,reason:'EXPLICIT_CAPABILITY_ID'};
  for(const field of ['task_id','contract_name']){
    const target=clean(contract[field]);if(!target)continue;
    const matches=Object.entries(ctx.capabilities).filter(([,entry])=>entry&&typeof entry==='object'&&clean(entry[field])===target).map(([id])=>id).sort();
    if(matches.length===1)return {id:matches[0],reason:'UNIQUE_'+field.toUpperCase()};
    if(matches.length>1)return {id:'',reason:'AMBIGUOUS_'+field.toUpperCase()};
  }
  const required=new Set((contract.required_capabilities||[]).map(clean).filter(Boolean));
  if(required.size){
    const matches=[];
    for(const [id,entry] of Object.entries(ctx.capabilities)){
      if(!entry||typeof entry!=='object'||!RUNNABLE.has(clean(entry.status||'ACTIVE').toUpperCase()))continue;
      const provided=new Set([id,...(entry.semantic_capabilities||[]),...(entry.adapter_for||[])].map(clean).filter(Boolean));
      if([...required].every(x=>provided.has(x)))matches.push(id);
    }
    matches.sort();if(matches.length===1)return {id:matches[0],reason:'SEMANTIC_REQUIRED_CAPABILITIES'};if(matches.length>1)return {id:'',reason:'AMBIGUOUS_REQUIRED_CAPABILITIES'};return {id:'',reason:'NO_SEMANTIC_CAPABILITY_MATCH'};
  }
  return {id:'',reason:'NO_CAPABILITY_BINDING'};
}
function runnable(id,ctx){const entry=ctx.capabilities[id];const status=clean(entry?.status||'').toUpperCase();return {ok:Boolean(entry&&RUNNABLE.has(status||'ACTIVE')),status:status||'UNREGISTERED'};}
function equivalentBattery(fingerprint,ctx){return Object.values(ctx.battery_manifests).find(item=>clean(item?.battery_fingerprint)===fingerprint)||null;}

export function composeScientificBattery(hypothesis={},ctx={}){
  const validation=validateHypothesisContract(hypothesis);
  if(!validation.valid){const missing=[...validation.missing],field=missing[0];return needsDener(missing,"O contrato da hipótese está incompleto. Qual é o valor de '"+field+"'?",{hypothesis_id:clean(hypothesis.hypothesis_id||hypothesis.id),contract:'HYPOTHESIS_LIFECYCLE_V1'});}
  const hypothesisId=clean(hypothesis.hypothesis_id||hypothesis.id),state=clean(hypothesis.state||hypothesis.status).toUpperCase();
  if(ABSORBING.has(state)&&!hypothesis.reopen_admitted&&!hypothesis.reopen_authorization)return {state:'ABSORBED',battery_manifest:null,tests:[],reused:[],engineering_gaps:[],science_dispatch:false,capability_creation:false,canonical_mutations:0,hypothesis_state:state,reopen_policy:clean(hypothesis.reopen_policy),needs_dener:{question:'A hipótese '+hypothesisId+' está em '+state+'. Reabrir exige informação material externa. Autoriza a reabertura?',missing_fields:['reopen_authorization']},missing_fields:['reopen_authorization'],question:'A hipótese '+hypothesisId+' está em '+state+'. Reabrir exige informação material externa. Autoriza a reabertura?'};
  const critical=(hypothesis.critical_tests||[]).map(clean).filter(Boolean);
  if(!critical.length)return needsDener(['critical_tests'],'Quais são os critical tests da hipótese '+hypothesisId+'?',{hypothesis_id:hypothesisId});
  const planned=[],engineering=[];
  for(const testRef of critical){
    const contract=resolveTestContract(testRef,hypothesis,ctx);
    if(!contract)return needsDener(['frozen_test_contract'],'Não existe contrato congelado para o critical test '+testRef+'. Qual é a especificação científica congelada desse teste?',{hypothesis_id:hypothesisId,test_ref:testRef});
    const missing=REQUIRED_TEST_FIELDS.filter(field=>!present(contract[field]));
    if(missing.length)return needsDener(missing,'Qual é o valor científico congelado de '+missing[0]+' para o teste '+testRef+'?',{hypothesis_id:hypothesisId,test_ref:testRef});
    const fingerprint=scientificFingerprintV2(contract),binding=capabilityBinding(contract,hypothesis,ctx);
    let capabilityId=binding.id,reason=binding.reason,status='',ok=false;
    if(capabilityId){const r=runnable(capabilityId,ctx);ok=r.ok;status=r.status;}
    if(!capabilityId||!ok){
      const generic=runnable(GENERIC,ctx);
      if(generic.ok){capabilityId=GENERIC;status=generic.status;reason='UNIVERSAL_FROZEN_CONTRACT_ADAPTER';}
      else{engineering.push({domain:'ENGINEERING',action:'IMPLEMENT_OR_BIND_CAPABILITY',required_by_test:testRef,capability_id:binding.id||null,capability_status:status||null,reason:binding.id?'CAPABILITY_NOT_RUNNABLE':reason||'NO_CAPABILITY_BINDING',universal_capability_id:GENERIC,universal_capability_status:generic.status,scientific_specification_preserved:true});continue;}
    }
    planned.push({test_ref:testRef,test_id:stableId('T-SCI',fingerprint),scientific_fingerprint:fingerprint,fingerprint_version:2,capability_id:capabilityId,requested_capability_id:binding.id||null,capability_status:status,capability_binding:reason,frozen_test:contract});
  }
  if(engineering.length)return {state:'CAPABILITY_GAP',battery_manifest:null,tests:[],reused:[],engineering_gaps:engineering,science_dispatch:false,capability_creation:false,canonical_mutations:0,needs_dener:null,missing_fields:[],question:null,continuation:{terminal:false,mode:'REPAIR_RECOMPOSE_SAME_PULSE',next_action:'Resolve the engineering capability gap, refresh canonical capabilities, and compose again in the same scheduler pulse.',target_intent_preserved:true}};
  const scientificContract={hypothesis_id:hypothesisId,proposition:clean(hypothesis.proposition),claim_boundary:clean(hypothesis.claim_boundary),success_criteria:(hypothesis.success_criteria||[]).map(clean),kill_criteria:(hypothesis.kill_criteria||[]).map(clean),critical_tests:critical,max_adaptive_followups:hypothesis.max_adaptive_followups,reopen_policy:clean(hypothesis.reopen_policy)};
  const scientificContractHash=sha(scientificContract),dependencyTopology=Object.fromEntries(planned.map(item=>[item.test_ref,(item.frozen_test.depends_on||[]).map(clean).filter(Boolean).sort()]));
  const batteryFingerprint=sha({scientific_contract_hash:scientificContractHash,test_fingerprints:planned.map(x=>x.scientific_fingerprint),dependency_topology:dependencyTopology,fingerprint_version:2});
  const existing=equivalentBattery(batteryFingerprint,ctx);
  if(existing){const s=clean(existing.state||existing.status).toUpperCase();if(TERMINAL_BATTERY.has(s))return {state:'DUPLICATE_TERMINAL',battery_manifest:existing,tests:[],reused:[existing],engineering_gaps:[],science_dispatch:false,capability_creation:false,canonical_mutations:0,needs_dener:null,missing_fields:[],question:null};if(ACTIVE_BATTERY.has(s)||!s)return {state:'REUSE_EXISTING',battery_manifest:existing,tests:[],reused:[existing],engineering_gaps:[],science_dispatch:false,capability_creation:false,canonical_mutations:0,needs_dener:null,missing_fields:[],question:null};}
  return {state:'READY',battery_manifest:{battery_id:stableId('BAT-SCI',batteryFingerprint),hypothesis_ref:hypothesisId,battery_fingerprint:batteryFingerprint,fingerprint_version:2,claim_boundary:clean(hypothesis.claim_boundary),frozen:true,critical_tests:critical,dependency_topology:dependencyTopology,scientific_contract_hash:scientificContractHash},tests:planned,reused:[],engineering_gaps:[],science_dispatch:false,capability_creation:false,canonical_mutations:0,needs_dener:null,missing_fields:[],question:null};
}

export function createBatteryComposer({towerGateway,hypothesisSurface}={}){
  if(!towerGateway||!hypothesisSurface)throw new Error('BATTERY_COMPOSER_DEPENDENCY_REQUIRED');
  async function compose(hypothesisId){
    const record=await hypothesisSurface.getHypothesis(hypothesisId);
    const hypothesis=record?.source&&typeof record.source==='object'?record.source:record;
    return composeScientificBattery(hypothesis,await canonicalContext(towerGateway));
  }
  return {compose,canonicalContext:()=>canonicalContext(towerGateway)};
}

export const _internal={contractMap,keyed,canonicalContext,capabilityBinding,runnable,resolveTestContract};
