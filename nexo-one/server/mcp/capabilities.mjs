import {createHash} from 'node:crypto';

const CANONICAL=Object.freeze({repository:'byDenoso/NEXO-Obsidian-Vault',ref:'main',root:'TOWER_V06'});
export const INGRESS_TYPES=Object.freeze(['SCIENTIFIC_HYPOTHESIS','ENGINEERING_OBJECTIVE','OLYMPUS_OBJECTIVE','INTERDOMAIN_CANDIDATE','SYSTEM_IMPROVEMENT']);
export const HYPOTHESIS_REQUIRED_FIELDS=Object.freeze(['hypothesis_id','proposition','claim_boundary','success_criteria','kill_criteria','critical_tests','max_adaptive_followups','reopen_policy']);
const ABSORBING=new Set(['FALSIFIED','RETIRED']);
const ACTIVE_TEST_STATES=new Set(['RUNNING','RESERVED','DISPATCHED','PENDING_DISPATCH']);
const ACTIVE_RUN_STATES=new Set(['RUNNING','RESERVED','DISPATCHED','PENDING','IN_PROGRESS']);
const TERMINAL_RESULT_STATES=new Set(['VERIFIED','VALIDATED','DONE','COMPLETED','TERMINAL','PASS','FAIL','INCONCLUSIVE']);
const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase();
const arr=value=>Array.isArray(value)?value:[];
const section=(snapshot,name)=>arr(snapshot?.sections?.[name]);
const first=(row,names)=>{for(const name of names){const value=row?.[name];if(value!==undefined&&value!==null&&text(value)!=='')return value;}return undefined;};
const idOf=(row,names)=>text(first(row,names));
const norm=value=>text(value).toLocaleLowerCase().replace(/\s+/g,' ');
const stable=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hasValue=value=>Array.isArray(value)?value.length>0:(value!==undefined&&value!==null&&text(value)!=='');

function hypothesisRow(row){
  const id=idOf(row,['hypothesis_id','id','record_id']);
  return {id,proposition:text(first(row,['proposition','question','title'])),status:upper(first(row,['status','state']))||'OPEN',priority:first(row,['priority']),expectedInformationGain:first(row,['expected_information_gain','expectedInformationGain']),programId:text(first(row,['program_id','programId'])),domain:text(first(row,['domain'])),claimBoundary:first(row,['claim_boundary','claimBoundary']),source:row};
}
function testRow(row){return {id:idOf(row,['test_id','id','record_id','work_id']),hypothesisId:idOf(row,['hypothesis_id','hypothesisId']),status:upper(first(row,['status','state'])),owner:text(first(row,['lease_owner','owner','execution_owner'])),resultRef:text(first(row,['result_ref','resultRef'])),source:row};}
function runRow(row){return {id:idOf(row,['run_id','id','record_id']),testId:idOf(row,['test_id','testId']),status:upper(first(row,['status','state'])),owner:text(first(row,['lease_owner','owner','executor'])),source:row};}

export function buildNexoBootstrap(snapshot,{mutationAvailable=false}={}){
  return {
    contract:'NEXO_CAPABILITY_MCP_V1',
    canonical:{...CANONICAL},
    sourceModifiedAt:snapshot?.sourceModifiedAt||null,
    ingressTypes:[...INGRESS_TYPES],
    mutationAvailable:Boolean(mutationAvailable),
    scientificLoop:'RESULT -> HYPOTHESIS_RECONCILIATION -> CLAIM_UPDATE_OR_NO_CHANGE -> NEXT_TEST_OR_TERMINALIZE -> READBACK',
    chatContract:{
      firstCalls:['get_capabilities','get_nexo_bootstrap'],
      truthRule:'Tower is canonical; MCP is capability and projection only.',
      ingressRule:'Normalize user intent, dedupe, then persist through governed canonical ingress when mutation capability is available.',
      noMemoryDependency:true
    }
  };
}

export function buildCapabilities({mutationAvailable=false}={}){
  return {
    contract:'NEXO_CAPABILITY_MCP_V1',
    canonical:{...CANONICAL},
    mutationAvailable:Boolean(mutationAvailable),
    domains:['SCIENCE','ENGINEERING','OLYMPUS','INTERDOMAIN','SYSTEM'],
    ingressTypes:[...INGRESS_TYPES],
    principles:['TOWER_CANONICAL','FAIL_CLOSED_WRITES','NO_PARALLEL_DATABASE','NO_SCHEDULER_CREATION','MCP_DOES_NOT_JUDGE_SCIENTIFIC_TRUTH']
  };
}

export function buildHypothesisRegistry(snapshot){
  const items=section(snapshot,'HYPOTHESIS').map(hypothesisRow).filter(item=>item.id);
  return {contract:'NEXO_HYPOTHESIS_REGISTRY_VIEW_V1',items,total:items.length};
}

export function buildHypothesisFrontier(snapshot){
  const items=buildHypothesisRegistry(snapshot).items.filter(item=>!ABSORBING.has(item.status));
  items.sort((a,b)=>Number(b.priority??0)-Number(a.priority??0)||Number(b.expectedInformationGain??0)-Number(a.expectedInformationGain??0)||a.id.localeCompare(b.id));
  return {contract:'NEXO_HYPOTHESIS_FRONTIER_VIEW_V1',items,total:items.length,excludedStatuses:[...ABSORBING]};
}

export function getHypothesis(snapshot,id){
  const hypothesis=buildHypothesisRegistry(snapshot).items.find(item=>item.id===text(id))||null;
  if(!hypothesis)return {hypothesis:null,tests:[],results:[],claims:[],readbacks:[]};
  const linked=row=>idOf(row,['hypothesis_id','hypothesisId'])===hypothesis.id;
  return {hypothesis,tests:section(snapshot,'TEST').filter(linked),results:section(snapshot,'RESULT').filter(linked),claims:section(snapshot,'CLAIM').filter(linked),readbacks:section(snapshot,'READBACK').filter(linked)};
}

export function validateFrozenContract(candidate={}){
  const normalized={...candidate,hypothesis_id:first(candidate,['hypothesis_id','id']),proposition:first(candidate,['proposition','question'])};
  const missing=HYPOTHESIS_REQUIRED_FIELDS.filter(field=>!hasValue(normalized[field]));
  return {contract:'HYPOTHESIS_LIFECYCLE_V1',valid:missing.length===0,missing,required:[...HYPOTHESIS_REQUIRED_FIELDS]};
}

export function buildExecutionFrontier(snapshot){
  const activeTests=section(snapshot,'TEST').map(testRow).filter(item=>item.id&&ACTIVE_TEST_STATES.has(item.status));
  const activeRuns=section(snapshot,'RUN').map(runRow).filter(item=>item.id&&ACTIVE_RUN_STATES.has(item.status));
  return {contract:'NEXO_EXECUTION_FRONTIER_VIEW_V1',activeTests,activeRuns,activeCount:Math.max(activeTests.length,activeRuns.length)};
}

function resultId(row){return idOf(row,['result_id','id','record_id']);}
function linkedByResultOrTest(row,result,testId,hypothesisId){
  const rr=idOf(row,['result_id','resultId','result_ref','resultRef']);
  const tr=idOf(row,['test_id','testId','test_ref','testRef']);
  const hr=idOf(row,['hypothesis_id','hypothesisId']);
  return (rr&&rr===result)||(tr&&tr===testId)||(hr&&hr===hypothesisId);
}
function hasReconciliation(snapshot,result,testId,hypothesisId){
  const candidates=[...section(snapshot,'HYPOTHESIS_RECONCILIATION'),...section(snapshot,'EVENT')];
  return candidates.some(row=>linkedByResultOrTest(row,result,testId,hypothesisId)&&(/RECONCIL/i.test(text(first(row,['kind','event_type','type','action'])))||hasValue(first(row,['reconciliation','hypothesis_transition','hypothesis_status_after']))));
}
function hasClaimDecision(snapshot,result,testId,hypothesisId){
  return section(snapshot,'CLAIM').some(row=>linkedByResultOrTest(row,result,testId,hypothesisId))||section(snapshot,'EVENT').some(row=>linkedByResultOrTest(row,result,testId,hypothesisId)&&/(CLAIM_UPDATE|NO_CLAIM_CHANGE)/i.test(text(first(row,['kind','event_type','type','decision']))));
}
function hasNextDecision(snapshot,result,testId,hypothesisId){
  return section(snapshot,'EVENT').some(row=>linkedByResultOrTest(row,result,testId,hypothesisId)&&/(NEXT_TEST|TERMINALIZE)/i.test(text(first(row,['kind','event_type','type','decision','next_action']))))||section(snapshot,'RESULT').some(row=>resultId(row)===result&&hasValue(first(row,['next_test','terminalize','next_action','terminal_reason'])));
}
function hasReadback(snapshot,result,testId,hypothesisId){return section(snapshot,'READBACK').some(row=>linkedByResultOrTest(row,result,testId,hypothesisId));}

export function buildResultClosureStatus(snapshot){
  const items=section(snapshot,'RESULT').filter(row=>TERMINAL_RESULT_STATES.has(upper(first(row,['status','state'])))).map(row=>{
    const rid=resultId(row),testId=idOf(row,['test_id','testId']),hypothesisId=idOf(row,['hypothesis_id','hypothesisId']);
    const checks={HYPOTHESIS_RECONCILIATION:hasReconciliation(snapshot,rid,testId,hypothesisId),CLAIM_UPDATE_OR_NO_CHANGE:hasClaimDecision(snapshot,rid,testId,hypothesisId),NEXT_TEST_OR_TERMINALIZE:hasNextDecision(snapshot,rid,testId,hypothesisId),READBACK:hasReadback(snapshot,rid,testId,hypothesisId)};
    const missing=Object.entries(checks).filter(([,ok])=>!ok).map(([key])=>key);
    return {resultId:rid,testId,hypothesisId,status:upper(first(row,['status','state'])),closed:missing.length===0,missing};
  });
  return {contract:'NEXO_SCIENTIFIC_LOOP_CLOSURE_V1',items,total:items.length,open:items.filter(item=>!item.closed).length};
}

export function dedupeCandidate(snapshot,candidate={}){
  const kind=upper(candidate.kind||candidate.origin_type||'SCIENTIFIC_HYPOTHESIS');
  const needle=norm(candidate.proposition||candidate.goal||candidate.title||candidate.question);
  const pools=kind==='SCIENTIFIC_HYPOTHESIS'?section(snapshot,'HYPOTHESIS'):[...section(snapshot,'WORK'),...section(snapshot,'OBJECTIVE')];
  const match=pools.find(row=>{
    const value=norm(first(row,['proposition','goal','title','question']));
    return needle&&value===needle;
  });
  return {duplicate:Boolean(match),matchId:match?idOf(match,['hypothesis_id','objective_id','work_id','id','record_id']):null,kind,normalized:needle};
}

export function makeHypothesisEntity(input={}){
  const proposition=text(input.proposition||input.question);
  const hypothesis_id=text(input.hypothesis_id)||`HYP-${stable({proposition:norm(proposition),origin:text(input.origin||'USER')}).slice(0,20).toUpperCase()}`;
  return {...input,hypothesis_id,proposition,status:upper(input.status)||'OPEN',origin:text(input.origin)||'USER',authority:text(input.authority)||'USER_DIRECTED'};
}

export function makeObjectiveEntity(input={}){
  const type=upper(input.objective_type||input.kind||'ENGINEERING_OBJECTIVE');
  if(!INGRESS_TYPES.includes(type)||type==='SCIENTIFIC_HYPOTHESIS')throw new Error('OBJECTIVE_TYPE_INVALID');
  const goal=text(input.goal||input.title||input.question);if(!goal)throw new Error('OBJECTIVE_GOAL_REQUIRED');
  const objective_id=text(input.objective_id)||`OBJ-${stable({type,goal:norm(goal),origin:text(input.origin||'USER')}).slice(0,20).toUpperCase()}`;
  return {...input,objective_id,objective_type:type,goal,status:upper(input.status)||'OPEN',origin:text(input.origin)||'USER'};
}

export function mutationEnvelope(operation,entityType,entity){
  return {contract:'NEXO_CAPABILITY_INGRESS_V1',operation,mode:'MERGE_EXTEND_SUPERSEDE_CREATE',entity_type:entityType,entity,require_readback:true,fingerprint:stable({operation,entityType,entity})};
}
