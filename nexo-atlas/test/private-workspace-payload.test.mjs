import test from 'node:test';import assert from 'node:assert/strict';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
import {compilePrivateWorkspaceRuntime,privateWorkspaceTest} from '../server/atlas/private-workspace.mjs';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';
import {validateRuntime,createRuntimeHolder} from '../src/private-legacy/runtime.ts';
import {workspaceLab,WORKSPACE_CONTRACT} from '../src/private-workspace/workspace-lab.ts';
import {buildLab} from '../src/features/lab/model.ts';
import {buildTowerGraph} from '../src/tower-web/model.ts';
import {normDomain} from '../src/features/lab/domains.ts';
import {domainSummary,domainOutline,operationRows,testRelations} from '../src/private-workspace/model.ts';
import {agentBoard} from '../src/private-workspace/agent-board.ts';
import {createTestRecordReader} from '../src/private-workspace/test-records.ts';
const fixture=()=>{const t=makePrivateTowerFixture();t.files['evolution/board.json']={encoding:'json',value:{posts:[{id:'POST',from:'ENGINEER',to:'EXECUTOR',at:t.updated_at,text:'Private exact text',refs:['TEST-01']}]}};t.file_count++;return t;};
const pair=()=>{const tower=fixture();return {tower,full:compilePrivateTowerRuntime(tower).data,workspace:compilePrivateWorkspaceRuntime(tower).data};};
const meaningfulLab=lab=>({...lab,activity:[]});
test('workspace preserves every current Lab value, graph, domain, operation, mural and test relationship',()=>{
 const {tower,full,workspace}=pair(),before=JSON.stringify(tower),a=buildLab(full.system),b=workspaceLab(workspace.system);
 assert.equal(workspace.contract,WORKSPACE_CONTRACT);assert.equal(validateRuntime(workspace).ok,true);assert.deepEqual(meaningfulLab(b),meaningfulLab(a));
 assert.deepEqual(workspace.system.graph,full.system.graph);assert.deepEqual(workspace.system.domain_catalog,full.system.domain_catalog);assert.deepEqual(operationRows(workspace.system),operationRows(full.system));assert.deepEqual(agentBoard(workspace.system),agentBoard(full.system));
 assert.deepEqual(domainSummary([...b.tests.values()],workspace.system),domainSummary([...a.tests.values()],full.system));
 for(const domain of domainSummary([...a.tests.values()],full.system).map(row=>row.domain))assert.deepEqual(domainOutline([...b.tests.values()],b,workspace.system,domain),domainOutline([...a.tests.values()],a,full.system,domain));
 for(const [id,t] of a.tests)assert.deepEqual(testRelations(b.tests.get(id),b,workspace.system),testRelations(t,a,full.system));
 assert.deepEqual(buildTowerGraph([...b.tests.values()],{normDomain}),buildTowerGraph([...a.tests.values()],{normDomain}));
 assert.equal(workspace.world,null);assert.equal(workspace.topology,null);assert.equal(workspace.galaxy,null);assert.equal(workspace.system.science_projection_v1,undefined);assert.equal(workspace.system.read_model.tests,undefined);assert.equal(workspace.system.read_model.activity,undefined);assert.equal(JSON.stringify(tower),before);
});
test('workspace runtime rejects revision mismatch, duplicate Lab IDs and incomplete Lab wire shape',()=>{
 for(const edit of [x=>x.source_revision='different',x=>x.system.workspace_lab.source_revision='other',x=>x.system.workspace_lab.tests.push(x.system.workspace_lab.tests[0]),x=>delete x.system.workspace_lab.hypotheses,x=>x.world={}]){
  const {workspace}=pair();edit(workspace);assert.equal(validateRuntime(workspace).ok,false);
 }
});
test('on-demand canonical record is exact and refuses changed generation, missing IDs and malformed input',()=>{
 const {tower,full}=pair(),request={id:'TEST-01',expected_revision:tower.revision};const result=privateWorkspaceTest(tower,request);
 assert.equal(result.status,200);assert.deepEqual(result.body.record,full.system.read_model.tests['TEST-01']);assert.equal(result.body.source_revision,full.source_revision);
 assert.equal(privateWorkspaceTest(tower,{...request,expected_revision:'sha256:'+'f'.repeat(64)}).status,409);assert.equal(privateWorkspaceTest(tower,{...request,id:'MISSING'}).status,404);assert.equal(privateWorkspaceTest(tower,{id:'TEST-01'}).status,400);
});
const response=body=>Response.json(body);
test('test cache is frame-local, generation-bound, bounded, and cleared on logout, refresh and identity replacement',async()=>{
 const {tower,workspace}=pair(),holder=createRuntimeHolder();holder.set(validateRuntime(workspace).runtime);let calls=0;
 const fetcher=async(url,init)=>{calls++;assert.equal(url,'/api/atlas-private/test');assert.equal(init.cache,'no-store');assert.equal(init.credentials,'same-origin');assert.equal(init.redirect,'error');return response(privateWorkspaceTest(tower,JSON.parse(init.body)).body);};
 const reader=createTestRecordReader(fetcher,holder,()=>{});await reader.read('TEST-01');await reader.read('TEST-01');assert.equal(calls,1);
 holder.set(validateRuntime(workspace).runtime);await reader.read('TEST-01');assert.equal(calls,2);
 holder.clear();await assert.rejects(()=>reader.read('TEST-01'),/AUTH_REQUIRED/);holder.set(validateRuntime(workspace).runtime);await reader.read('TEST-01');assert.equal(calls,3);
 const second=createTestRecordReader(fetcher,holder,()=>{});await second.read('TEST-01');assert.equal(calls,4);
});
test('pending detail results cannot survive refresh/logout even when a transport ignores abort',async()=>{
 for(const change of [holder=>holder.clear(),(holder,workspace)=>holder.set(validateRuntime(workspace).runtime)]){
  const {tower,workspace}=pair(),holder=createRuntimeHolder();holder.set(validateRuntime(workspace).runtime);let resolve;
  const reader=createTestRecordReader(()=>new Promise(r=>{resolve=r;}),holder,()=>{}),pending=reader.read('TEST-01');change(holder,workspace);
  resolve(response(privateWorkspaceTest(tower,{id:'TEST-01',expected_revision:tower.revision}).body));await assert.rejects(pending,/abort|changed/i);
 }
});
test('unauthorized detail clears prior cache, triggers teardown, and stale/error responses never populate cache',async()=>{
 const {tower,workspace}=pair(),holder=createRuntimeHolder();holder.set(validateRuntime(workspace).runtime);let calls=0,unauthorized=0,bad=false;
 const reader=createTestRecordReader(async()=>{calls++;return bad?Response.json({error:'AUTH_REQUIRED'},{status:401}):response(privateWorkspaceTest(tower,{id:'TEST-01',expected_revision:tower.revision}).body);},holder,()=>{unauthorized++;});
 await reader.read('TEST-01');bad=true;await assert.rejects(()=>reader.read('OTHER'),/AUTH_REQUIRED/);assert.equal(unauthorized,1);bad=false;await reader.read('TEST-01');assert.equal(calls,3);
});


test('detail cache retains at most eight complete records and rejects responses for another source or ID',async()=>{
 const {workspace}=pair(),holder=createRuntimeHolder();holder.set(validateRuntime(workspace).runtime);let calls=0,wrong=false;
 const reader=createTestRecordReader(async(_url,init)=>{calls++;const {id,expected_revision}=JSON.parse(init.body);return Response.json({contract:'ATLAS_PRIVATE_TEST_V1',access:'PRIVATE',id,source_revision:wrong?'different':expected_revision,record:{id}});},holder,()=>{});
 for(let i=0;i<9;i++)await reader.read(`T-${i}`);await reader.read('T-0');assert.equal(calls,10);
 wrong=true;await assert.rejects(()=>reader.read('BAD'),/PRIVATE_TEST_RESPONSE_INVALID/);wrong=false;await reader.read('BAD');assert.equal(calls,12);
});

test('historical records stay separate from current/archived records and are not exposed by the current-test detail route',()=>{
 const tower=fixture();
 for(const [id,extra]of [['HISTORICAL',{historical:true,status:'ARCHIVED'}],['CURRENT-ARCHIVED',{status:'ARCHIVED'}]])tower.files[`entities/test/${id}.json`]={encoding:'json',value:{id,kind:'TEST',domain:'SCIENCE',question:id,...extra}};
 tower.file_count=Object.keys(tower.files).length;
 const full=compilePrivateTowerRuntime(tower).data,workspace=compilePrivateWorkspaceRuntime(tower).data,a=buildLab(full.system),b=workspaceLab(workspace.system);
 assert.equal(a.tests.has('HISTORICAL'),false);assert.equal(b.tests.has('HISTORICAL'),false);assert.equal(a.historicalTests.has('HISTORICAL'),true);assert.deepEqual(b.historicalTests,a.historicalTests);
 assert.equal(b.tests.has('CURRENT-ARCHIVED'),true);assert.deepEqual(b.tests.get('CURRENT-ARCHIVED'),a.tests.get('CURRENT-ARCHIVED'));
 assert.equal(privateWorkspaceTest(tower,{id:'HISTORICAL',expected_revision:tower.revision}).status,404);
 assert.equal(privateWorkspaceTest(tower,{id:'CURRENT-ARCHIVED',expected_revision:tower.revision}).status,200);
});
