import {gunzipSync} from 'node:zlib';
import {adapt} from '../lib/adapters.mjs';
import {fingerprint, subgraph, matches, state, traverse, safeUrl} from '../lib/model.mjs';
import * as readers from '../lib/readers.mjs';
import {auditReport, normalizeAudit, scientificDomains} from '../lib/audit.mjs';
import {learningReport, normalizeLearning, learningForEntity, learningLineage} from '../lib/learning.mjs';
import {decorateGraph} from '../lib/naming.mjs';
import {normalizeGraph, contractIssues, SOURCES, FRESHNESS} from '../lib/graph-contract.mjs';
import {configuredMode, createV1Reader, resolveSource, fallbackIssue, v1BaseUrl} from '../lib/datasource.mjs';
import {createNeonV1Reader} from '../lib/neon-v1.mjs';

let packed = null; try {packed = (await import('../lib/snapshot.mjs')).default} catch {}
const snapshot = packed
 ? JSON.parse(gunzipSync(Buffer.from(packed, 'base64')).toString())
 : {capturedAt:null, raw:{}, ops:{sync:null, model:{events:[]}}};

const project = (raw, ops) => decorateGraph(adapt(raw, ops));
let raw = snapshot.raw, ops = snapshot.ops, graph = project(raw, ops), revision = '', pending = null, lastAttempt = 0;
let sources = {
 drive:{status:'SNAPSHOT', lastReadAt:snapshot.capturedAt, observedAt:null, snapshotAt:snapshot.capturedAt},
 neon:{status:'SNAPSHOT', lastReadAt:snapshot.capturedAt, observedAt:ops.sync?.lastSyncedAt}
};
let lastSync = null;
let graphFingerprint = fingerprint(graph);

const directNeonV1 = createNeonV1Reader();
const v1 = v1BaseUrl() ? createV1Reader() : directNeonV1;
const usingDirectNeon = !v1BaseUrl();

const sourceVersion = () => sources.drive.observedAt || snapshot.capturedAt || '';
const decide = force => resolveSource({mode: configuredMode(), reader: v1, force});
const graphFilters=q=>{const {focus,mode,offset,limit,depth,route,probe,refresh,...filters}=q||{};return filters};

function contract(view, decision, {cache = ''} = {}) {
 const ids = new Set((view.nodes || []).map(n => n.id));
 const issue = fallbackIssue(decision);
 return {
  focus: view.focus || '', nodes: view.nodes || [], edges: view.edges || [],
  total: view.total ?? (view.nodes || []).length,
  hasMore: !!view.hasMore, truncated: !!view.truncated, depth: Number(view.depth) || 1,
  fingerprint: graphFingerprint, sourceVersion: sourceVersion(), source: decision.source,
  freshness: decision.freshness, cache,
  issues:[...(issue ? [issue] : []), ...(graph.issues || []).filter(i => ids.has(i.source) || ids.has(i.target)).slice(0,50)]
 };
}

async function legacySync() {
 if (pending) return pending;
 if (Date.now() - lastAttempt < 30000) return lastSync || {outcome:'COALESCED', sources};
 lastAttempt = Date.now();
 pending = (async () => {
  const before = fingerprint(graph), events = [{stage:'READ_SOURCES', at:new Date().toISOString()}];
  await Promise.allSettled([
   readers.drive(raw, revision)
    .then(d => {raw=d.raw;revision=d.revision;sources.drive={status:'READ_OK',lastReadAt:new Date().toISOString(),observedAt:d.observedAt||sources.drive.observedAt}})
    .catch(() => {sources.drive={...sources.drive,status:'STALE',error:process.env.GOOGLE_SERVICE_ACCOUNT_JSON||process.env.GOOGLE_REFRESH_TOKEN?'DRIVE_READ_UNAVAILABLE':'GOOGLE_AUTH_NOT_CONFIGURED'}}),
   readers.neon()
    .then(d => {ops=d;sources.neon={status:'READ_OK',lastReadAt:new Date().toISOString(),observedAt:d.sync?.lastSyncedAt}})
    .catch(() => {sources.neon={...sources.neon,status:'STALE',error:'OPERATIONAL_SOURCE_UNAVAILABLE'}})
  ]);
  events.push({stage:'NORMALIZE_COMPARE',at:new Date().toISOString()});
  const next=project(raw,ops),after=fingerprint(next);let changes=0;
  const old=new Map(graph.nodes.map(n=>[n.id,JSON.stringify(n)]));
  for(const n of next.nodes){if(old.get(n.id)!==JSON.stringify(n))changes++;old.delete(n.id)}changes+=old.size;
  graph=next;graphFingerprint=after;
  lastSync={outcome:after===before?'NO_CHANGE':'UPDATED',changes,fingerprint:after,completedAt:new Date().toISOString(),sources,events};
  return lastSync;
 })().finally(()=>pending=null);
 return pending;
}

function summary(filters, decision) {
 const nodes=graph.nodes.filter(n=>matches(n,filters));
 const count=key=>nodes.reduce((a,n)=>{const k=typeof key==='function'?key(n):n[key];if(k)a[k]=(a[k]||0)+1;return a},{});
 const activity={};
 for(const n of nodes.filter(n=>['TEST','RUN','AUTOMATION_RUN'].includes(n.type))){const date=String(n.updatedAt||'').match(/^\d{4}-\d{2}-\d{2}/)?.[0];if(date)activity[date]=(activity[date]||0)+1}
 const allDomains=count(n=>n.type==='TEST'?n.domain:null);
 return {counts:count('type'),statuses:count(n=>n.type==='TEST'?state(n.status):null),domains:scientificDomains(allDomains),activity,claims:count(n=>n.type==='CLAIM'?state(n.status):null),claimKinds:count(n=>n.type==='CLAIM'?n.subtype:null),total:nodes.length,sources,projection:{fingerprint:graphFingerprint,capturedAt:snapshot.capturedAt,sourceVersion:sourceVersion(),unresolvedRelations:graph.issues.length,unresolvedDomain:allDomains.UNMAPPED||0,source:decision.source,freshness:decision.freshness},lastSync};
}

function capabilities(decision) {
 return {
  googleConfigured:!!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON||process.env.GOOGLE_REFRESH_TOKEN),
  operationalReader:usingDirectNeon?'DIRECT_NEON_DATA_API':'REMOTE_V1',
  cache:'MEMORY_WITH_BUNDLED_FALLBACK', backgroundFiveMinutes:false,
  dataSource:{requested:decision.mode,effective:decision.source,freshness:decision.freshness,reason:decision.reason,usedFallback:decision.usedFallback,v1Configured:!!v1BaseUrl()||directNeonV1.configured,v1Transport:usingDirectNeon?'VERCEL_OIDC_NEON_DATA_API':'HTTP_V1',v1Health:v1.health}
 };
}

export default async function handler(req,res) {
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 const url=new URL(req.url,'https://atlas.local'),q=Object.fromEntries(url.searchParams),route=q.route||url.pathname.split('/').pop();
 const cdnSafe=req.method==='GET'&&['graph','state','audit','learning','entity'].includes(route)&&q.refresh!=='1'&&q.probe!=='1';
 if(cdnSafe)res.setHeader('Vercel-CDN-Cache-Control','public, max-age=30, stale-while-revalidate=60');
 const send=(data,status=200)=>{const fp=data?.fingerprint||data?.projection?.fingerprint;if(fp)res.setHeader('X-Atlas-Fingerprint',String(fp));res.statusCode=status;res.end(JSON.stringify(data))};
 try {
  if(route==='sync'){
   if(req.method!=='POST')return send({error:'METHOD_NOT_ALLOWED'},405);
   const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host)return send({error:'ORIGIN_NOT_ALLOWED'},403);
   const decision=await decide(true);
   const result=decision.source===SOURCES.V1&&typeof v1.refresh==='function'?await v1.refresh():await legacySync();
   return send({...result,dataSource:capabilities(await decide(true)).dataSource});
  }
  if(req.method!=='GET')return send({error:'METHOD_NOT_ALLOWED'},405);

  const decision=await decide(q.probe==='1'),useV1=decision.source===SOURCES.V1;

  if(route==='health')return send({ok:true,contract:'v1',dataSource:capabilities(decision).dataSource,fingerprint:graphFingerprint,sourceVersion:sourceVersion()});

  if(route==='state'){
   if(q.refresh==='1'){if(useV1&&typeof v1.refresh==='function')await v1.refresh();else await legacySync()}
   if(useV1){try{const v=await v1.state(q);return send({...v,projection:{...(v.projection||{}),source:decision.source,freshness:decision.freshness},capabilities:capabilities(decision)})}catch(e){console.error('[atlas:v1:state]',e?.message||e)}}
   return send({...summary(q,useV1?{...decision,source:SOURCES.LEGACY,freshness:FRESHNESS.FALLBACK}:decision),capabilities:capabilities(decision)});
  }

  if(route==='graph'){
   if(useV1){try{const payload=await v1.graph(q),drift=contractIssues(payload).filter(i=>i.level==='ERROR');if(!drift.length){const view=normalizeGraph(payload,{focus:q.focus||''}),vsummary=await v1.state(graphFilters(q));return send({...view,summary:vsummary,source:SOURCES.V1,freshness:decision.freshness,cache:payload.cache||'',issues:[...view.issues,...contractIssues(payload)]})}}catch(e){console.error('[atlas:v1:graph]',e?.message||e)}}
   const fallbackDecision=useV1?{...decision,source:SOURCES.LEGACY,freshness:FRESHNESS.FALLBACK,usedFallback:true,reason:'V1_GRAPH_UNAVAILABLE'}:decision;
   return send({...contract(subgraph(graph,q),fallbackDecision),summary:summary(graphFilters(q),fallbackDecision)});
  }

  if(route==='audit'){
   if(useV1){try{return send(normalizeAudit(await v1.audit(q),{source:SOURCES.V1}))}catch(e){console.error('[atlas:v1:audit]',e?.message||e)}}
   return send(auditReport(graph,{sample:Number(q.sample)||12,source:SOURCES.LEGACY}));
  }

  if(route==='learning'){
   if(useV1){try{const payload=await v1.learning(q);return q.id?send(payload):send(normalizeLearning(payload,{source:SOURCES.V1}))}catch(e){console.error('[atlas:v1:learning]',e?.message||e)}}
   if(q.view==='lineage')return send(learningLineage(graph,q.id));
   if(q.id)return send({entity:q.id,relations:learningForEntity(graph,q.id),source:decision.source});
   return send(learningReport(graph,{source:SOURCES.LEGACY}));
  }

  if(route==='entity'){
   if(useV1){try{const v=await v1.entity(q);if(q.view==='files'&&Array.isArray(v))return send(v);if(v&&(v.entity||Array.isArray(v.nodes)))return send({...v,source:SOURCES.V1})}catch(e){console.error('[atlas:v1:entity]',e?.message||e)}}
   const n=graph.nodes.find(n=>n.id===q.id);if(!n)return send({error:'ENTITY_NOT_FOUND'},404);
   const edges=graph.edges.filter(e=>e.source===n.id||e.target===n.id);
   if(q.view==='lineage')return send(contract(subgraph(graph,{focus:q.id,mode:'lineage'}),decision));
   if(q.view==='files'){const set=new Set(traverse(graph,n.id,'descendants',20000,['PRODUCES','EXECUTED_AS']));return send(graph.nodes.filter(x=>set.has(x.id)&&['FILE','ARTIFACT'].includes(x.type)).slice(0,100))}
   const {searchText,...entity}=n;return send({entity,relations:edges.slice(0,200),relationCount:edges.length,source:SOURCES.LEGACY});
  }

  if(route==='automation-runs'){const offset=Number(q.offset)||0;return send(graph.nodes.filter(n=>n.type==='AUTOMATION_RUN'&&matches(n,q)).slice(offset,offset+100))}
  if(route==='learning-relations')return send(graph.nodes.filter(n=>n.type==='LEARNING_RELATION'&&matches(n,q)));
  if(route==='ops')return send(ops);
  return send({error:'NOT_FOUND'},404);
 } catch(error) {
  console.error('[atlas:request]',route,error?.message||error);
  return send({error:'REQUEST_FAILED'},500);
 }
}
