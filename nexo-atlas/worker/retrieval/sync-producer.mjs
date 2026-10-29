/** Disabled trusted orchestration. Invoked only from reviewed server code, never
 * browser fields. Canonical Drive is read-only. Existing D1 is the derived store.
 */
import {PRODUCER_SHA256} from './producer-bindings.mjs';
import {readCanonicalDriveTowerBytes,readCanonicalDriveRevision,validateImportedDriveRevision} from '../drive-source.mjs';
import {readSource,importDocuments,authorizedView,PRODUCER_VERSION} from './source-producer.mjs';
import {prepareView,emitView,assertCurrentView} from './view-builder.mjs';
import {D1SourceRecordCache,stageContentShards,finishContentBuild,storePayloads,rawPayload} from './content-store.mjs';
import {verifyGeneration,publishGeneration} from './import.mjs';
import {canonical,parsePythonJSON} from './python-json.mjs';
import {assert,sha256,instant,TOWER_ID,POLICY,ENGINE_CONFIG} from './integrity.mjs';
const authSnapshot=a=>Object.freeze(Object.fromEntries(['authorized','owner','pin_valid','subject','session_id','session_epoch','role','policy','now'].map(k=>[k,a?.[k]])));
function authValid(a){assert(a.authorized===true&&a.owner===true&&a.pin_valid===true&&['subject','session_id','session_epoch','role'].every(k=>typeof a[k]==='string'&&a[k])&&a.policy===POLICY,'AUTHORIZATION_REQUIRED');instant(a.now);}
const authId=a=>canonical([a.subject,a.session_id,a.session_epoch,a.role,a.policy]);
const PARTS=['records','documents','aliases','excluded_aliases','edges','unresolved_by_uid','reference_fields'];
const OBJECT_PARTS=new Set(['unresolved_by_uid','reference_fields']);
async function loadObservation(db){
 const row=await db.prepare('SELECT o.* FROM retrieval_source_heads h JOIN retrieval_source_observations o ON o.observation_id=h.observation_id WHERE h.source_id=?').bind(TOWER_ID).first();if(!row)return null;
 assert(await sha256(row.manifest_json)===row.manifest_sha256,'SOURCE_OBSERVATION_HASH_INVALID');const value=parsePythonJSON(row.manifest_json);
 assert(value.schema==='NEXO_PRIVATE_SOURCE_OBSERVATION_V1'&&value.snapshot.source_id===TOWER_ID&&value.producer_version===PRODUCER_VERSION&&value.config===ENGINE_CONFIG,'SOURCE_OBSERVATION_BINDING_INVALID');
 const arrays=Object.fromEntries(PARTS.map(k=>[k,[]])),seen=new Set();
 for(let n=0;n<value.parts.length;n+=32){const wanted=value.parts.slice(n,n+32),rows=await db.prepare('SELECT content_sha256,encoding,payload FROM retrieval_payloads WHERE content_sha256 IN (SELECT value FROM json_each(?))').bind(JSON.stringify(wanted.map(p=>p.sha256))).all(),map=new Map(rows.results.map(r=>[r.content_sha256,r]));
  for(const part of wanted){assert(PARTS.includes(part.family)&&Number.isInteger(part.part)&&part.part>=0&&!seen.has(part.family+':'+part.part),'SOURCE_OBSERVATION_PART_INVALID');seen.add(part.family+':'+part.part);const row=map.get(part.sha256);assert(row,'SOURCE_OBSERVATION_PART_MISSING');const bytes=await rawPayload(row),data=parsePythonJSON(new TextDecoder('utf-8',{fatal:true}).decode(bytes));assert(data.family===part.family&&data.part===part.part&&Array.isArray(data.data),'SOURCE_OBSERVATION_PART_INVALID');arrays[part.family].push(...data.data);}
 }
 for(const k of PARTS)value[k]=OBJECT_PARTS.has(k)?Object.fromEntries(arrays[k]):arrays[k];
 return {...value,observation_id:row.observation_id};
}
async function storeObservation(db,generation,previous,producerHash){
  const snapshot=Object.fromEntries(['revision','source_id','source_sha256','observed_at','transport','fixture_only'].map(k=>[k,generation.snapshot[k]]));
  const value={producer_version:PRODUCER_VERSION,producer_sha256:producerHash,config:ENGINE_CONFIG,snapshot,records:generation.records,documents:generation.documents.map(d=>Object.fromEntries(['uid','object_id','path','content_hash','state','allowed_roles'].map(k=>[k,d[k]]))),aliases:generation.aliases,excluded_aliases:generation.excluded_aliases,edges:generation.edges,unresolved_by_uid:generation.unresolved_by_uid,reference_fields:generation.reference_fields};
  const parts=[],payloads=[];
  for(const family of PARTS){const rows=OBJECT_PARTS.has(family)?Object.entries(value[family]):value[family];for(let start=0;start<rows.length;start+=128){const part=start/128,payload=new TextEncoder().encode(canonical({family,part,data:rows.slice(start,start+128)})),sha=await sha256(payload);assert(payload.length<1_500_000,'SOURCE_OBSERVATION_PART_BOUND');parts.push({family,part,sha256:sha});payloads.push({content_sha256:sha,encoding:'json',payload});}}
  for(let n=0;n<payloads.length;n+=100)await storePayloads(db,payloads.slice(n,n+100));
  const header={schema:'NEXO_PRIVATE_SOURCE_OBSERVATION_V1',producer_version:PRODUCER_VERSION,producer_sha256:producerHash,config:ENGINE_CONFIG,snapshot,parts};
  const json=canonical(header),hash=await sha256(json),id=await sha256(canonical([snapshot.source_sha256,snapshot.transport,producerHash]));
  await db.prepare('INSERT INTO retrieval_source_observations(observation_id,manifest_sha256,manifest_json) VALUES(?,?,?) ON CONFLICT(observation_id) DO NOTHING').bind(id,hash,json).run();
  const old=await db.prepare('SELECT manifest_sha256,manifest_json FROM retrieval_source_observations WHERE observation_id=?').bind(id).first();assert(old?.manifest_sha256===hash&&old.manifest_json===json,'SOURCE_OBSERVATION_CONFLICT');
  const result=previous?await db.prepare('UPDATE retrieval_source_heads SET observation_id=? WHERE source_id=? AND observation_id=?').bind(id,TOWER_ID,previous.observation_id).run():await db.prepare('INSERT INTO retrieval_source_heads(source_id,observation_id) VALUES(?,?) ON CONFLICT(source_id) DO NOTHING').bind(TOWER_ID,id).run();
  if(result.meta.changes!==1){const head=await db.prepare('SELECT observation_id FROM retrieval_source_heads WHERE source_id=?').bind(TOWER_ID).first();assert(head?.observation_id===id,'SOURCE_HEAD_CAS_CONFLICT');}
  return id;
}
async function hydrate(observation,cache){const documents=[],chunks=[];for(let offset=0;offset<observation.records.length;offset+=32){const keys=observation.records.slice(offset,offset+32),records=await cache.getMany(keys);for(const key of keys){const record=records.get(key);assert(record,'SOURCE_RECORD_MISSING');documents.push(record.document);chunks.push(...record.chunks);}}return {...observation,documents,chunks};}
function budgetDatabase(db,limit=900){const stats={statements:0};function count(n=1){assert(stats.statements+n<=limit,'PRODUCER_INVOCATION_BUDGET_REQUIRES_RESUME');stats.statements+=n;}function wrap(stmt){return {_native:stmt,bind(...args){return wrap(stmt.bind(...args));},first(...args){count();return stmt.first(...args);},all(...args){count();return stmt.all(...args);},run(...args){count();return stmt.run(...args);}};}return {stats,prepare(sql){return wrap(db.prepare(sql));},batch(rows){count(rows.length);return db.batch(rows.map(r=>r._native));}};}

/** Server-provided authorize returns fresh owner+PIN+policy role. Browser/client
 * never supplies role, source, clock, revision, expected head, or trust pins. */
export function createTrustedSourceProducer({db:baseDb,driveBinding,enabled=false,authorize,producerHash=PRODUCER_SHA256,allowSyntheticFixtures=false,readBytes=readCanonicalDriveTowerBytes,readRevision=readCanonicalDriveRevision,checkRevision=validateImportedDriveRevision}){
  return async function synchronize(){
    assert(enabled===true,'SOURCE_PRODUCER_DISABLED');assert(allowSyntheticFixtures===true||(readBytes===readCanonicalDriveTowerBytes&&readRevision===readCanonicalDriveRevision&&checkRevision===validateImportedDriveRevision),'FIXED_DRIVE_READER_REQUIRED');assert(typeof authorize==='function'&&producerHash===PRODUCER_SHA256,'TRUSTED_PRODUCER_REQUIRED');
    assert(typeof baseDb?.withSession==='function','PRIMARY_SESSION_REQUIRED');const db=budgetDatabase(baseDb.withSession('first-primary'));
    const auth=authSnapshot(await authorize());authValid(auth);const authKey=authId(auth);
    const checkAuth=async()=>{const a=authSnapshot(await authorize());authValid(a);assert(authId(a)===authKey,'AUTHORIZATION_CHANGED_DURING_BUILD');return a;};
    const previous=await loadObservation(db),revision=await readRevision(driveBinding),cache=new D1SourceRecordCache(db,{producerHash});
    const head=await db.prepare(`SELECT h.generation,g.manifest_sha256,g.manifest_json FROM retrieval_heads h JOIN retrieval_generations g ON g.generation=h.generation WHERE h.source_id=? AND h.role=? AND h.policy=?`).bind(TOWER_ID,auth.role,POLICY).first();
    if(head){assert(await sha256(head.manifest_json)===head.manifest_sha256,'MANIFEST_HASH_INVALID');const m=JSON.parse(head.manifest_json);
      if(m.producer_sha256===producerHash&&m.transport?.revision_id===revision.id&&m.transport?.size===revision.size&&m.role===auth.role&&instant(m.validity_start)<=instant(auth.now)&&instant(auth.now)<instant(m.validity_end)){
        await checkRevision(driveBinding,m);const after=await checkAuth();assertCurrentView(m,after.now);return {changed:false,generation:head.generation,source_observation:previous?.observation_id??null,source_sha256:m.snapshot.source_sha256};
      }
    }
    let source;
    if(previous&&previous.producer_sha256===producerHash&&previous.snapshot.transport?.revision_id===revision.id&&previous.snapshot.transport?.size===revision.size)source=await hydrate(previous,cache);
    else {
      const {raw,transport}=await readBytes(driveBinding);const snapshot=await readSource(raw,{transport,fixtureOnly:allowSyntheticFixtures===true});
      assert(!previous||previous.snapshot.source_sha256===snapshot.source_sha256||instant(snapshot.observed_at)>instant(previous.snapshot.observed_at),'SOURCE_OBSERVATION_NOT_MONOTONIC');
      source=await importDocuments(snapshot,{previous,recordCache:cache});
      // Reject revocation/race before recording a trusted observation.
      await checkRevision(driveBinding,{snapshot,transport});await checkAuth();source.observation_id=await storeObservation(db,source,previous,producerHash);
    }
    const view=await authorizedView(source,{role:auth.role,now:auth.now});const prepared=await prepareView(view,{producerHash});
    // If a prior bounded invocation completed staging but ran out of query
    // budget during verification, resume its immutable manifest rather than
    // re-emitting every shard. Verification still authenticates all payloads.
    const staged=await db.prepare('SELECT manifest_json,manifest_sha256 FROM retrieval_generations WHERE generation=?').bind(prepared.generation).first();
    let receipt;
    if(staged){assert(await sha256(staged.manifest_json)===staged.manifest_sha256,'MANIFEST_HASH_INVALID');receipt={generation:prepared.generation,manifest:JSON.parse(staged.manifest_json),manifestJson:staged.manifest_json,manifestHash:staged.manifest_sha256,payloadBytes:null};}
    else receipt=await emitView(prepared,rows=>stageContentShards(db,prepared.generation,rows),{contentAddressed:true,compress:false});
    const validate=async m=>{await checkRevision(driveBinding,m);const a=await checkAuth();assertCurrentView(m,a.now);};
    await validate(receipt.manifest);await finishContentBuild(db,receipt);await verifyGeneration(db,receipt.generation,receipt.manifestHash,validate);await validate(receipt.manifest);
    await publishGeneration(db,{generation:receipt.generation,manifestHash:receipt.manifestHash,role:auth.role,expectedGeneration:head?.generation??null});
    // A failed post-publication check means this call reports failure. Serving has
    // independent fresh source/auth checks and cannot return this stale head.
    await validate(receipt.manifest);
    return {changed:true,generation:receipt.generation,manifest_sha256:receipt.manifestHash,source_observation:source.observation_id,source_sha256:source.snapshot.source_sha256,delta:source.delta?Object.fromEntries(Object.entries(source.delta).map(([key,ids])=>[key,ids.length])):null,records_reused:cache.reused,records_created:cache.created,documents:view.documents.length,chunks:view.chunks.length,shards:receipt.manifest.shard_count,payload_bytes:receipt.payloadBytes,statements:db.stats.statements};
  };
}
