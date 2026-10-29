/** Fixed-LEARNER, least-scope, resumable trusted producer. No HTTP route. */
import {readCanonicalDriveTowerBytes,readCanonicalDriveRevision,validateImportedDriveRevision} from '../drive-source.mjs';
import {readSource,importDocuments,authorizedView,digest} from './source-producer.mjs';
import {prepareView,emitView,assertCurrentView} from './view-builder.mjs';
import {storePayloads,stageContentShards,finishContentBuild,rawPayload} from './content-store.mjs';
import {publishGeneration} from './import.mjs';
import {verifyGenerationStep} from './verify-step.mjs';
import {canonical} from './python-json.mjs';
import {assert,sha256,utf8,TOWER_ID,POLICY,instant} from './integrity.mjs';
import {JOB_PRODUCER_SHA256} from './job-bindings.mjs';
const ROLE='LEARNER',JOB_SCHEMA='NEXO_PRIVATE_LEARNER_JOB_V1';
const snapshotAuth=a=>Object.freeze(Object.fromEntries(['authorized','owner','pin_valid','subject','session_id','session_epoch','role','policy','now'].map(k=>[k,a?.[k]])));
function validAuth(a){assert(a.authorized===true&&a.owner===true&&a.pin_valid===true&&a.role===ROLE&&a.policy===POLICY&&['subject','session_id','session_epoch'].every(k=>typeof a[k]==='string'&&a[k]),'AUTHORIZATION_REQUIRED');instant(a.now);}
const authIdentity=a=>[a.subject,a.session_id,a.session_epoch,a.role,a.policy];
function bounded(db){const stats={statements:0};const count=n=>{assert(stats.statements+n<=30,'SCOPED_JOB_SQL_BOUND');stats.statements+=n;};function stmt(s){return {_native:s,bind(...args){return stmt(s.bind(...args));},first(...a){count(1);return s.first(...a);},all(...a){count(1);return s.all(...a);},run(...a){count(1);return s.run(...a);}};}return {stats,prepare(q){return stmt(db.prepare(q));},batch(rows){count(rows.length);return db.batch(rows.map(r=>r._native));}};}
const headSQL='SELECT h.generation,g.manifest_sha256,g.manifest_json,g.state FROM retrieval_heads h JOIN retrieval_generations g ON g.generation=h.generation WHERE h.source_id=? AND h.role=? AND h.policy=?';
async function head(db){const row=await db.prepare(headSQL).bind(TOWER_ID,ROLE,POLICY).first();if(row){assert(row.state==='verified'&&await sha256(row.manifest_json)===row.manifest_sha256,'SOURCE_HEAD_INTEGRITY_INVALID');row.manifest=JSON.parse(row.manifest_json);}return row;}
async function sourceAliases(db,m){if(!m)return {aliases:[],excluded_aliases:[],documents:[],reference_fields:{}};assert(m.scope_policy==='fixed-learner-minimal-alias-v1'&&Array.isArray(m.source_alias_parts),'SOURCE_ALIAS_MIGRATION_REQUIRED');const values={current:[],excluded:[]};
 for(let offset=0;offset<m.source_alias_parts.length;offset+=32){const parts=m.source_alias_parts.slice(offset,offset+32),rows=await db.prepare('SELECT content_sha256,encoding,payload FROM retrieval_payloads WHERE content_sha256 IN (SELECT value FROM json_each(?))').bind(JSON.stringify(parts.map(p=>p.sha256))).all(),byHash=new Map(rows.results.map(r=>[r.content_sha256,r]));for(const part of parts){assert(['current','excluded'].includes(part.kind),'SOURCE_ALIAS_PART_INVALID');const row=byHash.get(part.sha256);assert(row,'SOURCE_ALIAS_PART_MISSING');const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await rawPayload(row))).data;assert(data.kind===part.kind&&data.part===part.part&&Array.isArray(data.aliases)&&data.aliases.every(a=>typeof a==='string'),'SOURCE_ALIAS_PART_INVALID');values[part.kind].push(...data.aliases);}}
 assert(await digest(values.current)===m.source_alias_hashes.current&&await digest(values.excluded)===m.source_alias_hashes.excluded,'SOURCE_ALIAS_SCOPE_INVALID');return {aliases:values.current,excluded_aliases:values.excluded,documents:[],reference_fields:{}};
}
async function aliasParts(source){const rows=[],parts=[];for(const [kind,aliases]of [['current',source.aliases],['excluded',source.excluded_aliases]])for(let n=0;n<aliases.length;n+=512){const part=n/512,payload=utf8(canonical({data:{kind,part,aliases:aliases.slice(n,n+512)}})),hash=await sha256(payload);assert(payload.length<1_500_000,'SOURCE_ALIAS_PART_BOUND');rows.push({content_sha256:hash,encoding:'json',payload});parts.push({kind,part,sha256:hash});}assert(parts.length<=64,'SOURCE_ALIAS_PART_COUNT_BOUND');return {rows,parts,hashes:{current:await digest(source.aliases),excluded:await digest(source.excluded_aliases)}};}
async function writeJob(db,state,oldCursor){const cursor=crypto.randomUUID(),json=JSON.stringify(state),hash=await sha256(json);assert(utf8(json).length<500_000,'SCOPED_JOB_STATE_BOUND');
 if(oldCursor){const result=await db.prepare('UPDATE retrieval_scope_jobs SET cursor=?,previous_cursor=?,state_json=?,state_sha256=? WHERE cursor=?').bind(cursor,oldCursor,json,hash,oldCursor).run();assert(result.meta.changes===1,'JOB_CURSOR_CONFLICT');}
 else await db.prepare('INSERT INTO retrieval_scope_jobs(cursor,previous_cursor,state_json,state_sha256) VALUES(?,NULL,?,?)').bind(cursor,json,hash).run();return cursor;
}
/** Only opaque cursor is accepted by resume. Authority and all source selection
 * are fixed server inputs. The internal SQL cap is30; parent routes must count
 * their own fresh authorization/session reads in the complete HTTP budget. */
export function createTrustedLearnerProducerJobs({db:baseDb,driveBinding,authorize,enabled=false,allowSyntheticFixtures=false,readBytes=readCanonicalDriveTowerBytes,readRevision=readCanonicalDriveRevision,checkRevision=validateImportedDriveRevision}){
 async function run(cursor=null){
  assert(enabled===true,'SCOPED_PRODUCER_DISABLED');assert(typeof authorize==='function'&&typeof baseDb?.withSession==='function','TRUSTED_PRODUCER_REQUIRED');
  assert(allowSyntheticFixtures===true||(readBytes===readCanonicalDriveTowerBytes&&readRevision===readCanonicalDriveRevision&&checkRevision===validateImportedDriveRevision),'FIXED_DRIVE_READER_REQUIRED');
  assert(cursor===null||typeof cursor==='string'&&/^[a-f0-9-]{36}$/.test(cursor),'OPAQUE_JOB_CURSOR_REQUIRED');
  const db=bounded(baseDb.withSession('first-primary')),before=snapshotAuth(await authorize());validAuth(before);const authHash=await digest(authIdentity(before));
  let state=null,retry=false;
  if(cursor){const row=await db.prepare('SELECT * FROM retrieval_scope_jobs WHERE cursor=? OR previous_cursor=?').bind(cursor,cursor).first();assert(row&&await sha256(row.state_json)===row.state_sha256,'JOB_CURSOR_INVALID');state=JSON.parse(row.state_json);assert(state.schema===JOB_SCHEMA&&state.job_code_sha256===JOB_PRODUCER_SHA256&&state.auth_hash===authHash,'JOB_AUTHORIZATION_CHANGED');retry=row.cursor!==cursor;if(retry)cursor=row.cursor;}
  const initial=await head(db),expected=state?state.expected_head:(initial?.generation??null);
  const check=async manifest=>{await checkRevision(driveBinding,manifest);const h=await head(db);assert((h?.generation??null)===expected||h?.generation===manifest.generation,'JOB_HEAD_CHANGED_RESTART');const a=snapshotAuth(await authorize());validAuth(a);assert(await digest(authIdentity(a))===authHash,'JOB_AUTHORIZATION_CHANGED');assertCurrentView(manifest,a.now);return a;};
  if(state){assert(state.phase!=='cancelled','JOB_CANCELLED_RESTART');assert(state.fixture_only===allowSyntheticFixtures,'JOB_MODE_CHANGED');
    const manifest=JSON.parse(state.manifest_json);try{await check(manifest);}catch(error){state.phase='cancelled';state.failure='SOURCE_AUTH_OR_VALIDITY_CHANGED';await writeJob(db,state,cursor);throw error;}
    if(state.phase==='done'||initial?.generation===state.generation)return {done:true,generation:state.generation,statements:db.stats.statements};
    if(retry)return {done:false,cursor,phase:state.phase,staged_shards:state.staged,verified_shards:state.verified??0,statements:db.stats.statements};
  }else{
    const revision=await readRevision(driveBinding);
    if(initial?.manifest.job_code_sha256===JOB_PRODUCER_SHA256&&initial.manifest.transport?.revision_id===revision.id&&initial.manifest.transport?.size===revision.size&&instant(initial.manifest.validity_start)<=instant(before.now)&&instant(before.now)<instant(initial.manifest.validity_end)){await check(initial.manifest);return {done:true,generation:initial.generation,statements:db.stats.statements};}
  }
  if(!state||state.phase==='staging'){
    const previous=await sourceAliases(db,initial?.manifest);let {raw,transport}=await readBytes(driveBinding),snapshot=await readSource(raw,{transport,fixtureOnly:allowSyntheticFixtures});
    if(initial)assert(snapshot.source_sha256===initial.manifest.snapshot.source_sha256||instant(snapshot.observed_at)>instant(initial.manifest.snapshot.observed_at),'SOURCE_OBSERVATION_NOT_MONOTONIC');
    let source=await importDocuments(snapshot,{previous,recordCache:{get(){return null;},set(){}}});snapshot=null;raw=null;
    let view=await authorizedView(source,{role:ROLE,now:before.now});const prepared=await prepareView(view),aliases=await aliasParts(source);source=null;view=null;
    const generation=await digest([prepared.generation,JOB_PRODUCER_SHA256,aliases.hashes]);prepared.generation=generation;prepared.manifest={...prepared.manifest,generation,job_code_sha256:JOB_PRODUCER_SHA256,scope_policy:'fixed-learner-minimal-alias-v1',source_alias_parts:aliases.parts,source_alias_hashes:aliases.hashes};
    if(state)assert(state.generation===generation,'JOB_SOURCE_CHANGED_RESTART');
    else {await storePayloads(db,aliases.rows);state={schema:JOB_SCHEMA,job_code_sha256:JOB_PRODUCER_SHA256,auth_hash:authHash,fixture_only:allowSyntheticFixtures,expected_head:expected,generation,phase:'staging',staged:0,verified:0,verify_cursor:null};}
    let ordinal=0,staged=state.staged,pending=[],pendingBytes=2,pendingLast=staged,paused=false;
    async function flush(){if(!pending.length)return;if(db.stats.statements>22){paused=true;pending=[];pendingBytes=2;return;}const json='['+pending.join(',')+']';assert(utf8(json).length<1_750_000,'STAGING_BATCH_BOUND');await db.prepare('INSERT INTO retrieval_scope_stage_inbox(generation,payload_json) VALUES(?,?)').bind(generation,json).run();staged=pendingLast;pending=[];pendingBytes=2;}
    const receipt=await emitView(prepared,async rows=>{for(const row of rows){ordinal++;if(ordinal<=state.staged||paused)continue;assert(row.encoding==='json','SCOPED_STAGE_ENCODING_INVALID');const item=JSON.stringify({family:row.family,key:row.lookup_key,sha:row.content_sha256,payload:new TextDecoder('utf-8',{fatal:true}).decode(row.payload)}),bytes=utf8(item).length+1;assert(bytes<1_700_000,'SCOPED_STAGE_ROW_BOUND');if(pendingBytes+bytes>=1_700_000)await flush();if(paused)continue;pending.push(item);pendingBytes+=bytes;pendingLast=ordinal;}},{contentAddressed:true,compress:false,batchSize:1000});await flush();
    if(state.manifest_sha256)assert(state.manifest_sha256===receipt.manifestHash,'JOB_MANIFEST_CHANGED');state.manifest_json=receipt.manifestJson;state.manifest_sha256=receipt.manifestHash;state.staged=staged;state.documents=prepared.view.documents.length;state.chunks=prepared.view.chunks.length;state.total=receipt.manifest.shard_count+256;
    await check(receipt.manifest);
    if(staged===state.total)state.phase='linking';
  }else if(state.phase==='linking'){
    await finishContentBuild(db,{generation:state.generation,manifest:JSON.parse(state.manifest_json),manifestJson:state.manifest_json,manifestHash:state.manifest_sha256});state.phase='verifying';await check(JSON.parse(state.manifest_json));
  }else if(state.phase==='verifying'){
    const result=await verifyGenerationStep(db,{generation:state.generation,manifestHash:state.manifest_sha256,cursor:state.verify_cursor,maxPages:6});state.verify_cursor=result.cursor;state.verified=result.verified_shards;if(result.done)state.phase='publishing';await check(JSON.parse(state.manifest_json));
  }else if(state.phase==='publishing'){
    const manifest=JSON.parse(state.manifest_json);await check(manifest);await publishGeneration(db,{generation:state.generation,manifestHash:state.manifest_sha256,role:ROLE,expectedGeneration:state.expected_head});await check(manifest);state.phase='done';
  }else throw Error('JOB_PHASE_INVALID');
  const next=await writeJob(db,state,cursor);const finalAuth=snapshotAuth(await authorize());validAuth(finalAuth);assert(await digest(authIdentity(finalAuth))===authHash,'JOB_AUTHORIZATION_CHANGED');assertCurrentView(JSON.parse(state.manifest_json),finalAuth.now);return {done:state.phase==='done',...state.phase==='done'?{generation:state.generation}:{cursor:next},phase:state.phase,staged_shards:state.staged,verified_shards:state.verified,documents:state.documents,chunks:state.chunks,statements:db.stats.statements};
 }
 return {start:()=>run(null),resume:cursor=>run(cursor)};
}
