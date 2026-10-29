/** Trusted offline producer interface only. No browser upload, HTTP route or automatic refresh. */
import {assert,sha256,validateManifest,bucket,identity,decodeRow,POLICY,TOWER_ID} from './integrity.mjs';
import {VerifiedD1View,CONTENT_ROWS} from './storage.mjs';

export async function beginGeneration(db,manifestJson,expectedHash) {
  assert(await sha256(manifestJson)===expectedHash,'MANIFEST_HASH_INVALID');
  const manifest=JSON.parse(manifestJson);validateManifest(manifest,manifest.generation);
  await db.prepare("INSERT INTO retrieval_generations(generation,manifest_sha256,manifest_json,state) VALUES(?,?,?,'staging') ON CONFLICT(generation) DO NOTHING")
    .bind(manifest.generation,expectedHash,manifestJson).run();
  const existing=await db.prepare('SELECT manifest_sha256,manifest_json FROM retrieval_generations WHERE generation=?').bind(manifest.generation).first();
  assert(existing?.manifest_sha256===expectedHash&&existing.manifest_json===manifestJson,'GENERATION_CONTENT_CONFLICT');
  return manifest.generation;
}
function sameBytes(a,b) {
  const x=new Uint8Array(a),y=new Uint8Array(b);
  return x.length===y.length&&x.every((value,n)=>value===y[n]);
}
async function existingShards(db,generation,rows) {
  const found=new Map();
  for(let start=0;start<rows.length;start+=44){const group=rows.slice(start,start+44);
    const result=await db.prepare(`SELECT * FROM retrieval_shards WHERE generation=? AND (family,lookup_key) IN (${group.map(()=>'(?,?)').join(',')})`)
      .bind(generation,...group.flatMap(r=>[r.family,r.lookup_key])).all();
    for(const row of result.results)found.set(identity(row.family,row.lookup_key),row);
  }
  return found;
}
function matches(existing,incoming) {
  return existing.content_sha256===incoming.content_sha256&&existing.encoding===incoming.encoding&&sameBytes(existing.payload,incoming.payload);
}
export async function appendShards(db,generation,rows) {
  assert(rows.length<=100,'IMPORT_BATCH_BOUND');
  const unique=new Map();
  for(const row of rows){const key=identity(row.family,row.lookup_key),previous=unique.get(key);
    assert(!previous||matches(previous,row),'SHARD_CONTENT_CONFLICT');unique.set(key,row);}
  rows=[...unique.values()];const existing=await existingShards(db,generation,rows),pending=[];
  for(const row of rows){const old=existing.get(identity(row.family,row.lookup_key));
    if(old)assert(matches(old,row),'SHARD_CONTENT_CONFLICT');else pending.push(row);}
  // INSERT SELECT is a no-op for an identical concurrently committed row. It
  // never fires the immutable-generation trigger or rewrites a verified shard.
  if(pending.length)await db.batch(pending.map(r=>db.prepare(`INSERT INTO retrieval_shards(generation,family,lookup_key,content_sha256,encoding,payload)
    SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM retrieval_shards WHERE generation=? AND family=? AND lookup_key=?)`)
    .bind(generation,r.family,r.lookup_key,r.content_sha256,r.encoding,r.payload,generation,r.family,r.lookup_key)));
  const stored=await existingShards(db,generation,rows);
  for(const row of rows){const old=stored.get(identity(row.family,row.lookup_key));assert(old&&matches(old,row),'SHARD_CONTENT_CONFLICT');}
  return {accepted:rows.length,already_present:rows.length-pending.length};
}
export async function verifyGeneration(db,generation,expectedHash,validateSource) {
  // An approved producer must verify canonical body+Drive revision before staging.
  // The supplied callback repeats current source/auth checks before and after verification.
  assert(typeof validateSource==='function','TRUSTED_SOURCE_VERIFIER_REQUIRED');
  const view=await VerifiedD1View.open(db,generation,expectedHash,{allowStaging:true});
  const initial=await db.prepare('SELECT mutation_seq,state FROM retrieval_generations WHERE generation=?').bind(generation).first();
  await validateSource(view.manifest);
  if(initial.state==='verified'){
    await view.metadata();await validateSource(view.manifest);
    return {generation,verified_shards:view.manifest.shard_count+256,manifest_sha256:expectedHash,reused:true};
  }
  assert(initial.state==='staging','GENERATION_STATE_INVALID');
  const table=view.manifest.payload_format==='content-addressed-v1'?CONTENT_ROWS:'retrieval_shards';
  const total=await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE generation=?`).bind(generation).first();
  assert(total.n===view.manifest.shard_count+256,'IMPORT_COUNT_INVALID');
  const catalog=new Map(),expected=new Map();
  for(let n=0;n<256;n+=64){const keys=Array.from({length:64},(_,i)=>(i+n).toString(16).padStart(2,'0'));
    const rows=await view.rows('catalog',keys);
    for(const key of keys){const {payload}=await decodeRow(rows.get(key),view.manifest.catalog[key]);
      assert(payload.generation===generation&&payload.family==='catalog'&&payload.key===key,'SHARD_GENERATION_INVALID');catalog.set(key,payload.data);
      for(const [id,description]of Object.entries(payload.data)){const [family,k]=JSON.parse(id);
        assert(identity(family,k)===id&&['metadata','term','document','chunk','alias','title','number','graph'].includes(family)&&await bucket(family,k)===key&&!expected.has(id),'CATALOG_IDENTITY_INVALID');expected.set(id,description.sha256);}
    }
  }
  let cursorFamily='',cursorKey='',count=0;
  const familyCounts={};
  for(;;){const {results}=await db.prepare(`SELECT * FROM ${table} WHERE generation=? AND family!='catalog' AND (family>? OR (family=? AND lookup_key>?)) ORDER BY family,lookup_key LIMIT 256`)
    .bind(generation,cursorFamily,cursorFamily,cursorKey).all();if(!results.length)break;
    for(const row of results){const id=identity(row.family,row.lookup_key),hash=expected.get(id);assert(hash,'UNEXPECTED_SHARD');
      const {payload}=await decodeRow(row,hash);assert(payload.generation===generation&&payload.family===row.family&&payload.key===row.lookup_key,'SHARD_GENERATION_INVALID');
      expected.delete(id);count++;familyCounts[row.family]=(familyCounts[row.family]||0)+1;
      cursorFamily=row.family;cursorKey=row.lookup_key;
    }
  }
  assert(expected.size===0&&count===view.manifest.shard_count,'MISSING_SHARD');
  assert(familyCounts.term===view.manifest.term_count&&familyCounts.chunk===view.manifest.size&&familyCounts.document===view.manifest.document_count&&familyCounts.graph===view.manifest.graph_node_count,'IMPORT_COUNT_INVALID');
  await view.metadata();await validateSource(view.manifest);
  const result=await db.prepare("UPDATE retrieval_generations SET state='verified' WHERE generation=? AND manifest_sha256=? AND state='staging' AND mutation_seq=?")
    .bind(generation,expectedHash,initial.mutation_seq).run();
  if(result.meta.changes!==1){
    const completed=await db.prepare('SELECT state,manifest_sha256,mutation_seq FROM retrieval_generations WHERE generation=?').bind(generation).first();
    assert(completed?.state==='verified'&&completed.manifest_sha256===expectedHash&&completed.mutation_seq===initial.mutation_seq,'STAGING_CHANGED_DURING_VERIFICATION');
    await validateSource(view.manifest);
    return {generation,verified_shards:count+256,manifest_sha256:expectedHash,reused:true};
  }
  return {generation,verified_shards:count+256,manifest_sha256:expectedHash,reused:false};
}
export async function publishGeneration(db,{generation,manifestHash,role,expectedGeneration=null}) {
  const view=await VerifiedD1View.open(db,generation,manifestHash);
  assert(view.manifest.role===role,'ROLE_BINDING_INVALID');
  const head=()=>db.prepare('SELECT generation FROM retrieval_heads WHERE source_id=? AND role=? AND policy=?').bind(TOWER_ID,role,POLICY).first();
  if((await head())?.generation===generation)return {generation,reused:true};
  // One SQL statement is atomic. A failed compare-and-swap cannot replace the head.
  let result;
  if(expectedGeneration===null){result=await db.prepare(`INSERT INTO retrieval_heads(source_id,role,policy,generation)
    SELECT ?,?,?,generation FROM retrieval_generations WHERE generation=? AND state='verified' AND manifest_sha256=?
    ON CONFLICT(source_id,role,policy) DO NOTHING`).bind(TOWER_ID,role,POLICY,generation,manifestHash).run();}
  else result=await db.prepare(`UPDATE retrieval_heads SET generation=? WHERE source_id=? AND role=? AND policy=? AND generation=?
    AND EXISTS(SELECT 1 FROM retrieval_generations WHERE generation=? AND state='verified' AND manifest_sha256=?)`)
    .bind(generation,TOWER_ID,role,POLICY,expectedGeneration,generation,manifestHash).run();
  if(result.meta.changes!==1){assert((await head())?.generation===generation,'HEAD_CAS_CONFLICT');return {generation,reused:true};}
  return {generation,reused:false};
}
