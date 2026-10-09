/** Read-only projection of an already verified Tower. Never grants dispatch or changes science. */
const TERMINAL = new Set(['DONE','VERIFIED','CLOSED','CANCELLED','ARCHIVED','REJECTED','SUPERSEDED']);
const RUNNING = new Set(['RUNNING','DISPATCHED','IN_PROGRESS','CHECKPOINTED']);
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = (x, limit = 600) => typeof x === 'string' ? x.slice(0,limit) : '';
const array = x => Array.isArray(x) ? x : [];
const status = x => text(x?.status || x?.state || 'UNKNOWN',80).toUpperCase();
const error = code => { throw Object.assign(new Error(code),{code}); };
const list = (tower,prefix) => Object.entries(tower.files).filter(([p,e]) => p.startsWith(prefix) && p.endsWith('.json') && object(e?.value))
  .map(([path,entry]) => ({path,value:entry.value}));
const idOf = (value,path) => text(value.id || value.test_id || value.work_id || value.roadmap_id || path.split('/').pop().slice(0,-5),200);
function rowOf({path,value},roadmaps) {
  const kind = path.startsWith('entities/test/') ? 'TEST' : 'WORK';
  const raw = status(value), roadmapId = text(value.roadmap_id,200), roadmap = roadmaps.get(roadmapId);
  const readiness = object(value.readiness) ? value.readiness : {};
  const reasons = array(readiness.reasons).map(x=>text(x,160)).filter(Boolean);
  const explicitHuman = value.human_gate === true || value.human_gate?.required === true || value.decision_required === true
    || ['AWAITING_HUMAN','WAIT_HUMAN','WAITING_HUMAN'].includes(raw);
  const readinessRecorded = readiness.policy === 'SCIENTIFIC_INTEGRITY_V1' && typeof readiness.eligible === 'boolean';
  let lane = 'PREPARATION', next = 'PREPARE_OR_REPAIR';
  if (roadmap && status(roadmap) === 'CLOSED') {lane='CLOSED_CAMPAIGN';next='PRESERVE_CLOSURE';}
  else if (['ARCHIVED','REJECTED','SUPERSEDED','CANCELLED'].includes(raw)) {lane='TERMINAL';next='NONE';}
  else if (RUNNING.has(raw)) {lane='RUN_FOLLOWUP';next='RECONCILE_RUN_OR_COMPATIBLE_CHECKPOINT';}
  else if (explicitHuman) {lane='DECISION';next='RESOLVE_EXPLICIT_DECISION';}
  else if (kind === 'TEST' && ['DONE','VERIFIED','RESULT'].includes(raw)) {lane='REVIEW';next='VERIFY_INDEPENDENT_REVIEW_AND_CONSOLIDATION';}
  else if (kind === 'WORK' && TERMINAL.has(raw)) {lane='TERMINAL';next='NONE';}
  else if (readinessRecorded && readiness.eligible && value.recipe && object(value.recipe_params)) {
    lane='ADMISSION_CANDIDATE';next='CHECK_CURRENT_IDENTITY_AVAILABILITY_AND_BUDGET';
  }
  else if (reasons.length || /^BLOCKED|^WAIT/.test(raw)) {lane='REPAIR';next='RESOLVE_RECORDED_DEPENDENCY';}
  return {id:idOf(value,path),kind,source_path:path,canonical_status:raw,lane,
    owner:text(value.owner_role || value.owner || value.assignee,100) || null,
    campaign_id:text(value.campaign_id,200) || null,roadmap_id:roadmapId || null,
    test_id:text(value.test_id || (kind === 'TEST' ? value.id : ''),200) || null,
    title:text(value.question || value.title || value.semantic?.display_name || value.summary,360),
    blocker:text(value.blocker) || reasons.join(', ') || null,reasons,
    next_action:text(value.next_action) || next,next_action_origin:value.next_action?'SOURCE':'TRIAGE_SUGGESTION',
    updated_at:text(value.updated_at || value.last_updated || value.created_at,80) || null,
    recipe:text(value.recipe,100) || null,readiness_recorded:readinessRecorded,
    recorded_eligible:readinessRecorded?readiness.eligible:null,
    dispatch_authorized:false,evidence_scope:'DISCOVERY_ONLY_CURRENT_ADMISSION_REQUIRED'};
}
function receiptRows(tower) {
  const grouped = new Map();
  for (const {path,value} of list(tower,'operations/receipts/')) {
    if (!value.intent_id) continue;
    const key = String(value.intent_id), timestamp = String(value.occurred_at || value.observed_at || '');
    const row = {id:key,source_path:path,receipt_id:text(value.receipt_id,200),outcome:text(value.outcome,80),
      payload_sha256:text(value.payload_sha256,80),result_revision:text(value.result_revision,80) || null,
      reason:text(value.reason_code),updated_at:timestamp,retry_condition:text(value.retry_condition),
      evidence_scope:'CANONICAL_RECEIPT_NOT_INDEPENDENT_ENTITY_READBACK'};
    const previous = grouped.get(key);
    if (!previous || timestamp > previous.updated_at) grouped.set(key,row);
    else if (timestamp === previous.updated_at && (row.outcome !== previous.outcome || row.payload_sha256 !== previous.payload_sha256)) {
      grouped.set(key,{...previous,outcome:'CONFLICT_REQUIRES_RECONCILIATION'});
    }
  }
  return [...grouped.values()];
}
export function projectOperations(tower,{view='work',limit=30,cursor=null,owner=null}={}) {
  if (!object(tower?.files) || tower.contract !== 'NEXO_TOWER_LIVE_V1' || tower.storage !== 'GOOGLE_DRIVE_PRIVATE'
      || tower.stable_file_id !== '1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z'
      || tower.authority !== 'TOWER_V06' || tower.truth_owner !== 'TOWER_V06@GOOGLE_DRIVE_PRIVATE'
      || !/^sha256:[a-f0-9]{64}$/.test(tower.revision || '') || tower.revision !== tower.state_fingerprint) error('CANONICAL_TOWER_INVALID');
  if (!['work','campaigns','receipts'].includes(view) || !Number.isInteger(limit) || limit<1 || limit>100
      || (owner !== null && (typeof owner !== 'string' || !/^[A-Z_]{2,40}$/.test(owner)))) error('OPERATIONAL_QUERY_INVALID');
  let offset = 0;
  if (cursor) {
    if (typeof cursor !== 'string' || cursor.length>1024) error('OPERATIONAL_CURSOR_INVALID');
    let decoded; try {decoded=JSON.parse(Buffer.from(cursor,'base64url'));} catch {error('OPERATIONAL_CURSOR_INVALID');}
    if (!object(decoded) || decoded.view !== view || decoded.owner !== owner || !Number.isInteger(decoded.offset) || decoded.offset<0) error('OPERATIONAL_CURSOR_INVALID');
    if (decoded.revision !== tower.revision) error('OPERATIONAL_CURSOR_STALE');
    offset=decoded.offset;
  }
  const campaigns=list(tower,'roadmaps/'), roadmaps=new Map(campaigns.map(({path,value})=>[idOf(value,path),value]));
  let rows;
  if (view === 'work') rows=[...list(tower,'entities/test/'),...list(tower,'entities/work/')].map(row=>rowOf(row,roadmaps));
  else if (view === 'receipts') rows=receiptRows(tower);
  else rows=campaigns.map(({path,value})=>({id:idOf(value,path),source_path:path,canonical_status:status(value),
    question:text(value.question || value.scientific_question),
    stop_criteria:value.stop_conditions || value.stop_rules || value.stop_criteria || value.termination_criteria || null,
    budget_ref:text(value.budget_ref || value.charter_ref,200) || null,
    contract_ref:text(value.contract_ref || value.prereg_ref,200) || null,
    decision_needed:status(value)==='PROPOSED',dispatch_authorized:false}));
  // Only scalar/short-array stop criteria go to the view. No raw contract/budget dump.
  if (view === 'campaigns') rows=rows.map(row=>({...row,stop_criteria:typeof row.stop_criteria==='string'
    ?text(row.stop_criteria):Array.isArray(row.stop_criteria)?row.stop_criteria.slice(0,12).map(x=>typeof x==='string'?text(x):'STRUCTURED_CRITERION_SEE_SOURCE')
      :row.stop_criteria?'STRUCTURED_CRITERION_SEE_SOURCE':null}));
  if (owner) rows=rows.filter(row=>row.owner===owner);
  rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:String(a.source_path).localeCompare(String(b.source_path)));
  if(offset>rows.length) error('OPERATIONAL_CURSOR_INVALID');
  const counts={};for(const row of rows){const key=row.lane || row.outcome || row.canonical_status;counts[key]=(counts[key]||0)+1;}
  const items=rows.slice(offset,offset+limit),hasMore=offset+items.length<rows.length;
  return {contract:'NEXO_OPERATIONAL_FRONTIER_V1',access:'PRIVATE',source_revision:tower.revision,
    source_updated_at:tower.updated_at || null,view,owner,coverage:'COMPLETE_CANONICAL_COLLECTION',
    projection_only:true,dispatch_authorized:false,total_count:rows.length,counts,items,has_more:hasMore,
    next_cursor:hasMore?Buffer.from(JSON.stringify({revision:tower.revision,view,owner,offset:offset+items.length})).toString('base64url'):null,
    autonomy_proof:{status:'NOT_ATTESTED_BY_THIS_VIEW',required_real_hours:168},
    note:'READY labels, receipts and software tests do not independently authorize execution or prove scientific closure.'};
}
