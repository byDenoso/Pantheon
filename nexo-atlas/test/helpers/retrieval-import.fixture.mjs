import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {beginGeneration,appendShards} from '../../worker/retrieval/import.mjs';
import {sha256,identity,bucket,utf8,TOWER_ID,POLICY,SCHEMA,ENGINE_CONFIG,ENGINE_CODE,CHUNKER,ENGINE_VERSION} from '../../worker/retrieval/integrity.mjs';
import {TOKENIZER_SHA256,CHUNKER_SHA256} from '../../worker/retrieval/bindings.mjs';
export function database(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../../worker/retrieval/schema.sql',import.meta.url),'utf8'));
 const db={
  withSession(mode){assert.equal(mode,'first-primary');return db;},
  prepare(sql){
   return {bind(...args){
    const statement=sqlite.prepare(sql);
    return {
     async first(){return statement.get(...args)??null;},
     async all(){return {results:statement.all(...args)};},
     async run(){return {meta:{changes:Number(statement.run(...args).changes)}};}
    };
   }};
  },
  async batch(statements){
   sqlite.exec('BEGIN');
   try{const out=[];for(const statement of statements)out.push(await statement.run());sqlite.exec('COMMIT');return out;}
   catch(e){sqlite.exec('ROLLBACK');throw e;}
  }
 };
 return {db,sqlite};
}
export async function fixture(seed='synthetic') {
 const generation=await sha256(seed),rows=[],catalog=Object.fromEntries(Array.from({length:256},(_,i)=>[i.toString(16).padStart(2,'0'),{}]));
 const uid='DATA::SYNTHETIC',id='a'.repeat(64),content='b'.repeat(64),scope=[[uid,content]];
 async function shard(family,key,data){key=String(key);const raw=JSON.stringify({generation,family,key,data}),hash=await sha256(raw);
   rows.push({family,lookup_key:key,content_sha256:hash,encoding:'json',payload:utf8(raw)});
   if(family!=='catalog')catalog[await bucket(family,key)][identity(family,key)]={sha256:hash};return hash;
 }
 await shard('metadata','index',{chunks:[{id,uid}],lengths:[1],scope});await shard('term','hello',{df:1,rows:[[0,1]]});
 await shard('document',uid,{uid,object_id:'SYNTHETIC',path:'synthetic.json',pointer:'/record',kind:'DATA',version:'v1',content_hash:content,title:'Synthetic',state:'ACTIVE',expires_at:null,valid_from:null,entity_timestamp:null});
 await shard('graph',uid,{edges:[],unresolved_source_fields:[]});
 await shard('alias',uid,[uid]);await shard('alias','SYNTHETIC',[uid]);
 await shard('chunk','0',{uid,id,body:'hello /dataset: SYNTHETIC',context:{entity:uid,title:'Synthetic',question:'',version:'v1'},segments:[{json_pointer:'/record/dataset',text_start:0,text_end:25}],representation:CHUNKER});
 const shard_count=rows.length,catalogHashes={};for(const [key,data]of Object.entries(catalog))catalogHashes[key]=await shard('catalog',key,data);
 const manifest={schema:SCHEMA,generation,policy:POLICY,config:ENGINE_CONFIG,code_sha256:ENGINE_CODE,chunker:CHUNKER,engine_version:ENGINE_VERSION,
  contextual:true,expanded:false,include_inactive:false,scope_sha256:await sha256(JSON.stringify(scope)),tokenizer_sha256:TOKENIZER_SHA256,chunker_sha256:CHUNKER_SHA256,
  source_export_sha256:'c'.repeat(64),authorization_source_sha256:'d'.repeat(64),authorization_revision:'synthetic-revision',role:'LEARNER',
  snapshot:{source_id:TOWER_ID,source_sha256:'d'.repeat(64),revision:'synthetic-revision',observed_at:'2026-01-01T00:00:00Z'},
  validity_start:'2026-01-01T00:00:00Z',validity_end:'2027-01-01T00:00:00Z',fixture_only:true,graph_node_count:1,edge_count:0,document_count:1,size:1,average:1,term_count:1,shard_count,catalog:catalogHashes};
 const manifestJson=JSON.stringify(manifest),manifestHash=await sha256(manifestJson);return {generation,manifest,manifestJson,manifestHash,rows};
}
export async function stage(db,f){await beginGeneration(db,f.manifestJson,f.manifestHash);for(let i=0;i<f.rows.length;i+=100)await appendShards(db,f.generation,f.rows.slice(i,i+100));}
