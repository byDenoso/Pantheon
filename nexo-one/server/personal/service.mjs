import {readProvider} from '../adapters/registry.mjs';
import {gmailDraftCapability,calendarEventCapability} from '../adapters/google.mjs';
import {compile} from '../compiler/world-state.mjs';
import {executeCapabilityAware,stableFingerprint} from '../execution/capability-fabric.mjs';
import {createNexoSheetStores} from '../execution/nexo-sheet-store.mjs';
import {createNexoSheetTransport} from '../execution/nexo-sheet-transport.mjs';
import {buildPersonalModel,classifyPersonalProposal,proposePersonalActions,reconcilePersonalFollowUps} from './loop.mjs';

export const PERSONAL_CAPABILITY_IDS=Object.freeze({
  nexoTask:'CAP-PERSONAL-NEXO-TASK',
  nexoCommitment:'CAP-PERSONAL-NEXO-COMMITMENT',
  gmailDraft:'CAP-PERSONAL-GMAIL-DRAFT',
  calendarEvent:'CAP-PERSONAL-CALENDAR-EVENT'
});

const capability=(capability_id,operation,risk_level,provider)=>Object.freeze({capability_id,domain:'PERSONAL',operation,context:'NEXO',execution_context:'NEXO',runtime:'NEXO',status:'PASS',risk_level,provider,cost_weight:0,fingerprint:stableFingerprint({capability_id,operation,risk_level,provider,version:'PERSONAL_LOOP_V1'})});
export const PERSONAL_CAPABILITIES=Object.freeze([
  capability(PERSONAL_CAPABILITY_IDS.nexoTask,'personal.task.upsert','L3','nexo'),
  capability(PERSONAL_CAPABILITY_IDS.nexoCommitment,'personal.commitment.upsert','L3','nexo'),
  capability(PERSONAL_CAPABILITY_IDS.gmailDraft,'gmail.draft.create','L4','gmail'),
  capability(PERSONAL_CAPABILITY_IDS.calendarEvent,'calendar.event.create','L4','calendar')
]);

const ACTIONS=Object.freeze({
  UPSERT_NEXO_TASK:{operation:'personal.task.upsert',capabilityId:PERSONAL_CAPABILITY_IDS.nexoTask},
  UPSERT_NEXO_COMMITMENT:{operation:'personal.commitment.upsert',capabilityId:PERSONAL_CAPABILITY_IDS.nexoCommitment},
  CREATE_GMAIL_DRAFT:{operation:'gmail.draft.create',capabilityId:PERSONAL_CAPABILITY_IDS.gmailDraft},
  CREATE_CALENDAR_EVENT:{operation:'calendar.event.create',capabilityId:PERSONAL_CAPABILITY_IDS.calendarEvent}
});

const text=value=>String(value??'').trim();
const semanticInput=input=>input&&typeof input==='object'&&!Array.isArray(input)?input:null;
export function personalActionFingerprint(proposal={}){
  return `PAF-${stableFingerprint({kind:text(proposal.kind),entity_ids:[...(proposal.entity_ids||[])].map(text).filter(Boolean).sort(),input:semanticInput(proposal.input)}).slice(0,40)}`;
}

export async function buildPersonalSnapshot({env=process.env,now=Date.now(),reader=readProvider}={}){
  const ids=['gmail','calendar','drive','nexo'];
  const results=await Promise.all(ids.map(id=>reader(id,{env,now,access:'PRIVATE'})));
  const world=compile(results,{now,access:'PRIVATE'}),model=buildPersonalModel(world,{now});
  return {version:'PERSONAL_LOOP_V1',generatedAt:new Date(now).toISOString(),providers:world.providers,worldFingerprint:world.fingerprint,model,proposals:proposePersonalActions(model,{now}),followUps:reconcilePersonalFollowUps(model,[],{now})};
}

function sameRecord(expected,actual){
  if(!actual)return false;
  for(const key of ['id','kind','title','status','due_at'])if(expected?.[key]!=null&&String(actual?.[key]??'')!==String(expected[key]))return false;
  return true;
}

function nexoPersonalAdapter(personalRecords){
  return {mutating:true,target:'nexo',
    async execute({input}){const result=await personalRecords.upsert(input);return {providerObjectId:`${String(input.kind).toLowerCase()}:${input.id}`,writeVerified:result.verified};},
    async readback({input,providerResult}){const result=await personalRecords.get(input.kind,input.id),verified=sameRecord(input,result?.payload);return {verified,providerObjectId:providerResult?.providerObjectId||`${String(input.kind).toLowerCase()}:${input.id}`,receiptRef:verified?`nexo:${String(input.kind).toLowerCase()}:${input.id}`:null,fingerprint:verified?stableFingerprint(result.payload):null};}
  };
}

function defaultRuntime({env,now,signal}={}){
  const transport=createNexoSheetTransport({env,signal}),stores=createNexoSheetStores({now,transport});
  return {capabilities:PERSONAL_CAPABILITIES,effectLedger:stores.effectLedger,executionRuns:stores.executionRuns,adapters:{
    [PERSONAL_CAPABILITY_IDS.nexoTask]:nexoPersonalAdapter(stores.personalRecords),
    [PERSONAL_CAPABILITY_IDS.nexoCommitment]:nexoPersonalAdapter(stores.personalRecords),
    [PERSONAL_CAPABILITY_IDS.gmailDraft]:gmailDraftCapability({env,signal}),
    [PERSONAL_CAPABILITY_IDS.calendarEvent]:calendarEventCapability({env,signal})
  }};
}

export async function executePersonalAction({env=process.env,now=new Date().toISOString(),signal,proposal={},approval=null,actor='PERSONAL_LOOP',runtime=null}={}){
  const decision=classifyPersonalProposal(proposal),config=ACTIONS[text(proposal.kind)];
  if(decision.policy==='DENY')throw new Error('PERSONAL_ACTION_DENIED');
  if(!config)throw new Error('PERSONAL_ACTION_NOT_EXECUTABLE');
  const fingerprint=personalActionFingerprint(proposal);
  if(proposal.fingerprint&&proposal.fingerprint!==fingerprint)throw new Error('STALE_PROPOSAL');
  if(decision.policy==='APPROVAL_REQUIRED'&&!approval)return {status:'APPROVAL_REQUIRED',policy_level:decision.level,proposal_fingerprint:fingerprint};
  if(decision.policy==='APPROVAL_REQUIRED'&&(approval?.approved!==true||text(approval?.proposal_fingerprint)!==fingerprint))throw new Error('APPROVAL_MISMATCH');
  const input=semanticInput(proposal.input);if(!input)throw new Error('PERSONAL_ACTION_INPUT_REQUIRED');
  const at=new Date(now).toISOString();
  const rt=runtime||defaultRuntime({env,now:at,signal}),writeToken=`PWT-${stableFingerprint({fingerprint,actor,at}).slice(0,32)}`;
  const action={action_id:`ACT-PERSONAL-${stableFingerprint({fingerprint}).slice(0,24)}`,domain:'PERSONAL',lease_owner:actor,lease_until:new Date(Date.parse(at)+120000).toISOString(),write_token:writeToken,proposal_fingerprint:fingerprint,policy_level:decision.level};
  return executeCapabilityAware({action,requiredOperation:config.operation,context:'NEXO',input,capabilities:rt.capabilities||PERSONAL_CAPABILITIES,eligibleRuntimes:['NEXO'],adapters:rt.adapters,effectLedger:rt.effectLedger,executionRuns:rt.executionRuns,actor,writeToken,now:at});
}
