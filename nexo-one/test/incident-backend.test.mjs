import test from 'node:test';
import assert from 'node:assert/strict';
import {researchSnapshotFromPublication} from '../server/adapters/research-snapshot.mjs';
import {buildPagesProjection} from '../scripts/build-pages-system.mjs';
import {buildAtlasResearchView} from '../server/compiler/atlas-research-api.mjs';
import {scienceModelFor} from '../server/compiler/science-read-model-v2.mjs';
import {executeMcpTool} from '../server/mcp/tools.mjs';

const secret='PRIVATE_HANDOFF_SENTINEL';
function publication(){
 const manifest={authority:'TOWER_V06',projection_only:true,writeback:'FORBIDDEN',tower_commit:'a'.repeat(40),event_cursor:'20260929T120000000000Z-test',generated_at:'2026-09-29T12:00:00Z',projection_fingerprint:'sha256:'+'b'.repeat(64)};
 const operational={policy:'INCIDENT_OPERATIONS_V1',state:'OPEN',work_ids:['WORK-1'],items:[{work_id:'WORK-1',test_id:'TEST-1',current_owner:'LEARNER',assigned_to:'EXECUTOR',ownership_state:'ASSIGNED_UNACCEPTED',accepted:false,validation_state:'PENDING',acceptance_source:secret}],suggested_owner:null,reason_code:'READY_INPUTS_NOT_MATERIALIZED',next_action_code:'COMPLETE_RECOVERY',resolution_scope:null,scientific_effect:'NONE',handoff_id:secret,unresolved_refs:[secret]};
 const incident={incident_id:'INC-1',state:'CONFIRMED',next_owner:'LEARNER',learning_state:'CONFIRMED',learning_next_owner:'LEARNER',evidence_count:3,summary_pt:'Entradas ainda não materializadas.',public_ids:{tests:['TEST-1'],hypotheses:[],lessons:[]},operational,raw_cause:secret,evidence_refs:[secret]};
 const projection={contract:'NEXO_PUBLIC_PROJECTION_V1',manifest,event_cursor:manifest.event_cursor,work:[],tests:[],campaigns:[],counts:{active_work:0,tests:0,capabilities:0},capabilities:{},integrity:{checked_at:'2026-09-28T06:00:00Z',findings:[]},evolution:{incidents:[incident,{...incident,incident_id:secret,private:true}]}};
 return {contract:'NEXO_PUBLIC_PROJECTION_PUBLICATION_V1',manifest,projection,build_meta:{projection_fingerprint:manifest.projection_fingerprint}};
}

test('Tower publication -> system UI / research API / MCP preserve one sanitized incident contract',async()=>{
 const source=publication(),snapshot=researchSnapshotFromPublication(source,Date.parse('2026-10-01T12:00:00Z'));
 const system=buildPagesProjection({projection:source.projection}).system;
 const api=buildAtlasResearchView(snapshot,'science-read-model');
 const mcp=await executeMcpTool(snapshot,'get_science_state');
 const operations=await executeMcpTool(snapshot,'get_operations');
 for(const incidents of [system.evolution.incidents,api.data.evolution.incidents,mcp.evolution.incidents,operations.incidents]){
  assert.equal(incidents.length,1);
  assert.deepEqual(incidents,system.evolution.incidents);
  assert.equal(incidents[0].state,'CONFIRMED');assert.equal(incidents[0].operational.state,'OPEN');
  assert.equal(incidents[0].operational.items[0].accepted,false);
  assert.equal(incidents[0].operational.items[0].assigned_to,'EXECUTOR');
  assert.ok(!JSON.stringify(incidents).includes(secret));
 }
 assert.equal(system.guardian.checked_at,'2026-09-28T06:00:00Z');
 assert.equal(api.generatedAt,'2026-09-29T12:00:00Z');assert.equal(api.data.generatedAt,api.generatedAt);
 assert.equal(api.lastReadAt,'2026-10-01T12:00:00.000Z');assert.equal(mcp.lastReadAt,api.lastReadAt);
 assert.equal(mcp.freshness,'SNAPSHOT');assert.equal(operations.freshness,'SNAPSHOT');
 assert.equal(source.projection.evolution.incidents[0].operational.handoff_id,secret,'compiler must not mutate canonical input');
});

test('cached model refreshes transport read time without changing source, audit or fingerprint',()=>{
 const source=publication();const first=scienceModelFor(researchSnapshotFromPublication(source,Date.parse('2026-10-01T12:00:00Z')));
 const second=scienceModelFor(researchSnapshotFromPublication(source,Date.parse('2026-10-01T13:00:00Z')));
 assert.notEqual(first.lastReadAt,second.lastReadAt);assert.equal(first.generatedAt,second.generatedAt);assert.equal(first.fingerprint,second.fingerprint);assert.equal(second.freshness,'SNAPSHOT');
});

test('legacy absence stays unknown and never acquires synthetic recovery or learning state',async()=>{
 const source=publication();delete source.projection.evolution.incidents[0].operational;delete source.projection.evolution.incidents[0].learning_state;delete source.projection.evolution.incidents[0].learning_next_owner;
 const snapshot=researchSnapshotFromPublication(source);snapshot.fingerprint='legacy-no-cache';
 const item=(await executeMcpTool(snapshot,'get_operations')).incidents[0];
 assert.equal(item.operational,undefined);assert.equal(item.learning_state,undefined);assert.equal(item.state,'CONFIRMED');
 delete source.projection.evolution;
 const legacy=researchSnapshotFromPublication(source);legacy.fingerprint='absent-no-cache';
 assert.equal(scienceModelFor(legacy).evolution,undefined);
});

test('unknown private codes and roles are not serialized or treated as acceptance',()=>{
 const source=publication();const op=source.projection.evolution.incidents[0].operational;
 op.reason_code=secret;op.items[0].current_owner=secret;op.items[0].assigned_to=secret;op.items[0].accepted=true;
 const out=buildPagesProjection({projection:source.projection}).system.evolution.incidents[0];
 assert.equal(out.operational.reason_code,'OTHER');assert.equal(out.operational.items[0].current_owner,null);assert.equal(out.operational.items[0].accepted,false);assert.ok(!JSON.stringify(out).includes(secret));
});

test('HTTP research handler and official MCP transport carry the same incident projection',async t=>{
 const {default:handler}=await import('../server/handler.mjs');
 const {createNexoMcpWebHandler}=await import('../server/mcp/server.mjs');
 const {Client,StreamableHTTPClientTransport}=await import('@modelcontextprotocol/client');
 const source=publication();
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(source),{status:200,headers:{'Content-Type':'application/json'}}));
 let api;const res={setHeader(){},end(body){api=JSON.parse(body);}};
 await handler({url:'/api/index?route=science-read-model',method:'GET',headers:{}},res);
 assert.equal(res.statusCode,200);assert.equal(api.data.evolution.incidents.length,1);
 const web=createNexoMcpWebHandler({readSnapshot:async()=>researchSnapshotFromPublication(source)});
 const client=new Client({name:'incident-contract-test',version:'1.0.0'},{versionNegotiation:{mode:'auto'}});
 try{
  await client.connect(new StreamableHTTPClientTransport(new URL('http://test.local/mcp'),{fetch:(url,init)=>web.fetch(new Request(url,init))}));
  const reply=await client.callTool({name:'get_operations',arguments:{}});
  assert.equal(reply.isError,undefined);const payload=JSON.parse(reply.content[0].text);
  assert.deepEqual(payload.incidents,api.data.evolution.incidents);assert.ok(!JSON.stringify(payload).includes(secret));
 }finally{await client.close().catch(()=>{});await web.close();}
});

test('semantic private incidents and recovery containers cannot cross the public boundary',()=>{
 for(const marker of [{domain:'OLYMPUS'},{thread_id:'THR::PRIVATE::ROOT'},{semantic:{domain_id:'OLYMPUS'}}]){
  const source=publication();Object.assign(source.projection.evolution.incidents[0],marker);
  assert.deepEqual(buildPagesProjection({projection:source.projection}).system.evolution.incidents,[]);
 }
 for(const mutate of [op=>op.private=true,op=>op.items[0].private=true,op=>op.items[0].semantic={domain_id:'OLYMPUS'},op=>{op.state='RESOLVED';op.items=[];},op=>{op.state='RESOLVED';op.resolution_scope=null;},op=>op.items[0].validation_state=secret,op=>op.next_action_code='RESOLVED',op=>op.work_ids=[]]){
  const source=publication();mutate(source.projection.evolution.incidents[0].operational);
  assert.equal(buildPagesProjection({projection:source.projection}).system.evolution.incidents[0].operational,undefined);
 }
});

test('valid bounded resolution and unlinked suggestions survive without changing learning',()=>{
 const source=publication();const op=source.projection.evolution.incidents[0].operational;
 Object.assign(op,{state:'RESOLVED',reason_code:'RECIPE_BINDING_MISSING',next_action_code:'RESOLVED',resolution_scope:'EXECUTION_PREREQUISITES'});
 op.items[0].validation_state='PREREQUISITES_VALIDATED';
 let out=buildPagesProjection({projection:source.projection}).system.evolution.incidents[0];
 assert.equal(out.operational.state,'RESOLVED');assert.equal(out.operational.scientific_effect,'NONE');assert.equal(out.learning_state,'CONFIRMED');
 Object.assign(op,{state:'UNLINKED',work_ids:[],items:[],next_action_code:'LINK_EXISTING_WORK',suggested_owner:'ADVISOR',resolution_scope:null});
 out=buildPagesProjection({projection:source.projection}).system.evolution.incidents[0];
 assert.equal(out.operational.state,'UNLINKED');assert.equal(out.operational.suggested_owner,'ADVISOR');assert.deepEqual(out.operational.items,[]);
});
