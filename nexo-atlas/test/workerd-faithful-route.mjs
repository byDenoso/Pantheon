// Synthetic owner/session/source/index only. No real private corpus or network.
import {Miniflare} from 'miniflare';
import {build} from 'vite';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {fixture,stage} from './helpers/retrieval-import.fixture.mjs';
import {verifyGeneration,publishGeneration} from '../worker/retrieval/import.mjs';
import {sha256,TOWER_ID} from '../worker/retrieval/integrity.mjs';
import {DRIVE_CONNECTOR} from '../worker/drive-source.mjs';
import {RETRIEVAL_GATE} from '../worker/retrieval/route.mjs';
import {ORIGIN} from '../worker/auth.mjs';

await build({configFile:false,publicDir:false,logLevel:'warn',ssr:{noExternal:true,resolve:{conditions:['workerd','module','import']}},build:{ssr:'test/faithful-route-runtime-worker.mjs',outDir:'.sites-runtime/faithful-route-test',emptyOutDir:true,sourcemap:false,rollupOptions:{output:{entryFileNames:'index.js',format:'es'},external:[/^node:/]}}});
const sourceRevision='synthetic-current-drive-revision',sourceSize=512;
const f=await fixture('synthetic-real-route');
// This is a deliberately synthetic trusted-producer fixture, not a replayed
// private export. Expired/fixture-only real exports are never enabled here.
f.manifest.fixture_only=false;
f.manifest.transport={revision_id:sourceRevision,size:sourceSize};
f.manifestJson=JSON.stringify(f.manifest);f.manifestHash=await sha256(f.manifestJson);
const headers={'content-type':'application/json',origin:ORIGIN,'sec-fetch-site':'same-origin',
 'oai-authenticated-user-id':'synthetic-route-owner','oai-authenticated-user-email':'owner@example.invalid'};
let assertions=0;
const eq=(a,b,message)=>{assert.deepEqual(a,b,message);assertions++;};
const ok=(value,message)=>{assert.ok(value,message);assertions++;};
const gateResults=[];
for(const gate of [undefined,'wrong-gate',RETRIEVAL_GATE]) {
 let sourceReads=0,outbound=0,sourceFault=null,afterSource=null;
 const mf=new Miniflare({cf:false,modules:true,scriptPath:'.sites-runtime/faithful-route-test/index.js',
  compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],
  bindings:{NEXO_ATLAS_OWNER_EMAIL:'owner@example.invalid',...(gate===undefined?{}:{NEXO_ATLAS_RETRIEVAL:gate})},
  serviceBindings:{ASSETS:()=>new Response('SYNTHETIC_PUBLIC_ASSET'),CONNECTOR_TEST:async request=>{
   sourceReads++;eq(request.url,'https://connector-test.invalid/action');
   eq(await request.json(),{connector:DRIVE_CONNECTOR,action:'list_file_revisions',args:{fileId:TOWER_ID,pageSize:1000}});
   if(afterSource)await afterSource(sourceReads);
   if(sourceFault==='revoked')return Response.json({status:'reauthentication_required'});
   const id=sourceFault==='changed'?'different-revision':sourceRevision;
   return Response.json({status:'success',result:{structuredContent:{fileId:TOWER_ID,currentRevisionId:id,revisions:[{id,size:String(sourceSize),mimeType:'application/json'}]}}});
  }},outboundService:()=>{outbound++;throw new Error('EXTERNAL_NETWORK_FORBIDDEN');}});
 let cookie='';const db=await mf.getD1Database('DB');
 const call=async(path,body={},options={})=>{
  const h=new Headers(options.anonymous?{'content-type':'application/json'}:headers);
  if(cookie&&!options.noCookie)h.set('cookie',cookie);
  for(const[k,v]of Object.entries(options.headers||{})){if(v===null)h.delete(k);else h.set(k,v);}
  const method=options.method||'POST',response=await mf.dispatchFetch(ORIGIN+path,{method,headers:h,...(['GET','HEAD'].includes(method)?{}:{body:options.raw??JSON.stringify(body)})});
  eq(response.headers.get('cache-control'),'private, no-store');eq(response.headers.get('cdn-cache-control'),'no-store');
  eq(response.headers.get('x-content-type-options'),'nosniff');ok(response.headers.get('vary')?.includes('Cookie'));
  const raw=await response.text();return{response,raw,body:raw?JSON.parse(raw):null};
 };
 try {
  for(const name of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())
   for(const sql of readFileSync('drizzle/'+name,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const endpoint='/api/atlas-retrieval/search';
  for(const options of [{anonymous:true,noCookie:true},{noCookie:true},{noCookie:true,headers:{'oai-authenticated-user-id':'other','oai-authenticated-user-email':'other@example.invalid'}}])
   eq((await call(endpoint,{query:'hello'},options)).response.status,401);
  eq(sourceReads,0);
  const setup=await call('/api/atlas-pin/setup',{pin:'synthetic-only-faithful-route-pin'},{noCookie:true});eq(setup.response.status,200);
  const setCookie=setup.response.headers.get('set-cookie');ok(setCookie.includes('HttpOnly')&&setCookie.includes('Secure')&&setCookie.includes('SameSite=Strict'));cookie=setCookie.split(';')[0];
  eq((await call(endpoint,{query:'hello'},{headers:{origin:'https://foreign.invalid'}})).response.status,403);
  eq((await call(endpoint,{},{method:'GET'})).response.status,405);
  eq((await call(endpoint,{query:'hello'},{headers:{'content-type':'text/plain'}})).response.status,415);
  eq((await call(endpoint,{}, {raw:'{'})).response.status,400);
  eq((await call(endpoint,{}, {raw:JSON.stringify({query:'x'.repeat(17000)})})).response.status,413);
  eq(sourceReads,0);
  if(gate!==RETRIEVAL_GATE) {
   const disabled=await call(endpoint,{query:'hello'});eq(disabled.response.status,503);eq(disabled.body.error,'RETRIEVAL_COMPONENT_DISABLED');eq(sourceReads,0);
  } else {
   const unavailable=await call(endpoint,{query:'hello'});eq(unavailable.response.status,503);eq(unavailable.body.available,false);eq(sourceReads,0);
   // No hosted migration: apply schema and synthetic producer rows only in this
   // ephemeral local workerd D1 database.
   for(const sql of readFileSync('worker/retrieval/schema.sql','utf8').split(/;\s*(?=CREATE|$)/).map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
   await stage(db,f);await verifyGeneration(db,f.generation,f.manifestHash,async()=>{});
   await publishGeneration(db,{generation:f.generation,manifestHash:f.manifestHash,role:'LEARNER'});
   const positive=await call(endpoint,{query:'hello',k:5});eq(positive.response.status,200);eq(positive.body.hits[0].id,'DATA::SYNTHETIC');eq(positive.body.role,'LEARNER');eq(positive.body.hits[0].citation.source_id,TOWER_ID);eq(sourceReads,2);
   ok(!positive.raw.includes('session_id')&&!positive.raw.includes('session_epoch')&&!positive.raw.includes('synthetic-only-faithful-route-pin'));
   const negative=await call(endpoint,{query:'neverexists'});eq(negative.response.status,200);eq(negative.body.hits,[]);eq(negative.body.answer_status,'NO_EVIDENCE_IN_AUTHORIZED_INDEX');
   const start=sourceReads;
   for(const payload of [{query:'hello',role:'ENGINEER'},{query:'hello',source_id:'caller'},{query:'hello',generation:'caller'},{query:'hello',as_of:'2020-01-01'},{query:'hello',filters:{}},{query:'hello',mode:'temporal'}])
    eq((await call(endpoint,payload)).response.status,400);
   eq(sourceReads,start);
   const ignored=await call(endpoint+'?role=ENGINEER&generation=caller',{query:'hello'},{headers:{'x-nexo-role':'ENGINEER'}});eq(ignored.response.status,200);eq(ignored.body.role,'LEARNER');
   sourceFault='changed';const stale=await call(endpoint,{query:'hello'});eq(stale.response.status,409);eq(stale.body.error,'IMPORTED_GENERATION_STALE');ok(!stale.raw.includes('DATA::SYNTHETIC'));
   sourceFault='revoked';const access=await call(endpoint,{query:'hello'});eq(access.response.status,503);eq(access.body.connectorStatus,'reauthentication_required');ok(!access.raw.includes('DATA::SYNTHETIC'));
   sourceFault=null;let count=0;afterSource=async()=>{if(++count===2)await db.prepare('DELETE FROM atlas_sessions').run();};
   const revoked=await call(endpoint,{query:'hello'});eq(revoked.response.status,401);ok(!revoked.raw.includes('DATA::SYNTHETIC'));afterSource=null;
   const reads=sourceReads;eq((await call(endpoint,{query:'hello'})).response.status,401);eq(sourceReads,reads);
  }
  eq(outbound,0);gateResults.push({gate:gate??'absent',sourceReads,result:'PASS'});
 } finally {await mf.dispose();}
}
const receipt={suite:'Actual private Worker route through synthetic owner/PIN/D1 and fixed Drive metadata binding',runtime:'local workerd',assertions,gateResults,result:'PASS',real_private_corpus_used:false,external_requests:0,production_changed:false,common_mcp_connected:false};
console.log(JSON.stringify(receipt));
if(process.env.ROUTE_RECEIPT_PATH)writeFileSync(process.env.ROUTE_RECEIPT_PATH,JSON.stringify(receipt,null,2)+'\n');
