/** Private bounded D1 build sink and source-record cache. No routes or credentials. */
import {assert,sha256,utf8,decodeRow,identity,ENGINE_CONFIG} from './integrity.mjs';
import {parsePythonJSON,canonical} from './python-json.mjs';
import {beginGeneration} from './import.mjs';
const MAX_BATCH_BYTES=1_750_000;
function* jsonBatches(items){let rows=[],bytes=2;for(const item of items){const raw=JSON.stringify(item),size=utf8(raw).length+1;assert(size<MAX_BATCH_BYTES,'STAGING_ROW_RESOURCE_BOUND');if(rows.length&&(rows.length>=1000||bytes+size>MAX_BATCH_BYTES)){yield '['+rows.join(',')+']';rows=[];bytes=2;}rows.push(raw);bytes+=size;}if(rows.length)yield '['+rows.join(',')+']';}
export async function rawPayload(row,maxBytes=8_000_000){let bytes=new Uint8Array(row.payload);assert(bytes.length<=maxBytes,'SOURCE_RECORD_BOUND');if(row.encoding==='gzip'){const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),parts=[];let size=0;try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw Error('SOURCE_RECORD_BOUND');}parts.push(value);}}finally{reader.releaseLock();}bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}}else assert(row.encoding==='json','SHARD_ENCODING_INVALID');assert(await sha256(bytes)===row.content_sha256,'PAYLOAD_CONTENT_CONFLICT');return bytes;}
export async function storePayloads(db,rows){
  assert(rows.length<=1000,'IMPORT_BATCH_BOUND');const unique=new Map();for(const r of rows){await rawPayload(r);unique.set(r.content_sha256,r);}
  const plain=[...unique.values()].filter(r=>r.encoding==='json');
  for(const json of jsonBatches(plain.map(r=>({hash:r.content_sha256,payload:new TextDecoder('utf-8',{fatal:true}).decode(r.payload)}))))await db.prepare(`INSERT INTO retrieval_payloads(content_sha256,encoding,payload) SELECT json_extract(value,'$.hash'),'json',CAST(json_extract(value,'$.payload') AS BLOB) FROM json_each(?) WHERE true ON CONFLICT(content_sha256) DO NOTHING`).bind(json).run();
  const compressed=[...unique.values()].filter(r=>r.encoding!=='json');for(let n=0;n<compressed.length;n+=100)await db.batch(compressed.slice(n,n+100).map(r=>db.prepare('INSERT INTO retrieval_payloads(content_sha256,encoding,payload) VALUES(?,?,?) ON CONFLICT(content_sha256) DO NOTHING').bind(r.content_sha256,r.encoding,r.payload)));
  // Encoding is a storage choice. Equal uncompressed content can safely reuse
  // an existing gzip/JSON payload produced by a different compression runtime.
  for(const json of jsonBatches([...unique.keys()])){const found=await db.prepare('SELECT content_sha256,encoding,payload FROM retrieval_payloads WHERE content_sha256 IN (SELECT value FROM json_each(?))').bind(json).all();assert(found.results.length===JSON.parse(json).length,'PAYLOAD_MISSING');for(const stored of found.results)await rawPayload(stored);}
}
export async function stageContentShards(db,generation,rows){
  assert(rows.length<=1000&&rows.every(r=>r.generation===generation),'IMPORT_BATCH_BOUND');
  for(const r of rows)await decodeRow({...r,encoding:'cas-'+r.encoding},r.content_sha256);
  await storePayloads(db,rows);
  const items=rows.map(r=>({family:r.family,key:r.lookup_key,hash:r.content_sha256}));
  for(const json of jsonBatches(items)){
    await db.prepare(`INSERT INTO retrieval_build_shards(generation,family,lookup_key,content_sha256) SELECT ?,json_extract(value,'$.family'),json_extract(value,'$.key'),json_extract(value,'$.hash') FROM json_each(?) WHERE true ON CONFLICT(generation,family,lookup_key) DO NOTHING`).bind(generation,json).run();
    const mismatch=await db.prepare(`SELECT COUNT(*) AS n FROM json_each(?) j LEFT JOIN retrieval_build_shards b ON b.generation=? AND b.family=json_extract(j.value,'$.family') AND b.lookup_key=json_extract(j.value,'$.key') WHERE b.content_sha256 IS NULL OR b.content_sha256!=json_extract(j.value,'$.hash')`).bind(json,generation).first();assert(mismatch.n===0,'SHARD_CONTENT_CONFLICT');
  }
}
export async function finishContentBuild(db,receipt){
  assert(receipt.manifest.payload_format==='content-addressed-v1','PAYLOAD_FORMAT_INVALID');
  const generation=await beginGeneration(db,receipt.manifestJson,receipt.manifestHash);
  const total=await db.prepare('SELECT COUNT(*) AS n FROM retrieval_build_shards WHERE generation=?').bind(generation).first();assert(total.n===receipt.manifest.shard_count+256,'IMPORT_COUNT_INVALID');
  // One INSERT SELECT links a bounded-by-manifest immutable payload set. Trigger
  // guards staging state. Identical verified retries never attempt a new link.
  await db.prepare(`INSERT INTO retrieval_content_shards(generation,family,lookup_key,content_sha256)
    SELECT b.generation,b.family,b.lookup_key,b.content_sha256 FROM retrieval_build_shards b
    WHERE b.generation=? AND NOT EXISTS(SELECT 1 FROM retrieval_content_shards s WHERE s.generation=b.generation AND s.family=b.family AND s.lookup_key=b.lookup_key)`).bind(generation).run();
  const mismatch=await db.prepare(`SELECT COUNT(*) AS n FROM retrieval_build_shards b LEFT JOIN retrieval_content_shards s
    ON s.generation=b.generation AND s.family=b.family AND s.lookup_key=b.lookup_key
    WHERE b.generation=? AND (s.content_sha256 IS NULL OR s.content_sha256!=b.content_sha256)`).bind(generation).first();assert(mismatch.n===0,'SHARD_CONTENT_CONFLICT');
  return generation;
}
export class D1SourceRecordCache {
  constructor(db,{producerHash='unbound-synthetic-fixture'}={}){this.db=db;this.producerHash=producerHash;this.reused=0;this.created=0;}
  async storageKey(key){return sha256(canonical([this.producerHash,key]));}
  async getMany(keys){const map=new Map();if(!keys.length)return map;assert(keys.length<=32,'SOURCE_RECORD_BATCH_BOUND');const physical=await Promise.all(keys.map(key=>this.storageKey(key)));const rows=await this.db.prepare('SELECT r.record_key,p.content_sha256,p.encoding,p.payload FROM retrieval_source_records r JOIN retrieval_payloads p ON p.content_sha256=r.content_sha256 WHERE r.record_key IN (SELECT value FROM json_each(?))').bind(JSON.stringify(physical)).all();
    for(const row of rows.results){const bytes=await rawPayload(row),decoded=parsePythonJSON(new TextDecoder('utf-8',{fatal:true}).decode(bytes));assert(decoded.producer_sha256===this.producerHash&&keys.includes(decoded.record_key)&&await this.storageKey(decoded.record_key)===row.record_key&&await sha256(canonical([ENGINE_CONFIG,decoded.data.document]))===decoded.record_key,'SOURCE_RECORD_KEY_INVALID');map.set(decoded.record_key,decoded.data);this.reused++;}return map;
  }
  async get(key){return (await this.getMany([key])).get(key)??null;}
  async setMany(items){if(!items.length)return;assert(items.length<=32,'SOURCE_RECORD_BATCH_BOUND');const rows=[],links=[];for(const [key,data]of items){const raw=utf8(canonical({record_key:key,producer_sha256:this.producerHash,data})),hash=await sha256(raw);assert(raw.length<=8_000_000,'SOURCE_RECORD_BOUND');rows.push({content_sha256:hash,encoding:'json',payload:raw});links.push({key:await this.storageKey(key),hash});}
    await storePayloads(this.db,rows);for(const json of jsonBatches(links)){
      await this.db.prepare(`INSERT INTO retrieval_source_records(record_key,content_sha256) SELECT json_extract(value,'$.key'),json_extract(value,'$.hash') FROM json_each(?) WHERE true ON CONFLICT(record_key) DO NOTHING`).bind(json).run();
      const mismatch=await this.db.prepare(`SELECT COUNT(*) AS n FROM json_each(?) j LEFT JOIN retrieval_source_records r ON r.record_key=json_extract(j.value,'$.key') WHERE r.content_sha256 IS NULL OR r.content_sha256!=json_extract(j.value,'$.hash')`).bind(json).first();assert(mismatch.n===0,'SOURCE_RECORD_CONFLICT');
    }this.created+=items.length;
  }
  async set(key,data){return this.setMany([[key,data]]);}
}
