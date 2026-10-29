import {createTrustedLearnerProducerJobs} from '../retrieval/producer-jobs.mjs';
import {SOURCE_PRODUCER_GATE} from '../retrieval/sync-route.mjs';
import {sha256} from '../retrieval/integrity.mjs';

const restart=new Set(['JOB_CURSOR_INVALID','JOB_CURSOR_CONFLICT','JOB_CANCELLED_RESTART','JOB_SOURCE_CHANGED_RESTART','JOB_HEAD_CHANGED_RESTART','IMPORTED_GENERATION_STALE','VIEW_VALIDITY_EXPIRED','VIEW_EXPIRED']);
/** One bounded cache-construction step per capability call. No caller-controlled
 * source/role/cursor, no canonical write and no access outside the current grant.
 */
export async function advanceGrantedReadIndex({request,env,binding,authorize,clock=Date.now}) {
  if(env.NEXO_ATLAS_RETRIEVAL_PRODUCER!==SOURCE_PRODUCER_GATE)return {status:'INDEX_UNAVAILABLE',ready:false,reason:'INDEX_REFRESH_DISABLED',canonical_source_writes:false};
  const a=await authorize(),key=await sha256(JSON.stringify([a.subject,a.session_id,a.session_epoch,a.role,a.policy]));
  const db=env.DB.withSession('first-primary'),lease=crypto.randomUUID(),now=clock();
  const row=await db.prepare(`INSERT INTO retrieval_automatic_jobs(owner_scope,cursor,lease_id,lease_expires_at) VALUES(?,NULL,?,?)
    ON CONFLICT(owner_scope) DO UPDATE SET lease_id=excluded.lease_id,lease_expires_at=excluded.lease_expires_at
    WHERE retrieval_automatic_jobs.lease_expires_at<=? RETURNING cursor`).bind(key,lease,now+120000,now).first();
  if(!row)return {status:'INDEX_REFRESHING',ready:false,phase:'another_verified_request',retry_after_ms:1000,canonical_source_writes:false};
  try {
    const jobs=createTrustedLearnerProducerJobs({db:env.DB,driveBinding:binding,enabled:true,authorize});
    const progress=row.cursor?await jobs.resume(row.cursor):await jobs.start();
    await db.prepare('UPDATE retrieval_automatic_jobs SET cursor=? WHERE owner_scope=? AND lease_id=?').bind(progress.done?null:progress.cursor,key,lease).run();
    return {status:'INDEX_REFRESHING',ready:false,phase:progress.done?'ready_retry':progress.phase,
      staged_shards:progress.staged_shards??0,verified_shards:progress.verified_shards??0,
      retry_after_ms:progress.done?0:250,next_tool:'nexo_capabilities',canonical_source_writes:false};
  }catch(error){
    if(!restart.has(error?.message))throw error;
    await db.prepare('UPDATE retrieval_automatic_jobs SET cursor=NULL WHERE owner_scope=? AND lease_id=?').bind(key,lease).run();
    return {status:'INDEX_REFRESHING',ready:false,phase:'source_changed_restart',retry_after_ms:500,next_tool:'nexo_capabilities',canonical_source_writes:false};
  }finally{
    await db.prepare('UPDATE retrieval_automatic_jobs SET lease_expires_at=0 WHERE owner_scope=? AND lease_id=?').bind(key,lease).run();
  }
}
