import {assert,sha256,identity,bucket,decodeRow,LIMITS,validateManifest} from './integrity.mjs';
import {TOKENIZER_SHA256,CHUNKER_SHA256} from './bindings.mjs';

/** One request, one verified generation. No full dictionary, bodies, or cross-request cache. */
export class VerifiedD1View {
  constructor(db, generation, manifest) {
    this.db=db;this.generation=generation;this.manifest=manifest;
    this.catalog=new Map();this.loaded=new Map();this.readBytes=0;this.sqlStatements=0;this.shardsRead=0;
  }
  static async open(db,generation,expectedManifestHash,{allowStaging=false}={}) {
    const row=await db.prepare('SELECT * FROM retrieval_generations WHERE generation=?').bind(generation).first();
    assert(row && (row.state==='verified' || allowStaging && row.state==='staging'), 'GENERATION_NOT_VERIFIED');
    assert(row.manifest_sha256===expectedManifestHash && await sha256(row.manifest_json)===expectedManifestHash,'MANIFEST_HASH_INVALID');
    const m=JSON.parse(row.manifest_json);validateManifest(m,generation);
    assert(m.tokenizer_sha256===TOKENIZER_SHA256 && m.chunker_sha256===CHUNKER_SHA256,'IMPLEMENTATION_BINDING_INVALID');
    const view=new VerifiedD1View(db,generation,m);view.sqlStatements++;return view;
  }
  async rows(family,keys) {
    const out=new Map();keys=[...new Set(keys.map(String))];
    for(let start=0;start<keys.length;start+=LIMITS.sqlBinds-2){
      const group=keys.slice(start,start+LIMITS.sqlBinds-2);
      const table=this.manifest.payload_format==='content-addressed-v1'?CONTENT_ROWS:'retrieval_shards';
      const result=await this.db.prepare(`SELECT * FROM ${table} WHERE generation=? AND family=? AND lookup_key IN (${group.map(()=>'?').join(',')})`)
        .bind(this.generation,family,...group).all();this.sqlStatements++;
      for(const row of result.results){assert(row.generation===this.generation&&row.family===family&&group.includes(row.lookup_key),'SHARD_GENERATION_INVALID');out.set(row.lookup_key,row);}
    }return out;
  }
  async unpack(row,hash,family,key) {
    const result=await decodeRow(row,hash);this.readBytes+=result.bytes;this.shardsRead++;
    assert(this.readBytes<=LIMITS.totalReadBytes&&this.shardsRead<=LIMITS.shards,'QUERY_RESOURCE_BOUND');
    const p=result.payload;
    assert(p.generation===this.generation&&p.family===family&&p.key===String(key),'SHARD_GENERATION_INVALID');
    return p.data;
  }
  async getMany(family,keys) {
    keys=[...new Set(keys.map(String))];const missing=keys.filter(k=>!this.loaded.has(identity(family,k)));
    const keyed=await Promise.all(missing.map(async key=>[key,await bucket(family,key)]));
    const buckets=[...new Set(keyed.map(([,b])=>b))].filter(b=>!this.catalog.has(b));
    const catalogRows=await this.rows('catalog',buckets);
    for(const b of buckets){const entries=await this.unpack(catalogRows.get(b),this.manifest.catalog[b],'catalog',b);
      assert(entries&&typeof entries==='object'&&!Array.isArray(entries),'CATALOG_INVALID');this.catalog.set(b,entries);}
    const wanted=keyed.filter(([k,b])=>Object.hasOwn(this.catalog.get(b),identity(family,k)));
    const rows=await this.rows(family,wanted.map(([k])=>k));
    for(const [key,b] of keyed){
      const descriptor=this.catalog.get(b)[identity(family,key)];let data=null;
      if(descriptor){assert(/^[a-f0-9]{64}$/.test(descriptor.sha256),'CATALOG_HASH_INVALID');data=await this.unpack(rows.get(key),descriptor.sha256,family,key);}
      this.loaded.set(identity(family,key),data);
    }
    return new Map(keys.map(key=>[key,this.loaded.get(identity(family,key))]));
  }
  async get(family,key) {return (await this.getMany(family,[key])).get(String(key));}
  async metadata() {
    const m=this.manifest,meta=await this.get('metadata','index');
    assert(meta&&meta.chunks.length===m.size&&meta.lengths.length===m.size&&meta.scope.length===m.document_count,'METADATA_COUNT_INVALID');
    assert(await sha256(JSON.stringify(meta.scope))===m.scope_sha256,'SCOPE_HASH_INVALID');
    assert(meta.lengths.every(n=>Number.isInteger(n)&&n>=0)&&meta.lengths.reduce((a,b)=>a+b,0)/m.size===m.average,'CORPUS_STATS_INVALID');
    const scope=new Map(meta.scope),seen=new Set();
    assert(scope.size===m.document_count,'SCOPE_DUPLICATE_INVALID');
    for(const c of meta.chunks){assert(scope.has(c.uid)&&/^[a-f0-9]{64}$/.test(c.id)&&!seen.has(c.id),'CHUNK_METADATA_INVALID');seen.add(c.id);}
    this.meta=meta;this.scope=scope;return meta;
  }
}

export const CONTENT_ROWS="(SELECT s.generation,s.family,s.lookup_key,s.content_sha256,'cas-'||p.encoding AS encoding,p.payload FROM retrieval_content_shards s JOIN retrieval_payloads p ON p.content_sha256=s.content_sha256)";
