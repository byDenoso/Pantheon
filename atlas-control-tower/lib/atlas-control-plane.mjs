import {randomUUID} from 'node:crypto';

const ACTIONS=new Set(['SYNC','RECONCILE','EXECUTE','RECOVER','VALIDATE']);
const TERMINAL_WORK=new Set(['DONE','VERIFIED','REJECTED','FAILED','SUPERSEDED']);
const DEPENDENCY_SUCCESS=new Set(['DONE','VERIFIED']);
const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase();
const revision=work=>work&&Number.isInteger(Number(work.entity_version))?`work:${text(work.id||work.work_id)}@v${Number(work.entity_version)}`:null;
const correlation=(action,target)=>`ATLAS-${action}-${text(target)||'SYSTEM'}-${randomUUID()}`;

function baseEnvelope(action,target){
  return {
    request_id:`ATLAS-REQ-${randomUUID()}`,
    action,
    target:text(target)||'TOWER_V06',
    requested_at:new Date().toISOString(),
    acceptance:'accepted',
    execution_id:null,
    state:'PENDING',
    before_revision:null,
    after_revision:null,
    evidence:[],
    blocker:null,
    readback:null,
  };
}

function rejected(action,target,reason,detail=null){
  return {...baseEnvelope(action,target),acceptance:'rejected',state:'REJECTED',blocker:{reason,...(detail?{detail}:{})}};
}

function mutationEvidence(result){
  const evidence=[];
  if(result?.request_id)evidence.push({kind:'mutation_request',id:result.request_id});
  if(result?.receipt)evidence.push({kind:'mutation_receipt',value:result.receipt});
  return evidence;
}

async function reconcileWork(semantic,workId){
  const work=await semantic.getWork(workId);
  const status=upper(work.status);
  const before=revision(work);
  if(TERMINAL_WORK.has(status))return {transition:'NO_TRANSITION',reason:'ALREADY_TERMINAL',before,readback:work};

  if(status==='WAIT_DEPENDENCY'){
    const dependencyIds=Array.isArray(work.dependency_ids)?work.dependency_ids.map(text).filter(Boolean):[];
    if(!dependencyIds.length)return {transition:'NO_TRANSITION',reason:'DEPENDENCY_SET_MISSING',before,readback:work};
    const pending=[];
    for(const dependencyId of dependencyIds){
      try{const dependency=await semantic.getWork(dependencyId);if(!DEPENDENCY_SUCCESS.has(upper(dependency.status)))pending.push(dependencyId);}
      catch{pending.push(dependencyId);}
    }
    if(pending.length)return {transition:'NO_TRANSITION',reason:'DEPENDENCY_PENDING',pending_dependency_ids:pending,before,readback:work};
    const targetRole=upper(work.resume_role||work.owner_role||'EXECUTOR');
    const result=await semantic.mutateWork({
      work,
      event_type:'WORK_WAKE_REQUESTED',
      correlation_id:correlation('RECONCILE',workId),
      writer_role:'LEARNER',
      discriminator:'resume',
      changes:{status:'READY',owner_role:targetRole,dependency_state:'RESOLVED',resolved_dependency_ids:dependencyIds},
    });
    return {transition:'RESUME',reason:'DEPENDENCIES_RESOLVED',before,result,readback:result.readback};
  }

  if(status==='CHECKPOINTED'&&work.closure_ready===true){
    const result=await semantic.transitionWork('complete',{
      work_id:workId,
      expected_version:Number(work.entity_version||0),
      writer_role:'LEARNER',
      correlation_id:correlation('RECONCILE',workId),
      details:{closure_reconciler:'EXPLICIT_CLOSURE_READY'},
    });
    return {transition:'COMPLETE',reason:'EXPLICIT_CLOSURE_READY',before,result,readback:result.readback};
  }

  return {transition:'NO_TRANSITION',reason:'NO_MACHINE_CLOSURE_CONDITION',before,readback:work};
}

async function recoverWork(semantic,workId){
  const work=await semantic.getWork(workId);
  if(upper(work.status)!=='CHECKPOINTED')return {rejected:true,reason:'INVALID_RECOVERY_STATE',readback:work,before:revision(work)};
  const writerRole=upper(work.owner_role||'EXECUTOR');
  const result=await semantic.transitionWork('start',{
    work_id:workId,
    expected_version:Number(work.entity_version||0),
    writer_role:writerRole,
    correlation_id:correlation('RECOVER',workId),
    details:{recovery_policy:'RECOVER_BEFORE_RECREATE'},
  });
  return {before:revision(work),result,readback:result.readback};
}

export function createAtlasControlPlane({semantic}){
  if(!semantic)throw new Error('SEMANTIC_GATEWAY_REQUIRED');

  async function execute(input={}){
    const action=upper(input.action),target=text(input.target||input.work_id||input.run_id);
    if(!ACTIONS.has(action))return rejected(action||'UNKNOWN',target,'ACTION_NOT_ALLOWED');
    const envelope=baseEnvelope(action,target);

    if(action==='SYNC'){
      const control=await semantic.getState();
      return {...envelope,state:'COMPLETE',readback:control,evidence:[{kind:'canonical_control',truth_owner:control.truth_owner||null,write_model:control.write_model||null}]};
    }

    if(action==='EXECUTE'){
      if(!target)return rejected(action,target,'TARGET_REQUIRED');
      const result=await semantic.runWork({work_id:target,correlation_id:correlation(action,target),...(input.capability_id?{capability_id:input.capability_id}:{}),data_bounded:Boolean(input.data_bounded)});
      return {...envelope,execution_id:result.run_id||null,state:upper(result.status)||'ACCEPTED',evidence:result.launch_commit?[{kind:'launch_commit',id:result.launch_commit}]:[],readback:null};
    }

    if(action==='VALIDATE'){
      if(!target)return rejected(action,target,'TARGET_REQUIRED');
      const report=await semantic.readback(target);
      if(!report)return {...envelope,execution_id:target,state:'PENDING',blocker:{reason:'READBACK_PENDING'}};
      const evidence=[];
      const ids=[report.evidence_id,...(Array.isArray(report.evidence_ids)?report.evidence_ids:[])].map(text).filter(Boolean);
      for(const id of [...new Set(ids)])evidence.push({kind:'runtime_evidence',id});
      return {...envelope,execution_id:target,state:upper(report.status||report.outcome)||'COMPLETE',readback:report,evidence};
    }

    if(action==='RECOVER'){
      if(!target)return rejected(action,target,'TARGET_REQUIRED');
      const recovered=await recoverWork(semantic,target);
      if(recovered.rejected)return {...envelope,acceptance:'rejected',state:'REJECTED',before_revision:recovered.before,after_revision:recovered.before,blocker:{reason:recovered.reason},readback:recovered.readback};
      return {...envelope,state:'COMPLETE',before_revision:recovered.before,after_revision:revision(recovered.readback),evidence:mutationEvidence(recovered.result),readback:recovered.readback};
    }

    if(action==='RECONCILE'){
      if(!target)return rejected(action,target,'TARGET_REQUIRED');
      const reconciled=await reconcileWork(semantic,target);
      const result=reconciled.result||null;
      return {...envelope,state:'COMPLETE',before_revision:reconciled.before,after_revision:revision(reconciled.readback),evidence:[{kind:'reconcile',transition:reconciled.transition,reason:reconciled.reason},...mutationEvidence(result)],readback:reconciled.readback,blocker:reconciled.reason==='DEPENDENCY_PENDING'?{reason:reconciled.reason,pending_dependency_ids:reconciled.pending_dependency_ids}:null};
    }

    return rejected(action,target,'ACTION_NOT_IMPLEMENTED');
  }

  return {execute};
}

export const _internal={ACTIONS,TERMINAL_WORK,DEPENDENCY_SUCCESS,revision};
