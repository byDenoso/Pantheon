import {createHash} from 'node:crypto';

const SAFE_NAME=/^[A-Za-z0-9_.:-]+$/;
const ROLES=new Set(['DAILY','ADVISOR','EXECUTOR','LEARNER','EMERGENT']);
const CREATABLE=new Set(['work','project','hypothesis','campaign','test_group','test','run','result','artifact']);
const PROTECTED=new Set(['id','entity_id','entity_version']);
const L4_ALLOWED_KEYS=new Set(['retry_limit','parallelism','test_budget','ranking_weights','lane_priority','promotion_threshold','quarantine_threshold','rollback_window','shadow_evaluation_cycles']);
const L5_ENTITY_KINDS=new Set(['constitution','l5','sovereign']);
const L5_RESERVED_KEYS=new Set(['human_override','authority_root','truth_owner','truth_owners','writer_authority','writer_authorities','permission_boundary','permission_boundaries','repository_permissions','tool_permissions','autonomy_ceiling','l4_allowlist','l5_rules','constitution','sovereign_layer']);

const clone=value=>structuredClone(value);
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const pad=(value,size)=>String(value).padStart(size,'0');

function eventStamp(date){
  return [
    date.getUTCFullYear(),pad(date.getUTCMonth()+1,2),pad(date.getUTCDate(),2),'T',
    pad(date.getUTCHours(),2),pad(date.getUTCMinutes(),2),pad(date.getUTCSeconds(),2),
    pad(date.getUTCMilliseconds()*1000,6),'Z'
  ].join('');
}
function safeVersion(value){
  if(!Number.isInteger(value)||value<0)throw new Error('EXPECTED_VERSION_REQUIRED');
  return value;
}
function entryValue(bundle,path){
  const entry=bundle?.files?.[path];
  if(!entry)return null;
  if(entry.encoding!=='json')throw new Error('DRIVE_BUNDLE_ENTRY_NOT_JSON:'+path);
  return clone(entry.value);
}
function putJson(bundle,path,value){
  bundle.files[path]={encoding:'json',value:clone(value)};
}
function invalid(message){const error=new Error(message);error.code='INVALID_MUTATION_REQUEST';throw error;}
function nonempty(value){return typeof value==='string'&&Boolean(value.trim());}
function proposalHash(request){
  return createHash('sha256').update(JSON.stringify({
    entity_kind:request.entity_kind??null,entity_name:request.entity_name??null,
    expected_version:request.expected_version??null,changes:request.changes??null
  },Object.keys({entity_kind:1,entity_name:1,expected_version:1,changes:1}).sort())).digest('hex');
}
function validL3Intent(value){return value&&typeof value==='object'&&['summary','reason','metric'].every(key=>nonempty(value[key]));}
function validPromotionEvidence(value){
  return value&&typeof value==='object'
    &&['baseline_ref','hypothesis_ref','metric','rollback_ref'].every(key=>nonempty(value[key]))
    &&Array.isArray(value.evidence_refs)&&value.evidence_refs.length>0&&value.evidence_refs.every(nonempty)
    &&typeof value.observed_gain==='number'&&value.observed_gain>0&&value.regression_passed===true;
}
function governance(request,entityKind,entityName,changes){
  const changedKeys=new Set(Object.keys(changes||{}));
  if(L5_ENTITY_KINDS.has(entityKind)||[...changedKeys].some(key=>L5_RESERVED_KEYS.has(key)))throw new Error('L5_BOUNDARY_HUMAN_AUTHORITY_REQUIRED');
  const raw=String(request.autonomy_level||'L0').toUpperCase();
  const declared=new Set(['L0','L1','L2','L3','L4','L5']).has(raw)?raw:'L0';
  const effective=(entityKind==='governance'&&entityName==='NEXO_RSI_POLICY')?'L4':declared;
  if(effective==='L5')throw new Error('L5_BOUNDARY_HUMAN_AUTHORITY_REQUIRED');
  if(effective==='L3'){
    if(!validL3Intent(request.l3_intent))throw new Error('L3_INTENT_REQUIRED');
    return {autonomy_level:'L3',governance_gate:'PASS_WITH_REPORT'};
  }
  if(effective!=='L4')return {autonomy_level:effective,governance_gate:'PASS'};
  if(entityKind!=='governance'||entityName!=='NEXO_RSI_POLICY')throw new Error('L4_POLICY_TARGET_NOT_ALLOWLISTED');
  const disallowed=[...changedKeys].filter(key=>!L4_ALLOWED_KEYS.has(key));
  if(disallowed.length)throw new Error('L4_POLICY_KEY_NOT_ALLOWLISTED:'+disallowed.sort().join(','));
  if(!validPromotionEvidence(request.governance_evidence))throw new Error('L4_PROMOTION_EVIDENCE_REQUIRED');
  const hash=proposalHash(request),approval=request.human_approval;
  if(!(approval&&approval.approved===true&&String(approval.approved_by||'').toUpperCase()==='HUMAN'&&nonempty(approval.approval_ref)&&approval.proposal_hash===hash))throw new Error('L4_HUMAN_APPROVAL_REQUIRED:'+hash);
  return {autonomy_level:'L4',governance_gate:'L4_HUMAN_APPROVED',proposal_hash:hash};
}

export function validateDriveMutationRequest(request={}){
  const requestId=String(request.request_id||'');
  const entityKind=String(request.entity_kind||'').toLowerCase();
  const entityName=String(request.entity_name||'');
  const writerRole=String(request.writer_role||'').toUpperCase();
  const eventType=String(request.event_type||'');
  if(!requestId||!SAFE_NAME.test(requestId))invalid('request_id must be path-safe');
  if(!entityKind||!SAFE_NAME.test(entityKind))invalid('entity_kind must be path-safe');
  if(!entityName||!SAFE_NAME.test(entityName))invalid('entity_name must be path-safe');
  if(!ROLES.has(writerRole))invalid('writer_role is not supported');
  if(!eventType||!SAFE_NAME.test(eventType))invalid('event_type must be path-safe');
  if(!request.changes||typeof request.changes!=='object'||Array.isArray(request.changes))invalid('changes must be an object');
  const expectedVersion=safeVersion(request.expected_version);
  return {requestId,entityKind,entityName,writerRole,eventType,expectedVersion};
}

export function applyDriveMutationToBundle(inputBundle,request,{now=new Date()}={}){
  if(!inputBundle||inputBundle.contract!=='NEXO_TOWER_BUNDLE_V1'||inputBundle.authority!=='TOWER_V06'||!inputBundle.files)throw new Error('DRIVE_MUTATION_BUNDLE_INVALID');
  const ids=validateDriveMutationRequest(request);
  const bundle=clone(inputBundle);
  const receiptPath='mutations/receipts/'+ids.requestId+'.json';
  const priorReceipt=entryValue(bundle,receiptPath);
  if(priorReceipt)return {bundle:inputBundle,receipt:priorReceipt,idempotent:true,changedPaths:[]};

  const entityPath='entities/'+ids.entityKind+'/'+ids.entityName+'.json';
  let current=entryValue(bundle,entityPath);
  let seeded=false;
  if(!current&&ids.expectedVersion===0&&CREATABLE.has(ids.entityKind)){
    current={id:ids.entityName,entity_version:0};
    seeded=true;
  }else if(!current&&ids.entityKind==='work'){
    const hot=entryValue(bundle,'indexes/active-work.json');
    const candidate=Array.isArray(hot?.work)?hot.work.find(item=>String(item?.id||item?.work_id||'')===ids.entityName):null;
    if(candidate)current={...candidate,id:ids.entityName,entity_version:Number.isInteger(candidate.entity_version)?candidate.entity_version:1};
  }
  if(!current)throw new Error('ENTITY_NOT_FOUND');

  const currentVersion=Number(current.entity_version||0);
  if(currentVersion!==ids.expectedVersion){
    const error=new Error('WRITE_CONFLICT_RETRY_REQUIRED');
    error.details={expected_version:ids.expectedVersion,current_version:currentVersion};
    throw error;
  }

  const changes={...request.changes};
  const governanceMeta=governance(request,ids.entityKind,ids.entityName,changes);
  if(seeded&&Object.hasOwn(changes,'id')){
    if(String(changes.id)!==ids.entityName)invalid('create identity must match entity_name');
    delete changes.id;
  }
  for(const key of PROTECTED)if(Object.hasOwn(changes,key))throw new Error('PROTECTED_FIELD_MUTATION:'+key);

  const nextVersion=currentVersion+1;
  const updated={...current,...changes,entity_version:nextVersion,writer_role:ids.writerRole};
  putJson(bundle,entityPath,updated);

  const date=now instanceof Date?now:new Date(now);
  if(Number.isNaN(date.getTime()))throw new Error('INVALID_MUTATION_TIME');
  const eventId=eventStamp(date)+'-'+digest(entityPath+'|'+ids.requestId+'|'+nextVersion).slice(0,8);
  const day=date.toISOString().slice(0,10);
  const eventPath='events/'+day+'/'+eventId+'.json';
  const event={
    event_id:eventId,
    event_type:ids.eventType,
    entity_kind:ids.entityKind,
    entity_name:ids.entityName,
    entity_version:nextVersion,
    writer_role:ids.writerRole,
    material:request.material!==false,
    storage:'GOOGLE_DRIVE_PRIVATE'
  };
  putJson(bundle,eventPath,event);

  const receipt={
    request_id:ids.requestId,
    ...governanceMeta,
    accepted:true,
    entity_version:nextVersion,
    readback:'PASS',
    event_id:eventId,
    storage:'GOOGLE_DRIVE_PRIVATE'
  };
  putJson(bundle,receiptPath,receipt);

  const snapshotPath='snapshot/latest.json';
  const snapshot=entryValue(bundle,snapshotPath);
  if(snapshot){
    snapshot.event_cursor=eventId;
    if(ids.entityKind==='work'){
      const hot=entryValue(bundle,'indexes/active-work.json');
      if(hot&&Array.isArray(hot.work)){
        const isHot=item=>{
          if(item?.cold_backlog===true)return false;
          const status=String(item?.status||'');
          return ['READY','RUNNING','CHECKPOINTED','WAIT_DEPENDENCY'].includes(status)||(status==='VERIFIED'&&item?.learning_state!=='LEARNED');
        };
        const byId=new Map(hot.work.filter(Boolean).map(item=>[String(item.id||item.work_id||''),item]));
        if(isHot(updated))byId.set(ids.entityName,updated);else byId.delete(ids.entityName);
        hot.work=[...byId.values()];
        hot.count=hot.work.length;
        hot.source='DRIVE_TOWER_HOT_SET';
        putJson(bundle,'indexes/active-work.json',hot);
        snapshot.counts={...(snapshot.counts||{}),active_work:hot.count};
      }
    }
    putJson(bundle,snapshotPath,snapshot);
  }

  const changedPaths=[entityPath,eventPath,receiptPath];
  if(entryValue(bundle,snapshotPath))changedPaths.push(snapshotPath);
  if(ids.entityKind==='work'&&entryValue(bundle,'indexes/active-work.json'))changedPaths.push('indexes/active-work.json');
  return {bundle,receipt,idempotent:false,changedPaths:[...new Set(changedPaths)]};
}

export const _internal={eventStamp,entryValue,putJson};
