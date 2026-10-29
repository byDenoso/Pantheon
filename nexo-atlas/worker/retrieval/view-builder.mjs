/** Server-only complete-view shard producer. No endpoint or automatic publication. */
import {createHash} from 'node:crypto';
import {PRODUCER_SHA256} from './producer-bindings.mjs';
import {canonical,pyStr,pythonFloat} from './python-json.mjs';
import {digest,leaves,aliasMap,referenceFields,chunkText,PRODUCER_VERSION} from './source-producer.mjs';
import {tokens,fold,numberKey} from './tokenizer.mjs';
import {TABLES} from './unicode-tables.mjs';
import {assert,sha256,utf8,cmp,bucket,identity,instant,SCHEMA,POLICY,ENGINE_CONFIG,ENGINE_CODE,ENGINE_VERSION,CHUNKER,LIMITS} from './integrity.mjs';
import {TOKENIZER_SHA256,CHUNKER_SHA256} from './bindings.mjs';
const ranges=rs=>rs.map(([a,b])=>`\\u{${a.toString(16)}}${a===b?'':`-\\u{${b.toString(16)}}`}`).join('');
const WORD=ranges(TABLES.wordRanges),DIGIT=ranges(TABLES.decimalRanges);
const NUMBER=new RegExp(`(?<![${WORD}.])[+-]?[${DIGIT}]+(?:\\.[${DIGIT}]+)?(?:[eE][+-]?[${DIGIT}]+)?(?![${WORD}.])`,'gu');
export function numericMembership(docs){const map=new Map();for(const d of docs)for(const [,value]of leaves(d.data))for(const match of pyStr(value).matchAll(NUMBER)){const key=numberKey(match[0]);if(!map.has(key))map.set(key,new Set());map.get(key).add(d.uid);}return map;}
export function sparseIndex(chunks,{compact=false}={}){
  assert(chunks.length>0&&chunks.length<=LIMITS.chunks,'INDEX_RESOURCE_BOUND');
  const postings=new Map(),lengths=[];let pairs=0;
  for(let n=0;n<chunks.length;n++){const terms=tokens(chunkText(chunks[n]));lengths.push(terms.length);const counts=new Map();for(const t of terms)counts.set(t,(counts.get(t)??0)+1);for(const [term,tf]of counts){if(!postings.has(term))postings.set(term,[]);if(compact)postings.get(term).push(n,tf);else postings.get(term).push([n,tf]);pairs++;assert(pairs<=LIMITS.postingPairs,'INDEX_RESOURCE_BOUND');}}
  if(compact)for(const [term,flat]of postings)postings.set(term,new Uint32Array(flat));
  return {postings,lengths,size:chunks.length,average:lengths.reduce((a,b)=>a+b,0)/chunks.length,pairs};
}
function arrayDigest(items){const hash=createHash('sha256');hash.update('[');let first=true;for(const item of items){if(!first)hash.update(',');first=false;hash.update(canonical(item));}hash.update(']');return hash.digest('hex');}
export async function prepareView(view,{producerHash=PRODUCER_SHA256,transport=view.snapshot.transport,fixtureOnly=view.snapshot.fixture_only===true}={}){
  assert(producerHash===PRODUCER_SHA256,'PRODUCER_CODE_BINDING_REQUIRED');
  assert(view.documents.length>0&&view.documents.length<=LIMITS.documents,'INDEX_RESOURCE_BOUND');
  for(const d of view.documents)for(const field of ['created_at','updated_at','valid_from','effective_from'])assert(d.data[field]===undefined||d.data[field]===null||typeof d.data[field]==='string','UNSUPPORTED_TEMPORAL_METADATA_TYPE');
  const scope=view.documents.map(d=>[d.uid,d.content_hash]),scopeHash=await digest(scope);
  const sourceExportHash=await digest([PRODUCER_VERSION,view.key,scope,view.chunks.map(c=>c.id),arrayDigest(view.documents),arrayDigest(view.edges)]);
  const binding={producer_version:PRODUCER_VERSION,producer_sha256:producerHash,snapshot:Object.fromEntries(['revision','source_id','source_sha256','observed_at'].map(k=>[k,view.snapshot[k]])),authorization_revision:view.authorization_revision,authorization_source_sha256:view.authorization_source_sha256,role:view.role,validity_start:view.validity_start,validity_end:view.validity_end,transport,source_export_sha256:sourceExportHash,scope_sha256:scopeHash,config:ENGINE_CONFIG,code_sha256:ENGINE_CODE,tokenizer_sha256:TOKENIZER_SHA256,chunker_sha256:CHUNKER_SHA256};
  if(!fixtureOnly){assert(transport?.body_sha256===view.snapshot.source_sha256&&Number.isSafeInteger(transport.size)&&transport.size>0,'VERIFIED_TRANSPORT_REQUIRED');assert(view.snapshot.source_sha256===view.authorization_source_sha256&&view.snapshot.revision===view.authorization_revision,'HISTORICAL_SERVING_FORBIDDEN');}
  const generation=await digest(binding),sparse=sparseIndex(view.chunks,{compact:true});assert(sparse.postings.size<=65000,'PRODUCER_TERM_COUNT_BOUND');
  assert(view.edges.length<=LIMITS.graphEdges,'GRAPH_RESOURCE_BOUND');
  const manifest={...binding,schema:SCHEMA,generation,policy:POLICY,fixture_only:fixtureOnly,engine_version:ENGINE_VERSION,chunker:CHUNKER,contextual:true,expanded:false,include_inactive:false,view_key:view.key,size:sparse.size,average:pythonFloat(sparse.average),document_count:view.documents.length,term_count:sparse.postings.size,graph_node_count:view.documents.length,edge_count:view.edges.length};
  // Derive every data-dependent serving field, then retain no source document
  // data/text/ACL structures in the asynchronous staging continuation.
  const aliases=aliasMap(view.documents),titles=new Map(),numbers=numericMembership(view.documents),graphs=new Map(view.documents.map(d=>[d.uid,{edges:[],unresolved_source_fields:[]} ]));
  for(const edge of view.edges){assert(graphs.has(edge.source)&&graphs.has(edge.target),'GRAPH_SCOPE_INVALID');graphs.get(edge.source).edges.push(edge);if(edge.target!==edge.source)graphs.get(edge.target).edges.push(edge);}
  const documents=[];for(const d of view.documents){const title=fold(d.title);if(!titles.has(title))titles.set(title,new Set());titles.get(title).add(d.uid);const graph=graphs.get(d.uid);for(const field of referenceFields(d))if(!field.ref.includes('[restricted reference]')&&(aliases.get(field.ref)?.size??0)!==1)graph.unresolved_source_fields.push({source:d.uid,pointer:field.pointer,reason:'UNRESOLVED_IN_AUTHORIZED_INDEX'});assert(graph.unresolved_source_fields.length<=LIMITS.graphFields,'GRAPH_RESOURCE_BOUND');const data=Object.fromEntries(['uid','object_id','path','pointer','kind','version','content_hash','title','state','expires_at'].map(k=>[k,d[k]]));data.entity_timestamp=d.data.updated_at||d.data.created_at||null;data.valid_from=d.data.valid_from||null;documents.push(data);}
  return {view:{documents,chunks:view.chunks},scope,sparse,manifest,generation,aliases,titles,numbers,graphs};
}
async function row(generation,family,key,data,{contentAddressed=false,compress=true}={}){
  key=String(key);const raw=utf8(canonical(contentAddressed?{data}:{generation,family,key,data}));assert(raw.length<=LIMITS.rawShardBytes,'SHARD_RESOURCE_BOUND');
  const content_sha256=await sha256(raw);let payload=raw,encoding='json';
  if(compress&&raw.length>512){payload=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());encoding='gzip';}
  return {generation,family,lookup_key:key,content_sha256,encoding,payload};
}
/** onShard is awaited in bounded batches; this never retains every serialized shard. */
export async function emitView(prepared,onShards,{contentAddressed=false,compress=true,batchSize=1000}={}){
  assert(typeof onShards==='function'&&batchSize>=1&&batchSize<=1000,'TRUSTED_SHARD_SINK_REQUIRED');
  const {view,scope,sparse,generation}=prepared,catalog=Array.from({length:256},()=>Object.create(null)),counts=Object.create(null);let pending=[],payloadBytes=0,shards=0;
  async function emit(family,key,data){const r=await row(generation,family,key,data,{contentAddressed,compress});if(family!=='catalog'){const id=identity(family,key);catalog[parseInt(await bucket(family,key),16)][id]={sha256:r.content_sha256};shards++;assert(shards<=100000,'PRODUCER_SHARD_COUNT_BOUND');}counts[family]=(counts[family]??0)+1;payloadBytes+=r.payload.length;pending.push(r);if(pending.length>=batchSize){await onShards(pending);pending=[];}return r;}
  await emit('metadata','index',{lengths:sparse.lengths,chunks:view.chunks.map(c=>({id:c.id,uid:c.uid})),scope});
  for(const [term,stored]of sparse.postings){const rows=stored instanceof Uint32Array?Array.from({length:stored.length/2},(_,n)=>[stored[2*n],stored[2*n+1]]):stored;await emit('term',term,{df:rows.length,rows});}
  const {aliases,titles,numbers,graphs}=prepared;
  for(const d of view.documents)await emit('document',d.uid,d);
  for(let n=0;n<view.chunks.length;n++)await emit('chunk',n,view.chunks[n]);
  for(const d of view.documents)await emit('graph',d.uid,graphs.get(d.uid));
  for(const [family,map]of [['alias',aliases],['title',titles],['number',numbers]])for(const [key,ids]of map)await emit(family,key,[...ids].sort(cmp));
  const catalogHashes=Object.create(null);for(let n=0;n<256;n++){const key=n.toString(16).padStart(2,'0');catalogHashes[key]=(await emit('catalog',key,catalog[n])).content_sha256;}
  if(pending.length)await onShards(pending);
  const manifest={...prepared.manifest,shard_count:shards,catalog:catalogHashes,...contentAddressed?{payload_format:'content-addressed-v1'}:{}};
  const manifestJson=canonical(manifest),manifestHash=await sha256(manifestJson);
  return {generation,manifest,manifestJson,manifestHash,counts,payloadBytes};
}
export function assertCurrentView(view,now){const moment=instant(now);assert(moment>=instant(view.validity_start)&&moment<instant(view.validity_end),'VIEW_EXPIRED');}
