import {VerifiedD1View} from './storage.mjs';
import {searchCurrentView,validateRequest} from './search.mjs';
import {traceView,validateTraceRequest} from './graph.mjs';
import {assert,TOWER_ID,POLICY,instant} from './integrity.mjs';
import {SEARCH_POLICY} from './query-router.mjs';

const authKey=a=>JSON.stringify([a.subject,a.session_id,a.session_epoch,a.role,a.policy]);
function snapshotAuth(a) {
  return Object.freeze({authorized:a?.authorized,pin_valid:a?.pin_valid,owner:a?.owner,
    subject:a?.subject,session_id:a?.session_id,session_epoch:a?.session_epoch,
    role:a?.role,policy:a?.policy,now:a?.now});
}
function validateAuth(a) {
  assert(a&&a.authorized===true&&a.pin_valid===true&&a.owner===true&&typeof a.subject==='string'&&a.subject&&
    typeof a.session_id==='string'&&a.session_id&&typeof a.session_epoch==='string'&&a.session_epoch&&
    typeof a.role==='string'&&a.role&&a.policy===POLICY,'AUTHORIZATION_REQUIRED');
  instant(a.now);
}
function validateTime(m,now) {
  const at=instant(now);assert(instant(m.validity_start)<=at&&at<instant(m.validity_end),'VIEW_VALIDITY_EXPIRED');
}
/**
 * Disabled by default; the browser route supplies current owner/PIN policy.
 * authorize must resolve owner+PIN/session+role from trusted server policy on EACH call.
 * checkSource must use request-scoped fixed read-only Drive access and compare the
 * imported transport revision/size. Revocation/error/change must throw; no fallback.
 */
export function createTrustedRetrievalAdapter({db,enabled=false,authorize,checkSource,allowSyntheticFixtures=false,operation='search'}) {
  assert(['search','trace','neighbors','capabilities'].includes(operation),'UNSUPPORTED_RETRIEVAL_OPERATION');
  return async function search(input) {
    assert(enabled===true,'RETRIEVAL_COMPONENT_DISABLED');
    if(operation==='search')validateRequest(input);else if(operation==='capabilities')assert(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).length===0,'UNSUPPORTED_RETRIEVAL_OPTIONS');else validateTraceRequest(input,operation);
    assert(typeof authorize==='function'&&typeof checkSource==='function','TRUSTED_ADAPTER_REQUIRED');
    const before=snapshotAuth(await authorize());validateAuth(before);const beforeKey=authKey(before);
    assert(typeof db.withSession==='function','PRIMARY_SESSION_REQUIRED');
    const primary=db.withSession('first-primary');
    const head=await primary.prepare(`SELECT h.generation,g.manifest_sha256 FROM retrieval_heads h
      JOIN retrieval_generations g ON g.generation=h.generation WHERE h.source_id=? AND h.role=? AND h.policy=?`)
      .bind(TOWER_ID,before.role,POLICY).first();assert(head,'AUTHORIZED_INDEX_UNAVAILABLE');
    const view=await VerifiedD1View.open(primary,head.generation,head.manifest_sha256),m=view.manifest;
    assert(m.role===before.role,'ROLE_BINDING_INVALID');
    assert(m.fixture_only!==true||allowSyntheticFixtures===true,'OFFLINE_FIXTURE_ONLY');
    // Historical views are tested offline only; current service cannot choose them.
    assert(m.snapshot.source_sha256===m.authorization_source_sha256&&m.snapshot.revision===m.authorization_revision,'HISTORICAL_VIEW_UNSUPPORTED');
    validateTime(m,before.now);await checkSource(m);
    let result;
    if(operation==='capabilities'){await view.metadata();result={status:'AUTHENTICATED',roles:[before.role],source_mode:'DRIVE_REVISION_VERIFIED_PRIVATE_SCOPED_D1',source:{...m.snapshot},authorization_revision:m.authorization_revision,engine_version:m.engine_version,policy:m.policy,search_policy:SEARCH_POLICY,read_only:true,writes_enabled:false,validity_start:m.validity_start,validity_end:m.validity_end,supported_tools:['nexo_capabilities','nexo_search','nexo_neighbors','nexo_trace'],search_modes:['auto','exact','lexical'],historical_queries:false,arbitrary_filters:false,external_model_calls:false,connection_scope:'this_authenticated_runtime_only',other_runtimes_authorized:false};}
    else result=operation==='search'?await searchCurrentView(view,input):await traceView(view,input,operation);
    await checkSource(m);
    const finalHead=await db.withSession('first-primary').prepare('SELECT generation FROM retrieval_heads WHERE source_id=? AND role=? AND policy=?')
      .bind(TOWER_ID,before.role,POLICY).first();assert(finalHead?.generation===head.generation,'GENERATION_CHANGED_DURING_QUERY');
    // Make authorization the final asynchronous read. A revocation during the
    // final head lookup must not occur after our last session validation.
    const after=snapshotAuth(await authorize());validateAuth(after);
    assert(beforeKey===authKey(after),'AUTHORIZATION_CHANGED_DURING_QUERY');validateTime(m,after.now);
    return result;
  };
}

/** Retained named entry point; never silently widens the lexical-only contract. */
export function createTrustedLexicalAdapter(options) {
  const run=createTrustedRetrievalAdapter(options);
  return input=>{assert((input?.mode??'lexical')==='lexical','UNSUPPORTED_RETRIEVAL_MODE');return run({...input,mode:'lexical'});};
}
