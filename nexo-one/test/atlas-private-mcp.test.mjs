import test from 'node:test';
import assert from 'node:assert/strict';
import {readMcpStatus, callReadOnlyTool, describeTools, statusFor, MCP_ENDPOINT} from '../src/private-legacy/mcpClient.ts';
import {runtimeHolder} from '../src/private-legacy/state.ts';
import {compilePrivateTowerSystem} from '../server/atlas/private-tower-system.mjs';
import {privateTowerSystemFixture} from './helpers/private-tower-system.fixture.mjs';
import {makeRuntime, FP} from './helpers/synthetic-runtime.mjs';

const withRt = (mut) => { const r = makeRuntime(); if (mut) mut(r.system); runtimeHolder.set(r); return r; };
const tool = async name => (await readMcpStatus()).tools.find(t => t.name === name);

test('status is PRIVATE, local snapshot, read-only; no authority/server health/telemetry is claimed', async () => {
  withRt();
  const s = await readMcpStatus();
  assert.equal(s.contract, 'NEXO_MCP_STATUS_V1');
  assert.equal(s.server.access, 'PRIVATE'); assert.equal(s.server.transport, 'in-memory'); assert.equal(s.server.endpoint, MCP_ENDPOINT);
  assert.equal(s.status, 'LOCAL_SNAPSHOT'); assert.equal(s.freshness, 'SNAPSHOT');
  assert.equal(s.authority, null); assert.equal(s.telemetry, null); assert.equal(s.last_read_at, null); assert.equal(s.provenance, null);
  assert.equal(s.projectionFingerprint, FP);
  assert.ok(s.tools.every(t => t.access === 'PRIVATE' && t.annotations.readOnlyHint === true && t.annotations.destructiveHint === false && t.annotations.openWorldHint === false));
  assert.equal(s.tool_count, s.tools.length);
  runtimeHolder.clear();
});

test('capabilities without data are UNAVAILABLE with the exact reason and cannot be run', async () => {
  withRt(sys => { delete sys.projected_work; delete sys.science_projection_v1; });
  const by = Object.fromEntries((await readMcpStatus()).tools.map(t => [t.name, t]));
  assert.equal(by.search_atlas.availability, 'AVAILABLE'); assert.equal(by.get_provenance.availability, 'AVAILABLE');
  for (const n of ['get_operations', 'get_science_state', 'get_campaign', 'get_program', 'get_observations', 'get_h0_stacks', 'get_evidence_chain', 'get_changes', 'get_activity']) {
    assert.equal(by[n].availability, 'UNAVAILABLE', n);
    await assert.rejects(callReadOnlyTool(by[n], {}), /Indisponível/, n);
  }
  assert.match(by.get_operations.description, /projected_work ausente/);
  assert.match(by.get_program.description, /registro de programa nem vínculos program_id/);
  runtimeHolder.clear();
});

test('search_atlas / get_provenance answer from the authenticated generation; absent values are null, never zero', async () => {
  const rt = withRt();
  const sys = rt.system;
  const first = sys.graph.nodes[0];
  const r = await callReadOnlyTool(await tool('search_atlas'), {query: first.label.slice(0, 4), limit: 5});
  assert.equal(r.access, 'PRIVATE'); assert.equal(r.scope, 'LOCAL_SNAPSHOT'); assert.equal(r.authority, null); assert.equal(r.sourceVersion, rt.source_revision);
  assert.ok(r.items.length >= 1 && r.items.length <= 5); assert.ok(r.total >= r.items.length);
  for (const it of r.items) for (const k of ['summary', 'operational_status', 'source_revision']) assert.ok(it[k] === null || typeof it[k] === 'string', `${k} is null or string`);
  const none = await callReadOnlyTool(await tool('search_atlas'), {query: 'zzz-inexistente'});
  assert.deepEqual([none.items.length, none.total], [0, 0]);
  const p = await callReadOnlyTool(await tool('get_provenance'), {id: first.id});
  assert.equal(p.entity.id, first.id); assert.equal(p.provenance.length, 1);
  const miss = await callReadOnlyTool(await tool('get_provenance'), {id: 'nao-existe'});
  assert.equal(miss.entity, null); assert.deepEqual(miss.provenance, []);
  const gen = await callReadOnlyTool(await tool('get_provenance'), {});
  assert.equal(gen.provenance[0].fingerprint, rt.fingerprint);
  runtimeHolder.clear();
});

test('get_operations and science tools use only present fields', async () => {
  const rt = withRt(sys => {
    sys.projected_work = [{...sys.graph.nodes[0], id: 'w1', label: 'Trabalho sintético', operational_status: undefined, priority: undefined}];
    sys.science_projection_v1 = {contract: 'NEXO_SCIENCE_PROJECTION_V1', version: 1, source: {authority: 'TOWER_V06'}, fingerprint: 'sp', campaigns: [{id: 'C1', source_ref: 's', fingerprint: 'f'}], hypotheses: [], tests: [{id: 'T1', campaign_id: 'C1', source_ref: 's', fingerprint: 'f'}, {id: 'T2', campaign_id: 'C2', source_ref: 's', fingerprint: 'f'}]};
  });
  const ops = await callReadOnlyTool(await tool('get_operations'), {});
  assert.equal(ops.items.length, 1); assert.equal(ops.items[0].status, null); assert.equal(ops.items[0].priority, null);
  const sc = await callReadOnlyTool(await tool('get_science_state'), {});
  assert.equal(sc.campaigns.length, 1); assert.equal(sc.tests.length, 2);
  const c = await callReadOnlyTool(await tool('get_campaign'), {id: 'C1'});
  assert.equal(c.campaign.id, 'C1'); assert.deepEqual(c.tests.map(t => t.id), ['T1']);
  assert.equal((await callReadOnlyTool(await tool('get_campaign'), {id: 'nope'})).campaign, null);
  void rt; runtimeHolder.clear();
});

test('access, argument and lifecycle guards', async () => {
  withRt();
  const t = await tool('search_atlas');
  await assert.rejects(callReadOnlyTool({...t, access: 'PUBLIC'}, {}), /outro nível de acesso/);
  await assert.rejects(callReadOnlyTool({...t, annotations: {...t.annotations, readOnlyHint: false}}, {}), /outro nível de acesso/);
  await assert.rejects(callReadOnlyTool(t, {evil: 'x'}), /não suportado/);
  await assert.rejects(callReadOnlyTool(t, {limit: 9999}), /inválido/);
  await assert.rejects(callReadOnlyTool(t, {query: 'x'.repeat(600)}), /inválido/);
  await assert.rejects(callReadOnlyTool({...t, name: 'delete_everything'}, {}), /desconhecida/);
  const ac = new AbortController(); ac.abort();
  await assert.rejects(callReadOnlyTool(t, {}, ac.signal));
  runtimeHolder.clear();
  await assert.rejects(readMcpStatus(), /não carregado/);
  await assert.rejects(callReadOnlyTool(t, {}), /não carregado/);
});

test('never touches the network or storage', async () => {
  withRt();
  const f = globalThis.fetch; let n = 0; globalThis.fetch = () => { n += 1; throw new Error('forbidden'); };
  try { await readMcpStatus(); await callReadOnlyTool(await tool('search_atlas'), {query: 'a'}); assert.equal(n, 0); } finally { globalThis.fetch = f; runtimeHolder.clear(); }
});

function compiledRuntime(change) {
  const context=privateTowerSystemFixture();change?.(context.records);
  const rt=makeRuntime({system:compilePrivateTowerSystem(context),generated_at:context.generatedAt,source_revision:context.revision},context.revision);
  runtimeHolder.set(rt);return rt;
}

test('compiled private evidence envelopes drive campaign and evidence-chain queries', async()=>{
  const rt=compiledRuntime();
  const campaign=await callReadOnlyTool(await tool('get_campaign'),{id:'CAMPAIGN-PRIVATE'});
  assert.deepEqual(campaign.tests.map(row=>row.id),['TEST-PRIVATE']);
  const chain=await callReadOnlyTool(await tool('get_evidence_chain'),{campaign_id:'CAMPAIGN-PRIVATE',test_id:'TEST-PRIVATE'});
  assert.equal(chain.tests[0].id,'TEST-PRIVATE');assert.equal(chain.hypotheses[0].id,'HYP-PRIVATE');
  assert.equal(chain.results[0].result.value.value,3);assert.equal(chain.evidence[0].sourceRef,'private://synthetic-artifact');
  assert.equal(chain.observations,null);assert.match(chain.unavailable.observations,/tipadas/);
  assert.equal(chain.provenance[0].sourceVersion,rt.source_revision);
  assert.match(chain.provenance[0].sourceRef,/#entities\/test\/TEST-PRIVATE\.json$/);
  const miss=await callReadOnlyTool(await tool('get_evidence_chain'),{campaign_id:'CAMPAIGN-PRIVATE',test_id:'TEST-ENGINEERING'});
  assert.deepEqual(miss.tests,[]);assert.deepEqual(miss.results,[]);
  const source=await callReadOnlyTool(await tool('get_evidence_chain'),{source_ref:'private://synthetic-artifact'});
  assert.deepEqual(source.tests.map(row=>row.id),['TEST-PRIVATE']);assert.equal(source.evidence.length,1);
  runtimeHolder.clear();
});

test('program membership is available without inventing a missing program record',async()=>{
  compiledRuntime(records=>{records.campaigns[0].program_id='PROGRAM-PRIVATE';});
  const descriptor=await tool('get_program');assert.equal(descriptor.availability,'AVAILABLE');
  const result=await callReadOnlyTool(descriptor,{program_id:'PROGRAM-PRIVATE'});
  assert.equal(result.program,null);assert.equal(result.program_record_status,'REFERENCE_ONLY');assert.equal(result.campaigns[0].id,'CAMPAIGN-PRIVATE');
  assert.match(result.unavailable.program,/não foi fornecido/);
  compiledRuntime(records=>{
    records.campaigns[0].program_id='PROGRAM-PRIVATE';
    records.artifacts.push({id:'PROGRAM-PRIVATE',kind:'PROGRAM',domain:'OLYMPUS',title:'Synthetic private program',private:true,_source_path:'entities/artifact/PROGRAM-PRIVATE.json'});
  });
  const present=await callReadOnlyTool(descriptor,{id:'PROGRAM-PRIVATE'});assert.equal(present.program.private,true);assert.equal(present.program_record_status,'PRESENT');
  assert.match(present.program.sourceRef,/#entities\/artifact\/PROGRAM-PRIVATE\.json$/);
  const absent=await callReadOnlyTool(descriptor,{id:'OTHER'});assert.equal(absent.program,null);assert.equal(absent.campaigns.length,0);
  runtimeHolder.clear();
});

test('explicit observations and exact H0 metrics retain source values, missing uncertainties and private domains',async()=>{
  compiledRuntime(records=>{
    records.tests[0].observations=[
      {observation_id:'OBS-H0',metric_id:'cosmology.H0',observation_kind:'scalar',value:71,unit:'synthetic units',stack_id:'STACK-PRIVATE',private:true},
      {observation_id:'OBS-OTHER',metric_id:'private.metric',observation_kind:'scalar',value:0,title:'H0-looking title'},
      {observation_id:'OBS-MISSING',metric_id:'private.missing',observation_kind:'scalar',value:null},
    ];
  });
  const result=await callReadOnlyTool(await tool('get_observations'),{domain:'OLYMPUS',campaign_id:'CAMPAIGN-PRIVATE',kind:'scalar'});
  assert.equal(result.total,3);assert.equal(result.items[0].private,true);assert.equal(result.items[0].testId,'TEST-PRIVATE');
  assert.deepEqual(result.items[0].uncertainty,{low:null,high:null,sigma:null,confidenceLevel:null});assert.match(result.items[0].sourceRef,/#entities\/test\/TEST-PRIVATE\.json$/);
  assert.equal(result.items.find(row=>row.id==='OBS-OTHER').value,0);assert.equal(result.items.find(row=>row.id==='OBS-MISSING').value,null);
  const h0=await callReadOnlyTool(await tool('get_h0_stacks'),{});
  assert.deepEqual(h0.items.map(row=>row.id),['OBS-H0']);assert.equal(h0.items[0].stackId,'STACK-PRIVATE');
  const chain=await callReadOnlyTool(await tool('get_evidence_chain'),{test_id:'TEST-PRIVATE'});assert.equal(chain.observations.length,3);
  runtimeHolder.clear();
});

test('numeric test results and H0 labels do not manufacture observation availability',async()=>{
  compiledRuntime(records=>{records.tests[0].result={parameter:'cosmology.H0',value:71};records.tests[0].title='H0 stack';});
  for (const name of ['get_observations','get_h0_stacks']) {
    const descriptor=await tool(name);assert.equal(descriptor.availability,'UNAVAILABLE');await assert.rejects(callReadOnlyTool(descriptor,{}),/não são convertidos/);
  }
  runtimeHolder.clear();
});

test('conflicting observation identities fail closed rather than silently selecting a record',async()=>{
  compiledRuntime(records=>{records.tests[0].observations=[{id:'OBS',metricId:'private.metric',kind:'scalar',value:1},{id:'OBS',metricId:'private.metric',kind:'scalar',value:2}];});
  const descriptor=await tool('get_observations');assert.equal(descriptor.availability,'UNAVAILABLE');await assert.rejects(callReadOnlyTool(descriptor,{}),/ambíguas/);
  runtimeHolder.clear();
});

test('activity uses original events and timestamps and distinguishes missing from authoritative empty',async()=>{
  const rt=compiledRuntime(records=>{records.events=[
    {id:'UNDATED',event_type:'SYNTHETIC',entity_id:'TEST-PRIVATE',private_detail:'Synthetic unfiltered event'},
    {event_id:'OLDER',event_type:'SYNTHETIC',at:'2026-10-01T08:00:00Z',entity_name:'TEST-PRIVATE'},
    {event_id:'NEWER',event_type:'SYNTHETIC',at:'2026-10-01T09:00:00Z',entity_id:'TEST-PRIVATE'},
  ];});
  const descriptor=await tool('get_activity'),result=await callReadOnlyTool(descriptor,{limit:2});
  assert.deepEqual(result.items.map(row=>row.id),['NEWER','OLDER']);assert.equal(result.total,3);assert.equal(result.truncated,true);
  const all=await callReadOnlyTool(descriptor,{});assert.equal(all.items[2].at,null);assert.equal(all.items[2].private_detail,'Synthetic unfiltered event');
  assert.notEqual(all.items[2].at,rt.generated_at);
  compiledRuntime(records=>{records.events=[];records.coverage.events={status:'NOT_PRESENT',count:0};});
  await assert.rejects(callReadOnlyTool(descriptor,{}),/não confirma/);
  compiledRuntime(records=>{records.events=[];records.coverage.events={state:'EMPTY',complete:true,count:0};});
  assert.deepEqual((await callReadOnlyTool(descriptor,{})).items,[]);
  runtimeHolder.clear();
});

test('changes require a real prior comparison bound to the world fingerprint, never the runtime fingerprint',async()=>{
  const rt=compiledRuntime(),descriptor=await tool('get_changes');
  assert.equal(descriptor.availability,'UNAVAILABLE');await assert.rejects(callReadOnlyTool(descriptor,{}),/fingerprint anterior/);
  rt.world.fingerprint='synthetic-world-content';
  rt.world.diff={previous:'synthetic-prior-world',current:'synthetic-world-content',added:['syn-item-1'],updated:[],removed:['synthetic-removed'],providerChanges:[]};
  const result=await callReadOnlyTool(descriptor,{});assert.equal(result.comparison_scope,'WORLD_ITEMS_ONLY');assert.equal(result.current,'synthetic-world-content');
  assert.equal(result.added[0].id,'syn-item-1');assert.equal(result.removed[0].sourceRef,null);
  rt.world.diff.current=rt.fingerprint;
  await assert.rejects(callReadOnlyTool(descriptor,{}),/não está vinculada/);
  runtimeHolder.clear();
});

test('new query results are detached snapshots and cannot survive holder clearing',async()=>{
  const rt=compiledRuntime(),descriptor=await tool('get_evidence_chain');
  const fetch=globalThis.fetch;let network=0;globalThis.fetch=()=>{network++;throw new Error('forbidden');};
  try {
    const result=await callReadOnlyTool(descriptor,{test_id:'TEST-PRIVATE'});result.tests[0].id='MUTATED';
    assert.equal(rt.system.science_projection_v1.tests.some(row=>row.id==='MUTATED'),false);assert.equal(network,0);
    runtimeHolder.clear();await assert.rejects(callReadOnlyTool(descriptor,{}),/não carregado/);
  } finally {globalThis.fetch=fetch;runtimeHolder.clear();}
});

test('evidence filters intersect all requested identities and preserve secondary reference fields',async()=>{
  compiledRuntime(records=>{records.tests[0].evidence_refs=['private://secondary-evidence'];});
  const descriptor=await tool('get_evidence_chain');
  const mismatch=await callReadOnlyTool(descriptor,{campaign_id:'CAMPAIGN-PRIVATE',test_id:'TEST-ENGINEERING'});
  assert.deepEqual(mismatch.tests,[]);assert.deepEqual(mismatch.campaigns,[]);assert.deepEqual(mismatch.evidence,[]);
  const result=await callReadOnlyTool(descriptor,{source_ref:'private://secondary-evidence',test_id:'TEST-PRIVATE'});
  assert.equal(result.tests.length,1);assert.deepEqual(result.evidence.map(row=>row.sourceRef),['private://secondary-evidence']);
  assert.equal(result.evidence[0].reference_field,'evidence_refs');
  runtimeHolder.clear();
});

test('empty program identifiers cannot invent membership for unassigned campaigns',async()=>{
  compiledRuntime(records=>{
    records.campaigns.push({id:'CAMPAIGN-LINKED',domain:'OLYMPUS',program_id:'PROGRAM-PRIVATE'});
  });
  const descriptor=await tool('get_program');assert.equal(descriptor.availability,'AVAILABLE');
  await assert.rejects(callReadOnlyTool(descriptor,{}),/identificador do programa/);
  await assert.rejects(callReadOnlyTool(descriptor,{program_id:' '}),/identificador do programa/);
  runtimeHolder.clear();
});

test('missing scientific envelopes never become recorded results while genuine zero survives',async()=>{
  compiledRuntime(records=>{delete records.tests[1].scientific_result;});
  const descriptor=await tool('get_evidence_chain');
  const absent=await callReadOnlyTool(descriptor,{test_id:'TEST-ENGINEERING'});
  assert.equal(absent.tests.length,1);assert.deepEqual(absent.results,[]);
  compiledRuntime(records=>{records.tests[1].scientific_result={parameter:'synthetic',value:0};});
  const zero=await callReadOnlyTool(descriptor,{test_id:'TEST-ENGINEERING'});
  assert.equal(zero.results[0].result.value.value,0);
  runtimeHolder.clear();
});

test('preregistration does not turn a campaign observation into a test observation',async()=>{
  compiledRuntime(records=>{records.campaigns[0].prereg={};records.campaigns[0].observations=[{id:'CAMPAIGN-OBS',metricId:'private.metric',kind:'scalar',value:2}];});
  const result=await callReadOnlyTool(await tool('get_observations'),{});
  assert.equal(result.items[0].testId,null);assert.equal(result.items[0].campaignId,'CAMPAIGN-PRIVATE');
  runtimeHolder.clear();
});
