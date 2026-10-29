/** Bounded trusted verification step. Cursor is server-persisted, never caller authority. */
import {validateGraphShard} from './graph.mjs';
import {VerifiedD1View,CONTENT_ROWS} from './storage.mjs';
import {assert,decodeRow,identity,bucket} from './integrity.mjs';
export async function verifyGenerationStep(db,{generation,manifestHash,cursor=null,maxPages=12}){
  assert(Number.isInteger(maxPages)&&maxPages>=1&&maxPages<=12,'VERIFICATION_STEP_BOUND');
  const view=await VerifiedD1View.open(db,generation,manifestHash,{allowStaging:true}),m=view.manifest;
  assert(m.payload_format==='content-addressed-v1','PAYLOAD_FORMAT_INVALID');
  const initial=await db.prepare('SELECT mutation_seq,state FROM retrieval_generations WHERE generation=?').bind(generation).first();
  if(cursor)assert(cursor.generation===generation&&cursor.manifestHash===manifestHash&&cursor.mutation_seq===initial.mutation_seq,'STAGING_CHANGED_DURING_VERIFICATION');
  if(initial.state==='verified'){await view.metadata();return {done:true,cursor:null,verified_shards:m.shard_count+256};}
  assert(initial.state==='staging','GENERATION_STATE_INVALID');
  const state=cursor?{...cursor,families:{...cursor.families}}:{generation,manifestHash,mutation_seq:initial.mutation_seq,family:'',key:'',count:0,families:{}};
  await view.metadata();
  const expected=new Map();
  for(let n=0;n<256;n+=64){const keys=Array.from({length:64},(_,i)=>(n+i).toString(16).padStart(2,'0')),rows=await view.rows('catalog',keys);
    for(const key of keys){const {payload}=await decodeRow(rows.get(key),m.catalog[key]);assert(payload.generation===generation&&payload.family==='catalog'&&payload.key===key,'SHARD_GENERATION_INVALID');
      for(const [id,d]of Object.entries(payload.data)){const [family,k]=JSON.parse(id);assert(identity(family,k)===id&&['metadata','term','document','chunk','alias','title','number','graph'].includes(family)&&await bucket(family,k)===key&&!expected.has(id),'CATALOG_IDENTITY_INVALID');expected.set(id,d.sha256);}
    }
  }
  assert(expected.size===m.shard_count,'IMPORT_COUNT_INVALID');let exhausted=false;
  for(let page=0;page<maxPages;page++){
    const headers=await db.prepare(`SELECT generation,family,lookup_key,content_sha256,length(payload) AS bytes FROM ${CONTENT_ROWS} WHERE generation=? AND family!='catalog' AND (family>? OR (family=? AND lookup_key>?)) ORDER BY family,lookup_key LIMIT 1000`).bind(generation,state.family,state.family,state.key).all();
    if(!headers.results.length){exhausted=true;break;}
    const wanted=[];let bytes=0;for(const row of headers.results){assert(row.bytes>0&&row.bytes<=2_000_000,'SHARD_RESOURCE_BOUND');if(wanted.length&&bytes+row.bytes>1_500_000)break;wanted.push({family:row.family,key:row.lookup_key});bytes+=row.bytes;}
    const {results}=await db.prepare(`SELECT * FROM ${CONTENT_ROWS} WHERE generation=? AND (family,lookup_key) IN (SELECT json_extract(value,'$.family'),json_extract(value,'$.key') FROM json_each(?)) ORDER BY family,lookup_key`).bind(generation,JSON.stringify(wanted)).all();assert(results.length===wanted.length,'MISSING_SHARD');
    for(const row of results){const hash=expected.get(identity(row.family,row.lookup_key));assert(hash,'UNEXPECTED_SHARD');const {payload}=await decodeRow(row,hash);assert(payload.generation===generation&&payload.family===row.family&&payload.key===row.lookup_key,'SHARD_GENERATION_INVALID');if(row.family==='graph'){const data=validateGraphShard(view,row.lookup_key,payload.data);state.graph_edges=(state.graph_edges??0)+data.edges.filter(e=>e.source===row.lookup_key).length;}state.count++;state.families[row.family]=(state.families[row.family]??0)+1;state.family=row.family;state.key=row.lookup_key;}
  }
  const current=await db.prepare('SELECT mutation_seq,state FROM retrieval_generations WHERE generation=?').bind(generation).first();assert(current.mutation_seq===state.mutation_seq&&current.state==='staging','STAGING_CHANGED_DURING_VERIFICATION');
  if(!exhausted)return {done:false,cursor:state,verified_shards:state.count+256};
  const total=await db.prepare('SELECT COUNT(*) AS n FROM retrieval_content_shards WHERE generation=?').bind(generation).first();
  assert(total.n===m.shard_count+256&&state.count===m.shard_count&&state.families.metadata===1&&state.families.term===m.term_count&&state.families.chunk===m.size&&state.families.document===m.document_count&&state.families.graph===m.graph_node_count&&(state.graph_edges??0)===m.edge_count,'IMPORT_COUNT_INVALID');
  const result=await db.prepare("UPDATE retrieval_generations SET state='verified' WHERE generation=? AND manifest_sha256=? AND state='staging' AND mutation_seq=?").bind(generation,manifestHash,state.mutation_seq).run();assert(result.meta.changes===1,'STAGING_CHANGED_DURING_VERIFICATION');
  return {done:true,cursor:null,verified_shards:state.count+256};
}
