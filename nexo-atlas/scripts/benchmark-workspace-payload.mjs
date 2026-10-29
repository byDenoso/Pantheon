// Local frozen-source comparison; never fetches, authenticates or publishes.
import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {performance} from 'node:perf_hooks';import assert from 'node:assert/strict';import {gzipSync,gunzipSync} from 'node:zlib';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
import {compilePrivateWorkspaceRuntime,privateWorkspaceTest} from '../server/atlas/private-workspace.mjs';
import {buildLab} from '../src/features/lab/model.ts';import {workspaceLab} from '../src/private-workspace/workspace-lab.ts';
import {buildTowerGraph} from '../src/tower-web/model.ts';import {normDomain} from '../src/features/lab/domains.ts';
import {domainSummary,domainOutline,operationRows,testRelations} from '../src/private-workspace/model.ts';import {agentBoard} from '../src/private-workspace/agent-board.ts';
import {validateRuntime} from '../src/private-legacy/runtime.ts';import {encodePrivateStream} from '../server/atlas/json-stream.mjs';
const path=process.argv[2];if(!path)throw new Error('Pass an authorized frozen Tower path outside this checkout. Optional second argument: report path.');
const bytes=await readFile(path),tower=JSON.parse(bytes),digest=createHash('sha256').update(bytes).digest('hex'),sourceBefore=JSON.stringify(tower);
const samples={full:[],workspace:[]};let old,optimized;
for(let i=0;i<5;i++)for(const kind of i%2?['workspace','full']:['full','workspace']){
 global.gc?.();let at=performance.now();const runtime=(kind==='full'?compilePrivateTowerRuntime:compilePrivateWorkspaceRuntime)(tower),compile_ms=performance.now()-at;
 at=performance.now();const encoded=await encodePrivateStream(runtime),encode_ms=performance.now()-at;
 const json=gunzipSync(encoded.bytes).toString('utf8');assert.equal(Buffer.byteLength(json),encoded.jsonBytes);
 at=performance.now();const decoded=JSON.parse(json),parse_ms=performance.now()-at;
 at=performance.now();const lab=kind==='full'?buildLab(decoded.data.system):workspaceLab(decoded.data.system),lab_ms=performance.now()-at;
 at=performance.now();structuredClone(decoded.data);const frame_clone_ms=performance.now()-at;
 samples[kind].push({compile_ms,encode_ms,parse_ms,lab_ms,frame_clone_ms,json_bytes:encoded.jsonBytes,gzip_bytes:encoded.bytes.length});
 if(kind==='full')old={runtime:decoded,lab};else optimized={runtime:decoded,lab};
}
const simple=lab=>JSON.parse(JSON.stringify({...lab,activity:undefined,...Object.fromEntries(['tests','historicalTests','hypotheses','campaigns','roadmaps'].map(key=>[key,[...lab[key]]]))}));
assert.deepEqual(simple(old.lab),simple(optimized.lab));const a=old.runtime.data.system,b=optimized.runtime.data.system,tests=[...old.lab.tests.values()],next=[...optimized.lab.tests.values()];
assert.equal(validateRuntime(optimized.runtime.data).ok,true);assert.deepEqual(b.graph,a.graph);assert.deepEqual(b.domain_catalog,a.domain_catalog);assert.deepEqual(operationRows(b),operationRows(a));assert.deepEqual(agentBoard(b),agentBoard(a));assert.deepEqual(domainSummary(next,b),domainSummary(tests,a));
for(const domain of domainSummary(tests,a).map(row=>row.domain))assert.deepEqual(domainOutline(next,optimized.lab,b,domain),domainOutline(tests,old.lab,a,domain));
for(const [id,test]of old.lab.tests)assert.deepEqual(testRelations(optimized.lab.tests.get(id),optimized.lab,b),testRelations(test,old.lab,a));
assert.deepEqual(buildTowerGraph(next,{normDomain}),buildTowerGraph(tests,{normDomain}));
const first=tests[0]?.id,detail=first?privateWorkspaceTest(tower,{id:first,expected_revision:tower.revision}):null;
if(detail){assert.equal(detail.status,200);assert.deepEqual(JSON.parse(JSON.stringify(detail.body.record)),a.read_model.tests[first]);}
assert.equal(JSON.stringify(tower),sourceBefore);
const median=rows=>Object.fromEntries(Object.keys(rows[0]).map(key=>[key,rows.map(row=>row[key]).sort((a,b)=>a-b)[Math.floor(rows.length/2)]]));
const full=median(samples.full),workspace=median(samples.workspace);
const report={source:{raw_sha256:digest,canonical_revision:tower.revision,snapshot_at:tower.updated_at,source_bytes:bytes.length},scope:'LOCAL_NODE_FROZEN_REPLAY; NO_HOSTED_LOGIN_OR_NETWORK_LATENCY',full,workspace,reduction_percent:Object.fromEntries(Object.keys(full).map(key=>[key,Math.round((1-workspace[key]/full[key])*1000)/10])),proof:{source_unchanged:true,all_current_lab_values_equal:true,all_graph_nodes_edges_equal:true,domain_catalog_equal:true,domain_outlines_equal:true,operations_equal:true,test_relations_equal:true,tower_graph_equal:true,board_posts:agentBoard(b).posts.length,board_equal:true,tests:tests.length,full_record_equal:true},sample_detail:detail?{json_bytes:Buffer.byteLength(JSON.stringify(detail.body)),gzip_bytes:gzipSync(JSON.stringify(detail.body)).length}:null,samples};
if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
