// Actual SDK Client -> actual stateless SDK Worker -> actual ephemeral D1.
// All identities, PINs, grants, connector metadata and corpus are synthetic.
import {Miniflare} from 'miniflare';
import {build} from 'vite';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture,stage} from './helpers/retrieval-import.fixture.mjs';
import {verifyGeneration,publishGeneration} from '../worker/retrieval/import.mjs';
import {sha256,TOWER_ID,POLICY} from '../worker/retrieval/integrity.mjs';
import {DRIVE_CONNECTOR} from '../worker/drive-source.mjs';
import {RETRIEVAL_GATE} from '../worker/retrieval/route.mjs';
import {MCP_GATE,GRANT_APPROVAL_GATE,GRANT_SCOPE,MAX_GRANT_MS} from '../worker/mcp/grants.mjs';
import {MCP_TOOL,MCP_TOOLS} from '../worker/mcp/route.mjs';
import {SEARCH_POLICY} from '../worker/retrieval/query-router.mjs';
import {ORIGIN} from '../worker/auth.mjs';

await build({configFile:false,publicDir:false,logLevel:'warn',ssr:{noExternal:true,resolve:{conditions:['workerd','module','import']}},build:{ssr:'test/mcp-runtime-worker.mjs',outDir:'.sites-runtime/mcp-test',emptyOutDir:true,sourcemap:false,rollupOptions:{output:{entryFileNames:'index.js',format:'es'},external:[/^node:/]}}});
const sourceRevision='synthetic-mcp-current-revision',sourceSize=512;
const f=await fixture('synthetic-mcp-bridge');
f.manifest.fixture_only=false;f.manifest.transport={revision_id:sourceRevision,size:sourceSize};
f.manifestJson=JSON.stringify(f.manifest);f.manifestHash=await sha256(f.manifestJson);
const owner={'oai-authenticated-user-id':'synthetic-mcp-owner','oai-authenticated-user-email':'owner@example.invalid'};
const hash=v=>createHash('sha256').update(v).digest('hex');
let assertions=0,sourceReads=0,outbound=0,sourceFault=null,afterSource=null,afterHead=null,requests=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};const ok=(v,label)=>{assert.ok(v,label);assertions++;};
const results=[];
for(const [label,gate,approval] of [['absent',undefined,undefined],['wrong','wrong',undefined],['enabled_pending',MCP_GATE,undefined],['synthetic_approved',MCP_GATE,GRANT_APPROVAL_GATE]]) {
 const mf=new Miniflare({cf:false,modules:true,scriptPath:'.sites-runtime/mcp-test/index.js',
  compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],
  bindings:{NEXO_ATLAS_OWNER_EMAIL:'owner@example.invalid',NEXO_ATLAS_RETRIEVAL:RETRIEVAL_GATE,...(gate?{NEXO_ATLAS_MCP:gate}:{}),...(approval?{NEXO_ATLAS_MCP_GRANT_APPROVAL:approval}:{})},
  serviceBindings:{ASSETS:()=>new Response('SYNTHETIC'),CONNECTOR_TEST:async request=>{
   sourceReads++;eq(await request.json(),{connector:DRIVE_CONNECTOR,action:'list_file_revisions',args:{fileId:TOWER_ID,pageSize:1000}});
   if(afterSource)await afterSource();
   if(sourceFault==='revoked')return Response.json({status:'reauthentication_required'});
   const id=sourceFault==='changed'?'stale-revision':sourceRevision;
   return Response.json({status:'success',result:{structuredContent:{fileId:TOWER_ID,currentRevisionId:id,revisions:[{id,size:String(sourceSize),mimeType:'application/json'}]}}});
  },CONTROL_TEST:async()=>{if(afterHead)await afterHead();return new Response('ok');}},
  outboundService:()=>{outbound++;throw new Error('EXTERNAL_NETWORK_FORBIDDEN');}});
 const db=await mf.getD1Database('DB');let cookie='',identity={},client,lastSdkStatus;
 const raw=async(path,body={},options={})=>{
  const headers=new Headers({'content-type':'application/json',accept:'application/json, text/event-stream',...identity,...options.headers});
  if(options.browser){for(const[k,v]of Object.entries({...owner,origin:ORIGIN,'sec-fetch-site':'same-origin'}))headers.set(k,v);if(cookie)headers.set('cookie',cookie);}
  for(const[k,v]of Object.entries(options.override||{})){if(v===null)headers.delete(k);else headers.set(k,v);}
  const method=options.method||'POST',response=await mf.dispatchFetch(ORIGIN+path,{method,headers,...(['GET','HEAD'].includes(method)?{}:{body:options.raw??JSON.stringify(body)})});
  const text=await response.text();return {response,text,body:text?JSON.parse(text):null};
 };
 const sdkFetch=async(input,init={})=>{
  const request=new Request(input,init),headers=new Headers(request.headers);
  for(const[k,v]of Object.entries(identity))headers.set(k,v);
  requests++;const response=await mf.dispatchFetch(request.url,{method:request.method,headers,...(['GET','HEAD'].includes(request.method)?{}:{body:await request.arrayBuffer()})});
  lastSdkStatus=response.status;eq(response.headers.get('cache-control'),'private, no-store');eq(response.headers.get('cdn-cache-control'),'no-store');
  eq(response.headers.get('mcp-session-id'),null);ok(response.headers.get('vary').includes('oai-authenticated-user-id'));
  return response;
 };
 const invoke=(args={query:'hello'})=>client.callTool({name:MCP_TOOL,arguments:args});
 const denied=async(status,args)=>{await assert.rejects(()=>invoke(args),error=>{
  eq(lastSdkStatus,status,error.message);return true;
 });assertions++;};
 const expectToolError=async(args,code)=>{let result;try{result=await invoke(args);}catch(error){ok(error.message.includes(code)||error.message.includes('validation'),error.message);return;}
  eq(result.isError,true);ok(!JSON.stringify(result).includes('DATA::SYNTHETIC'));if(code)ok(JSON.stringify(result).includes(code),JSON.stringify(result));};
 const grant=async()=>{const response=await raw('/api/atlas-mcp/grant',{confirm:GRANT_APPROVAL_GATE,days:30},{browser:true});eq(response.response.status,201,response.text);return response;};
 try {
  for(const name of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+name,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  await db.prepare(readFileSync('worker/mcp/grants.sql','utf8')).run();
  if(gate!==MCP_GATE){eq((await raw('/mcp',{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}})).response.status,503);results.push({label,result:'PASS'});continue;}
  client=new Client({name:'synthetic-real-sdk-client',version:'1.0.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL(ORIGIN+'/mcp'),{fetch:sdkFetch}));
  eq(client.getServerVersion().name,'nexoresearch-readonly');
  const tools=await client.listTools();eq(tools.tools.map(x=>x.name),MCP_TOOLS);
  eq(tools.tools[0].annotations.readOnlyHint,true);eq(tools.tools[0].inputSchema.additionalProperties,false);
  const discovery=JSON.stringify(tools);ok(!discovery.includes(TOWER_ID)&&!discovery.includes('synthetic-mcp-owner')&&!discovery.includes('DATA::SYNTHETIC'));
  await denied(401);identity=owner;await denied(403);
  identity={...owner,'oai-authenticated-user-id':'other-owner'};await denied(403);identity=owner;
  eq((await raw('/api/atlas-mcp/grant',{confirm:GRANT_APPROVAL_GATE,days:30},{browser:true})).response.status,401);
  const setup=await raw('/api/atlas-pin/setup',{pin:'synthetic-mcp-only-pin'},{browser:true});eq(setup.response.status,200,setup.text);cookie=setup.response.headers.get('set-cookie').split(';')[0];
  await denied(403); // Browser login never creates an MCP grant.
  eq((await db.prepare('SELECT count(*) AS n FROM atlas_mcp_grants').first()).n,0);
  if(!approval){eq((await raw('/api/atlas-mcp/grant',{confirm:GRANT_APPROVAL_GATE,days:30},{browser:true})).response.status,403);await denied(403);results.push({label,result:'PASS'});continue;}
  for(const body of [{},{confirm:GRANT_APPROVAL_GATE,days:31},{confirm:GRANT_APPROVAL_GATE,days:0},{confirm:GRANT_APPROVAL_GATE,days:30,role:'ENGINEER'}])eq((await raw('/api/atlas-mcp/grant',body,{browser:true})).response.status,400);
  eq((await raw('/api/atlas-mcp/grant',{confirm:GRANT_APPROVAL_GATE,days:30},{browser:true,override:{origin:'https://foreign.invalid'}})).response.status,403);
  eq((await raw('/api/atlas-mcp/grant',{confirm:GRANT_APPROVAL_GATE,days:30},{browser:true,override:{cookie:null}})).response.status,401);
  const created=await grant();eq(created.body.role,'LEARNER');eq(created.body.scope,GRANT_SCOPE);ok(!created.text.includes('grant_id')&&!created.text.includes('credential'));
  const g=await db.prepare('SELECT * FROM atlas_mcp_grants').first();eq(g.expires_at-g.created_at,MAX_GRANT_MS);eq(g.policy,POLICY);
  const pin=(await db.prepare('SELECT pin_hash FROM atlas_owner WHERE id=1').first()).pin_hash;eq(g.credential_sha256,hash(pin));
  for(const sql of readFileSync('worker/retrieval/schema.sql','utf8').split(/;\s*(?=CREATE|$)/).map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  await stage(db,f);await verifyGeneration(db,f.generation,f.manifestHash,async()=>{});await publishGeneration(db,{generation:f.generation,manifestHash:f.manifestHash,role:'LEARNER'});
  const caps=await client.callTool({name:'nexo_capabilities',arguments:{}});eq(caps.isError,undefined);eq(caps.structuredContent.source.source_id,TOWER_ID);eq(caps.structuredContent.roles,['LEARNER']);eq(caps.structuredContent.other_runtimes_authorized,false);eq(caps.structuredContent.writes_enabled,false);eq(caps.structuredContent.source_mode,'DRIVE_REVISION_VERIFIED_PRIVATE_SCOPED_D1');eq(caps.structuredContent.search_policy,SEARCH_POLICY);
  const initial=sourceReads;const positive=await invoke({query:'hello',k:5,mode:'lexical'});eq(positive.isError,undefined);eq(positive.structuredContent.hits[0].id,'DATA::SYNTHETIC');eq(positive.structuredContent.role,'LEARNER');eq(positive.structuredContent.hits[0].citation.source_id,TOWER_ID);eq(sourceReads-initial,2);
  ok(!JSON.stringify(positive).includes(g.grant_id)&&!JSON.stringify(positive).includes(pin));
  for(const mode of ['auto','exact']){const r=await invoke({query:'DATA::SYNTHETIC',mode});eq(r.isError,undefined);eq(r.structuredContent.hits[0].id,'DATA::SYNTHETIC');}
  const exactEmpty=await invoke({query:'TEST-NOT-AUTHORIZED',mode:'auto'});eq(exactEmpty.structuredContent.hits,[]);
  for(const name of ['nexo_neighbors','nexo_trace']){const graph=await client.callTool({name,arguments:{entity:'DATA::SYNTHETIC'}});eq(graph.isError,undefined);eq(graph.structuredContent.root,'DATA::SYNTHETIC');eq(graph.structuredContent.nodes.length,1);eq(graph.structuredContent.edges,[]);eq(graph.structuredContent.semantics,'explicit_source_assertions; not inferred_causality');}
  const empty=await invoke({query:'neverexists'});eq(empty.structuredContent.hits,[]);eq(empty.structuredContent.answer_status,'NO_EVIDENCE_IN_AUTHORIZED_INDEX');
  const beforeBad=sourceReads;
  for(const args of [{query:'hello',role:'ENGINEER'},{query:'hello',source_id:'caller'},{query:'hello',generation:'caller'},{query:'hello',as_of:'2020-01-01'},{query:'hello',filters:{}},{query:'hello',mode:'vector'},{query:'hello',k:51},{query:33},{query:'x'.repeat(8001)}])await expectToolError(args,'');
  eq(sourceReads,beforeBad);
  const unknown=await client.callTool({name:'browse_graph',arguments:{}}).catch(error=>({isError:true,content:[{text:error.message}]}));eq(unknown.isError,true);eq(sourceReads,beforeBad);
  // A changed generation during the source post-check must discard evidence.
  let headCalls=0;afterSource=async()=>{if(++headCalls===2)await db.prepare('DELETE FROM retrieval_heads').run();};
  await expectToolError({query:'hello'},'GENERATION_CHANGED_DURING_QUERY');afterSource=null;
  const missingIndex=await invoke({query:'hello'});
  eq(missingIndex.isError,true);
  eq(missingIndex.structuredContent.error_code,'INDEX_UNAVAILABLE');
  eq(missingIndex.structuredContent.diagnostic,'AUTHORIZED_INDEX_UNAVAILABLE');
  ok(!JSON.stringify(missingIndex).includes('DATA::SYNTHETIC'));
  await publishGeneration(db,{generation:f.generation,manifestHash:f.manifestHash,role:'LEARNER'});
  // Renewing a grant during retrieval changes its private comparison identity.
  let renewalCalls=0;afterSource=async()=>{if(++renewalCalls===2)await db.prepare('UPDATE atlas_mcp_grants SET grant_id=?').bind('synthetic-renewal').run();};
  await denied(403);afterSource=null;await grant();
  sourceFault='changed';await expectToolError({query:'hello'},'IMPORTED_GENERATION_STALE');
  sourceFault='revoked';
  const reauthentication=await invoke({query:'hello'});
  eq(reauthentication.isError,true);
  eq(reauthentication.structuredContent.error_code,'SOURCE_REAUTHENTICATION_REQUIRED');
  eq(reauthentication.structuredContent.diagnostic,'CONNECTOR_LIST_FILE_REVISIONS_FAILED');
  eq(reauthentication.structuredContent.connectorStatus,'reauthentication_required');
  eq(reauthentication.structuredContent.recovery,'REAUTHORIZE_CONNECTOR');
  ok(!JSON.stringify(reauthentication).includes('DATA::SYNTHETIC'));
  sourceFault=null;
  let calls=0;afterSource=async()=>{if(++calls===2)await db.prepare('UPDATE atlas_mcp_grants SET revoked_at=?').bind(Date.now()).run();};
  await denied(403);afterSource=null;const reads=sourceReads;await denied(403);eq(sourceReads,reads);await grant();
  afterHead=async()=>{await db.prepare('UPDATE atlas_mcp_grants SET revoked_at=?').bind(Date.now()).run();};await denied(403);afterHead=null;await grant();
  calls=0;afterSource=async()=>{if(++calls===2)await db.prepare('UPDATE atlas_owner SET pin_hash=? WHERE id=1').bind(pin.replace(/.$/,'f')===pin?pin.replace(/.$/,'e'):pin.replace(/.$/,'f')).run();};await denied(403);afterSource=null;await denied(403);
  await db.prepare('UPDATE atlas_owner SET pin_hash=? WHERE id=1').bind(pin).run();await grant();
  await db.prepare('UPDATE atlas_mcp_grants SET created_at=?,expires_at=?').bind(Date.now()-MAX_GRANT_MS,Date.now()-1).run();await denied(403);await grant();
  eq((await raw('/api/atlas-mcp/grant',{}, {browser:true,method:'DELETE'})).response.status,200);await denied(403);
  eq((await raw('/api/atlas-mcp/grant',{}, {browser:true,method:'GET',override:{origin:null}})).body.active,false);
  await grant();identity={'oai-authenticated-user-id':'synthetic-mcp-owner','oai-authenticated-user-email':'other@example.invalid'};await denied(403);identity=owner;
  identity={cookie};await denied(401);identity=owner;
  for(const method of ['GET','DELETE','PUT'])eq((await raw('/mcp',{}, {method})).response.status,405);
  eq((await raw('/mcp',{}, {raw:'{'})).response.status,400);
  eq((await raw('/mcp',[],{})).response.status,400);
  eq((await raw('/mcp',{}, {raw:'x'.repeat(20001)})).response.status,413);
  eq((await raw('/mcp',{}, {override:{'content-type':'text/plain'}})).response.status,415);
  eq((await raw('/mcp',{}, {override:{origin:'https://foreign.invalid'}})).response.status,403);
  const still=await invoke();eq(still.structuredContent.hits[0].id,'DATA::SYNTHETIC');
  results.push({label,result:'PASS'});
 }finally{if(client)await client.close();await mf.dispose();}
}
eq(outbound,0);
const receipt={suite:'Official SDK initialize/listTools/callTool against stateless workerd and synthetic D1',assertions,requests,sourceReads,results,result:'PASS',real_private_corpus_used:false,external_requests:outbound,production_changed:false,real_grants_created:false,remote_plugin_connected:false};
console.log(JSON.stringify(receipt));if(process.env.MCP_RECEIPT_PATH)writeFileSync(process.env.MCP_RECEIPT_PATH,JSON.stringify(receipt,null,2)+'\n');
