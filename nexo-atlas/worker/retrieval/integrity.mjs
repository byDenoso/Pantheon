import {V13_BINDINGS} from './v13-bindings.mjs';
export const TOWER_ID = '1m97cFmEkw19yiqD_6FWPG4j1lDCAYM4z';
export const POLICY = V13_BINDINGS.policy;
export const SCHEMA = V13_BINDINGS.schema;
export const ENGINE_CONFIG = V13_BINDINGS.config;
export const ENGINE_CODE = V13_BINDINGS.code_sha256;
export const CHUNKER = V13_BINDINGS.chunker;
export const ENGINE_VERSION = V13_BINDINGS.engine_version;
export const LIMITS = Object.freeze({queryCodepoints:4000, queryBytes:16000, terms:1024, aliases:1024,
  chunks:20000, documents:6000, postingPairs:2_000_000, rawShardBytes:2_000_000,
  totalReadBytes:24_000_000, responseBytes:2_000_000, sqlBinds:90, shards:1536, graphFields:20000, graphEdges:100000, graphEdgeVisits:400000});
export function fail(code) { throw new Error(code); }
export const assert = (ok, code) => { if (!ok) fail(code); };
export const utf8 = value => new TextEncoder().encode(value);
export const sha256 = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  typeof value === 'string' ? utf8(value) : value)), v => v.toString(16).padStart(2,'0')).join('');
export function cmp(a,b) {
  // Python orders Unicode code points; JS relational comparison orders UTF-16.
  const left=a[Symbol.iterator](),right=b[Symbol.iterator]();
  for(;;){const x=left.next(),y=right.next();if(x.done||y.done)return x.done?(y.done?0:-1):1;
    const delta=x.value.codePointAt(0)-y.value.codePointAt(0);if(delta)return delta<0?-1:1;}
}
export const identity = (family,key) => JSON.stringify([family,String(key)]);
export const bucket = async (family,key) => (await sha256(identity(family,key))).slice(0,2);
export function instant(value) {
  // Epoch microseconds preserve Python's half-open validity boundaries.
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value ?? '');
  assert(m, 'INVALID_VALIDITY_TIMESTAMP');
  const [year,month,day,hour,minute,second]=m[1].split(/[-T:]/).map(Number);
  const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  assert(year>=1&&year<=9999&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&hour<24&&minute<60&&second<60,'INVALID_VALIDITY_TIMESTAMP');
  if(m[3]!=='Z'){const [oh,om]=m[3].slice(1).split(':').map(Number);assert(oh<24&&om<60,'INVALID_VALIDITY_TIMESTAMP');}
  const ms = Date.parse(m[1]+m[3]); assert(Number.isFinite(ms)&&ms>=-62135596800000&&ms<=253402300799999, 'INVALID_VALIDITY_TIMESTAMP');
  return BigInt(ms)*1000n + BigInt((m[2] || '').padEnd(6,'0'));
}
export function validateManifest(m, generation) {
  assert(m.payload_format===undefined||m.payload_format==='content-addressed-v1','PAYLOAD_FORMAT_INVALID');
  assert(m?.schema === SCHEMA && m.generation === generation, 'MANIFEST_IDENTITY_INVALID');
  assert(m.snapshot?.source_id === TOWER_ID && m.policy === POLICY, 'MANIFEST_SCOPE_INVALID');
  assert(m.config === ENGINE_CONFIG && m.code_sha256 === ENGINE_CODE && m.chunker === CHUNKER &&
    m.engine_version === ENGINE_VERSION && m.contextual === true && m.expanded === false &&
    m.include_inactive === false, 'ENGINE_BINDING_INVALID');
  for (const key of ['scope_sha256','tokenizer_sha256','chunker_sha256','source_export_sha256','authorization_source_sha256'])
    assert(/^[a-f0-9]{64}$/.test(m[key]), 'MANIFEST_HASH_INVALID');
  assert(/^[a-f0-9]{64}$/.test(m.snapshot.source_sha256) && typeof m.snapshot.revision === 'string' &&
    typeof m.authorization_revision === 'string' && typeof m.role === 'string', 'SOURCE_BINDING_INVALID');
  assert(m.size > 0 && m.size <= LIMITS.chunks && Number.isInteger(m.size) &&
    m.document_count > 0 && m.document_count <= LIMITS.documents && Number.isInteger(m.document_count) &&
    m.average > 0 && Number.isFinite(m.average), 'INDEX_RESOURCE_BOUND');
  assert(m.graph_node_count===m.document_count&&Number.isInteger(m.edge_count)&&m.edge_count>=0&&m.edge_count<=LIMITS.graphEdges,'GRAPH_MANIFEST_INVALID');
  assert(instant(m.validity_start) < instant(m.validity_end), 'MANIFEST_VALIDITY_INVALID');
  assert(m.catalog && Object.keys(m.catalog).length === 256 && Object.entries(m.catalog).every(([k,v]) =>
    /^[a-f0-9]{2}$/.test(k) && /^[a-f0-9]{64}$/.test(v)), 'MANIFEST_CATALOG_INVALID');
}
export async function decodeRow(row, expectedHash, maxBytes=LIMITS.rawShardBytes) {
  assert(row && row.content_sha256 === expectedHash, 'SHARD_HASH_BINDING_INVALID');
  let bytes = row.payload instanceof ArrayBuffer ? new Uint8Array(row.payload) : new Uint8Array(row.payload);
  assert(bytes.byteLength <= maxBytes, 'SHARD_RESOURCE_BOUND');
  const contentAddressed=row.encoding==='cas-json'||row.encoding==='cas-gzip';
  if (row.encoding === 'gzip'||row.encoding==='cas-gzip') {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const parts=[]; let count=0;
    try { for (;;) { const {done,value}=await reader.read(); if(done) break;
      count+=value.length; if(count>maxBytes) {await reader.cancel(); fail('SHARD_RESOURCE_BOUND');} parts.push(value); }
    } finally {reader.releaseLock();}
    bytes=new Uint8Array(count);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  } else assert(row.encoding === 'json'||row.encoding==='cas-json', 'SHARD_ENCODING_INVALID');
  assert(bytes.byteLength <= maxBytes && await sha256(bytes) === expectedHash, 'SHARD_CONTENT_HASH_INVALID');
  let payload; try {payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));} catch {fail('SHARD_JSON_INVALID');}
  if(contentAddressed){assert(payload&&Object.keys(payload).length===1&&Object.hasOwn(payload,'data'),'CONTENT_PAYLOAD_INVALID');
    payload={generation:row.generation,family:row.family,key:row.lookup_key,data:payload.data};}
  return {payload,bytes:bytes.byteLength};
}
