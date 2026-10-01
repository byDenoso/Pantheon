// Public Tower summaries only. Never derive assignment, ACK or resolution here:
// the canonical Tower verifier owns those decisions. Unknown/private fields do
// not cross the API, MCP or UI projection boundary.
const arr=value=>Array.isArray(value)?value:[];
const text=value=>typeof value==='string'?value.trim():'';
const roles=new Set(['DAILY','ADVISOR','EXECUTOR','LEARNER','EMERGENT','REFUTADOR','GUARDIAO','NONE']);
const role=value=>roles.has(value)?value:null;
const states=new Set(['OBSERVED','PREREGISTERED','REVIEWING','CONFIRMED','REFUTED','CANARY','ROLLED_BACK','CLOSED']);
const reasons=new Set(['INPUT_PROVENANCE_INCOMPLETE','RECIPE_BINDING_MISSING','RECIPE_OR_SMOKE_MISSING','RECIPE_OR_SMOKE_INVALID','INDEPENDENT_EVALUATORS_UNAVAILABLE','RUNNER_ARTIFACT_EXECUTOR_UNAVAILABLE','PRE_RESULT_TEMPORAL_ORDER_UNRESOLVED','EMPTY_FRONTIER_ACTIVE_ROADMAP','READY_INPUTS_NOT_MATERIALIZED']);
const actions=new Set(['LINK_EXISTING_WORK','COMPLETE_RECOVERY','VERIFY_INCIDENT_CRITERION','RESOLVED']);
const ownership=new Set(['ACCEPTED','ASSIGNED_UNACCEPTED','UNRECORDED']);
const validation=new Set(['PENDING','EVIDENCE_REQUIRED','REVALIDATION_REQUIRED','PREREQUISITES_VALIDATED']);
const ids=value=>arr(value).map(text).filter(Boolean);
const publicRow=row=>row&&typeof row==='object'&&!row.private&&text(row.visibility).toUpperCase()!=='PRIVATE'&&!/(OLYMPUS|CLIENT|PERSON|PRIVATE)/i.test([row.thread_id,row.domain,row.semantic?.domain_id].map(text).join(' '));

function operational(row){
  if(!publicRow(row)||row?.policy!=='INCIDENT_OPERATIONS_V1'||!['UNLINKED','OPEN','RESOLVED'].includes(row.state)||!actions.has(row.next_action_code)||row.scientific_effect!=='NONE')return undefined;
  // A partially hidden/malformed recovery cannot retain a visible resolution.
  if(!Array.isArray(row.items)||row.items.some(item=>!publicRow(item)||!text(item.work_id)||!ownership.has(item.ownership_state)||!validation.has(item.validation_state)))return undefined;
  if(!Array.isArray(row.work_ids)||row.work_ids.length!==row.items.length||new Set(row.work_ids).size!==row.items.length||row.items.some(item=>!row.work_ids.includes(item.work_id)))return undefined;
  if(row.state==='RESOLVED'&&(!row.items.length||row.resolution_scope!=='EXECUTION_PREREQUISITES'||row.items.some(item=>item.validation_state!=='PREREQUISITES_VALIDATED')))return undefined;
  if(row.state==='UNLINKED'&&row.items.length||row.state==='OPEN'&&!row.items.length||row.state!=='RESOLVED'&&row.resolution_scope!=null)return undefined;
  if((row.state==='RESOLVED')!==(row.next_action_code==='RESOLVED'))return undefined;
  const items=row.items.map(item=>({
    work_id:text(item.work_id),test_id:text(item.test_id)||null,
    current_owner:role(item.current_owner),assigned_to:role(item.assigned_to),
    ownership_state:ownership.has(item.ownership_state)?item.ownership_state:'UNRECORDED',
    accepted:item.accepted===true&&item.ownership_state==='ACCEPTED',
    validation_state:validation.has(item.validation_state)?item.validation_state:'PENDING'
  })).filter(item=>item.work_id);
  return {policy:row.policy,state:row.state,work_ids:ids(row.work_ids).filter(id=>items.some(item=>item.work_id===id)),items,
    suggested_owner:role(row.suggested_owner),reason_code:reasons.has(row.reason_code)?row.reason_code:'OTHER',
    next_action_code:row.next_action_code,resolution_scope:row.resolution_scope==='EXECUTION_PREREQUISITES'?row.resolution_scope:null,scientific_effect:'NONE'};
}

export function publicIncidentSummaries(evolution){
  return arr(evolution?.incidents).filter(publicRow).map(row=>{
    const out={incident_id:text(row.incident_id),state:states.has(row.state)?row.state:'',
      evidence_count:Number.isInteger(row.evidence_count)&&row.evidence_count>=0?row.evidence_count:0,
      public_ids:{tests:ids(row.public_ids?.tests),hypotheses:ids(row.public_ids?.hypotheses),lessons:ids(row.public_ids?.lessons)},next_owner:role(row.next_owner)||''};
    // These are the Tower's reviewed public copy, never raw signal/cause text.
    for(const key of ['summary_plain','summary_pt','since','missing'])if(text(row[key]))out[key]=text(row[key]);
    if(states.has(row.learning_state))out.learning_state=row.learning_state;
    if(role(row.learning_next_owner))out.learning_next_owner=role(row.learning_next_owner);
    const op=operational(row.operational);if(op)out.operational=op;
    return out;
  }).filter(row=>row.incident_id);
}
