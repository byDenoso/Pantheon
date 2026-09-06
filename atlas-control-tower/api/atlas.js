import {gunzipSync} from 'node:zlib';
import {adapt} from '../lib/adapters.mjs';
import {adaptCanonical} from '../lib/canonical-adapter.mjs';
import {readCanonical} from '../lib/neon-reader.mjs';
import {fingerprint,subgraph,matches,state,traverse} from '../lib/model.mjs';
import * as readers from '../lib/readers.mjs';
import {auditReport,scientificDomains} from '../lib/audit.mjs';
import {learningReport,learningForEntity} from '../lib/learning.mjs';

let packed=null;try{packed=(await import('../lib/snapshot.mjs')).default}catch{}
const snapshot=packed?JSON.parse(gunzipSync(Buffer.from(packed,'base64')).toString()):{capturedAt:null,raw:{},ops:{sync:null,model:{events:[]}}};
let ops=snapshot.ops,canonical=null,canonicalLoaded=false,graph=adapt(snapshot.raw,ops),pending=null,lastAttempt=0,lastSync=null;
let sources={
  drive:{status:'FROZEN_ANCESTRAL',lastReadAt:null,observedAt:snapshot.capturedAt,snapshotAt:snapshot.capturedAt,authority:false},
  neon:{status:'BUNDLED_FALLBACK',lastReadAt:null,observedAt:null,batchId:null,authority:true},
  operational:{status:'SNAPSHOT',lastReadAt:snapshot.capturedAt,observedAt:ops.sync?.lastSyncedAt,authority:true}
};
let graphFingerprint=fingerprint(graph);

function sourceVersion(){return sources.neon.observedAt||sources.neon.batchId||snapshot.capturedAt||''}
function contract(view){const ids=new Set((view.nodes||[]).map(n=>n.id));return{nodes:view.nodes||[],edges:view.edges||[],total:view.total??(view.nodes||[]).length,hasMore:!!view.hasMore,truncated:!!view.truncated,depth:Number(view.depth)||1,fingerprint:graphFingerprint,sourceVersion:sourceVersion(),issues:(graph.issues||[]).filter(i=>!i.source||ids.has(i.source)||ids.has(i.target)).slice(0,50)}}

async function sync(){
  if(pending)return pending;
  if(Date.now()-lastAttempt<30000&&canonicalLoaded)return lastSync||{outcome:'COALESCED',sources};
  lastAttempt=Date.now();
  pending=(async()=>{
    const before=fingerprint(graph),events=[{stage:'READ_NEON_CANONICAL',at:new Date().toISOString()}];
    const [scienceRead,opsRead]=await Promise.allSettled([
      readCanonical().then(d=>{canonical=d;canonicalLoaded=true;sources.neon={status:'READ_OK_CANONICAL',lastReadAt:new Date().toISOString(),observedAt:d.observedAt,batchId:d.batchId,payloadHash:d.payloadHash,authority:true};return d}).catch(e=>{sources.neon={...sources.neon,status:canonicalLoaded?'STALE':'UNAVAILABLE',lastReadAt:new Date().toISOString(),error:e.message};throw e}),
      readers.neon().then(d=>{ops=d;sources.operational={status:'READ_OK',lastReadAt:new Date().toISOString(),observedAt:d.sync?.lastSyncedAt,authority:true};return d}).catch(e=>{sources.operational={...sources.operational,status:'STALE',lastReadAt:new Date().toISOString(),error:e.message};throw e})
    ]);
    events.push({stage:'NORMALIZE_COMPARE',at:new Date().toISOString(),science:scienceRead.status,operational:opsRead.status});
    if(canonical)graph=adaptCanonical(canonical.science,canonical.learning,ops);
    graphFingerprint=fingerprint(graph);
    const after=graphFingerprint;
    let changes=0;
    if(after!==before)changes=1;
    const outcome=scienceRead.status==='fulfilled'?(after===before?'NO_CHANGE':'UPDATED'):(canonicalLoaded?'STALE_CANONICAL_CACHE':'CANONICAL_UNAVAILABLE');
    lastSync={outcome,changes,fingerprint:after,completedAt:new Date().toISOString(),sources,events,scienceAuthority:'NEON science_v1',towerState:'FROZEN_ANCESTRAL_READ_ONLY'};
    return lastSync;
  })().finally(()=>pending=null);
  return pending;
}

async function ensureCanonical(){if(!canonicalLoaded)await sync()}

function summary(filters){
  const nodes=graph.nodes.filter(n=>matches(n,filters));
  const count=key=>nodes.reduce((a,n)=>{const k=typeof key==='function'?key(n):n[key];if(k)a[k]=(a[k]||0)+1;return a},{});
  const activity={};
  for(const n of nodes.filter(n=>['TEST','RUN','AUTOMATION_RUN'].includes(n.type))){const date=String(n.updatedAt||'').match(/^\d{4}-\d{2}-\d{2}/)?.[0];if(date)activity[date]=(activity[date]||0)+1}
  const allDomains=count(n=>n.type==='TEST'?n.domain:null);
  return{counts:count('type'),statuses:count(n=>n.type==='TEST'?state(n.status):null),domains:scientificDomains(allDomains),activity,claims:count(n=>n.type==='CLAIM'?state(n.status):null),claimKinds:count(n=>n.type==='CLAIM'?n.subtype:null),total:nodes.length,sources,projection:{fingerprint:graphFingerprint,capturedAt:snapshot.capturedAt,sourceVersion:sourceVersion(),unresolvedRelations:(graph.issues||[]).filter(i=>i.reason==='UNRESOLVED_ENDPOINT').length,unresolvedDomain:allDomains.UNMAPPED||0,scienceAuthority:'NEON science_v1',towerState:'FROZEN_ANCESTRAL_READ_ONLY',canonicalLoaded},lastSync};
}

export default async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const url=new URL(req.url,'https://atlas.local'),q=Object.fromEntries(url.searchParams),route=q.route||url.pathname.split('/').pop();
  function send(data,status=200){res.statusCode=status;res.end(JSON.stringify(data))}
  try{
    if(route==='sync'){
      if(req.method!=='POST')return send({error:'METHOD_NOT_ALLOWED'},405);
      const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host)return send({error:'ORIGIN_NOT_ALLOWED'},403);
      return send(await sync());
    }
    if(req.method!=='GET')return send({error:'METHOD_NOT_ALLOWED'},405);
    if(q.refresh==='1')await sync();else await ensureCanonical();
    if(route==='state')return send({...summary(q),capabilities:{scienceAuthority:'NEON science_v1',tower:'FROZEN_ANCESTRAL_READ_ONLY',canonicalReader:'NEON_DATA_API_OIDC',oidcAvailable:!!process.env.VERCEL_OIDC_TOKEN,operationalReader:'EXISTING_FLIGHT_RECORDER',cache:'MEMORY_WITH_BUNDLED_FALLBACK',backgroundFiveMinutes:false}});
    if(route==='graph')return send(contract(subgraph(graph,q)));
    if(route==='audit')return send(auditReport(graph,{sample:Number(q.sample)||12}));
    if(route==='learning')return send(q.id?{entity:q.id,relations:learningForEntity(graph,q.id)}:learningReport(graph));
    if(route==='entity'){
      const n=graph.nodes.find(n=>n.id===q.id);if(!n)return send({error:'ENTITY_NOT_FOUND'},404);
      const edges=graph.edges.filter(e=>e.source===n.id||e.target===n.id);
      if(q.view==='lineage')return send(contract(subgraph(graph,{focus:q.id,mode:'lineage'})));
      if(q.view==='files'){const set=new Set(traverse(graph,n.id,'descendants',20000,['PRODUCES','EXECUTED_AS']));return send(graph.nodes.filter(n=>set.has(n.id)&&['FILE','ARTIFACT','DATASET'].includes(n.type)).slice(0,100))}
      return send({entity:n,relations:edges.slice(0,200),relationCount:edges.length});
    }
    if(route==='automation-runs')return send(graph.nodes.filter(n=>n.type==='AUTOMATION_RUN'&&matches(n,q)).slice(Number(q.offset)||0,(Number(q.offset)||0)+100));
    if(route==='learning-relations')return send(graph.nodes.filter(n=>n.type==='LEARNING_RELATION'&&matches(n,q)));
    if(route==='ops')return send(ops);
    return send({error:'NOT_FOUND'},404);
  }catch(e){return send({error:'REQUEST_FAILED',detail:String(e?.message||e).slice(0,180)},500)}
}
