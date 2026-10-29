import {createTrustedLearnerProducerJobs} from './producer-jobs.mjs';
import {retrievalAuthorization,RETRIEVAL_GATE} from './route.mjs';

export const SOURCE_PRODUCER_GATE='fixed-learner-current-index-v13';
const invalid=new Set(['INVALID_SYNC_REQUEST','OPAQUE_JOB_CURSOR_REQUIRED']);
const authorization=new Set(['AUTHORIZATION_REQUIRED','AUTHORIZATION_CHANGED_DURING_BUILD','AUTHORIZATION_CHANGED_DURING_QUERY','JOB_AUTHORIZATION_CHANGED']);
const stale=new Set(['JOB_CURSOR_INVALID','JOB_CURSOR_CONFLICT','JOB_CANCELLED_RESTART','JOB_SOURCE_CHANGED_RESTART','JOB_HEAD_CHANGED_RESTART','IMPORTED_GENERATION_STALE','VIEW_VALIDITY_EXPIRED','VIEW_EXPIRED','SOURCE_OBSERVATION_NOT_MONOTONIC']);
const safe=new Set([...invalid,...authorization,...stale,'SCOPED_PRODUCER_DISABLED','SCOPED_JOB_SQL_BOUND','SOURCE_ALIAS_MIGRATION_REQUIRED','CONNECTOR_LIST_FILE_REVISIONS_FAILED','CONNECTOR_FETCH_FAILED','TOWER_READ_RACE']);
const sourceStatuses=new Set(['reauthentication_required','connector_access_disabled','request_context_expired','binding_unavailable','tool_not_allowed','tool_not_found','rate_limited','upstream_error','tool_error','internal_error','invalid_request']);

/** Only the verified browser owner/PIN session can build its scientific view.
 * The request chooses no source, role, clock, policy, data or target generation.
 * This updates a rebuildable private projection; it cannot write to Drive.
 */
export async function sourceSyncRoute(request,env,body,binding,clock=Date.now) {
  if(env.NEXO_ATLAS_RETRIEVAL!==RETRIEVAL_GATE||env.NEXO_ATLAS_RETRIEVAL_PRODUCER!==SOURCE_PRODUCER_GATE)
    return {status:503,body:{error:'SCOPED_PRODUCER_DISABLED',available:false}};
  try {
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='cursor'))throw new Error('INVALID_SYNC_REQUEST');
    if(Object.hasOwn(body,'cursor')&&(typeof body.cursor!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.cursor)))throw new Error('OPAQUE_JOB_CURSOR_REQUIRED');
    const jobs=createTrustedLearnerProducerJobs({db:env.DB,driveBinding:binding,enabled:true,
      authorize:()=>retrievalAuthorization(request,env,clock())});
    const result=Object.hasOwn(body,'cursor')?await jobs.resume(body.cursor):await jobs.start();
    return {status:200,body:result};
  }catch(error){const code=safe.has(error?.message)?error.message:'SOURCE_INDEX_UNAVAILABLE';
    return {status:invalid.has(code)?400:authorization.has(code)?401:stale.has(code)?409:503,
      body:{error:code,available:false,...sourceStatuses.has(error?.connectorStatus)?{connectorStatus:error.connectorStatus}:{}}};}
}
