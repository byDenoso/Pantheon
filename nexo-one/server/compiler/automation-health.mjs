const text=value=>String(value??'').trim();
const upper=value=>text(value).toUpperCase();
const slug=value=>text(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const iso=value=>{const ms=Date.parse(text(value));return Number.isFinite(ms)?new Date(ms).toISOString():null;};

const ACTIVE_STATUSES=new Set(['ACTIVE','ACTIVE_PROVIDER_CONFIRMED','PASS','AVAILABLE']);
const PASS_READBACKS=new Set(['PASS','PASS_PROVIDER_ENABLED_TRUE']);
const RUN_SUCCESS=new Set(['PASS','SUCCESS','SUCCEEDED','COMPLETED','NO_OP','NOOP']);
const RUN_FAILURE=new Set(['FAIL','FAILED','FAILURE','ERROR','CANCELLED','TIMED_OUT','BLOCKED']);
const RUNNING=new Set(['RUNNING','IN_PROGRESS']);
const CONFIG_TTL_MS=24*60*60*1000;
const RUN_TTL_MS=7*24*60*60*1000;

function isLiveAutomationRow(row){
  const name=upper(row.automation),status=upper(row.status);
  if(!name.startsWith('NEXO '))return false;
  if(name.includes('LEGACY')||name.includes('RETIRED'))return false;
  if(status.includes('RETIRED')||status.includes('SUPERSEDED'))return false;
  return true;
}

function freshness(value,now,ttl){
  const observed=iso(value);
  if(!observed||!Number.isFinite(now))return 'UNKNOWN';
  const age=now-Date.parse(observed);
  if(age < -5*60*1000)return 'UNKNOWN';
  return age<=ttl?'FRESH':'STALE';
}

function runTimestamp(row){
  return row.last_run_at||row.last_run_completed_at||row.last_run_updated_at||row.last_run_started_at||null;
}
function failedReadback(value){return value==='FAIL'||value==='FAILURE'||value.startsWith('FAIL_');}

/**
 * AUTOMATION_HEALTH remains canonical ACTION_REGISTER input. This projector
 * reports operational provider health only; it never proves scientific output.
 */
export function projectAutomationHealthProviders(rows=[],{now=Date.now()}={}){
  const current=typeof now==='number'?now:Date.parse(now);
  return rows.filter(isLiveAutomationRow).map(row=>{
    const status=upper(row.status),readback=upper(row.readback),lastRun=upper(row.last_run_status);
    const checked=iso(row.last_checked),runAt=iso(runTimestamp(row));
    const configFreshness=freshness(checked,current,CONFIG_TTL_MS);
    const runFreshness=freshness(runAt,current,RUN_TTL_MS);
    const configured=ACTIVE_STATUSES.has(status);
    const readbackPass=PASS_READBACKS.has(readback);
    const runState=runFreshness==='UNKNOWN'?'UNKNOWN':runFreshness==='STALE'?'STALE':
      RUN_FAILURE.has(lastRun)?'FAILED':RUN_SUCCESS.has(lastRun)?'EXECUTED':RUNNING.has(lastRun)?'RUNNING':'UNKNOWN';
    const healthState=configFreshness==='UNKNOWN'?'UNKNOWN':configFreshness==='STALE'?'STALE':
      !configured||failedReadback(readback)?'UNAVAILABLE':
      !readbackPass?'UNKNOWN':runState==='FAILED'?'UNAVAILABLE':'AVAILABLE';
    const productiveState=runState==='FAILED'?'NO_PRODUCTIVE_OUTPUT':
      lastRun==='NO_OP'||lastRun==='NOOP'?'NOT_DEMONSTRATED':
      runState==='EXECUTED'?'UNASSESSED':'UNKNOWN';
    const successfulRunAt=runState==='EXECUTED'?runAt:null;

    return {
      id:`automation:${slug(row.automation)}`,
      label:text(row.automation),
      // The existing consumer recognizes AVAILABLE; every other value remains
      // a fail-closed provider state while exposing stale/unknown explicitly.
      status:healthState,
      healthState,
      configurationState:configFreshness==='FRESH'?(configured?'ACTIVE':'INACTIVE'):configFreshness,
      executionState:runState,
      productivityState:productiveState,
      lastSuccessAt:successfulRunAt,
      checkedAt:checked,
      revision:text(row.last_run_id)||runAt||checked||'UNREVISIONED',
      partial:false,
      count:null,
      message:[
        `health=${healthState}`,
        `configuration=${configFreshness==='FRESH'?(configured?'ACTIVE':'INACTIVE'):configFreshness}`,
        `readback=${readback||'UNKNOWN'}`,
        `execution=${runState}${lastRun?` (${lastRun})`:''}`,
        `productivity=${productiveState}`,
      ].join(' · '),
      projectionRole:'NON_AUTHORITATIVE',
      sourceRef:'ACTION_REGISTER/AUTOMATION_HEALTH'
    };
  });
}
