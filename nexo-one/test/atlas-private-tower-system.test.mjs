import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compilePrivateTowerSystem} from '../server/atlas/private-tower-system.mjs';
import {privateTowerSystemFixture} from './helpers/private-tower-system.fixture.mjs';
import {assertSystemState} from '../src/data/adapters/source.ts';
import {buildLab} from '../src/features/lab/model.ts';
import {buildAtlasMetroModel} from '../src/atlas3d/atlasAdapter.ts';
import {globalSummary,humanActions,resolvableActions} from '../src/viewmodels/system.ts';

const compile = () => compilePrivateTowerSystem(privateTowerSystemFixture());

test('pure private compiler preserves canonical generation, original details and all private entity kinds',()=>{
  const input = privateTowerSystemFixture(),before = structuredClone(input);
  const state = compilePrivateTowerSystem(input);
  assert.deepEqual(input,before);
  assert.deepEqual(state,compilePrivateTowerSystem(input));
  assert.equal(assertSystemState(state),state);
  assert.equal(state.access,'PRIVATE');assert.equal(state.generated_at,input.generatedAt);assert.equal(state.bus.fingerprint,input.revision);
  assert.equal(state.read_model.work['WORK-HUMAN'].private_detail,'Keep this private detail');
  assert.equal(state.read_model.tests['TEST-PRIVATE'].private,true);
  assert.equal(state.read_model.lessons['LESSON-PRIVATE'].heuristic,'Synthetic private procedure');
  assert.equal(state.read_model.activity[0].private_detail,'Synthetic private event');
  for (const id of ['work:WORK-HUMAN','test:TEST-PRIVATE','hypothesis:HYP-PRIVATE','campaign:CAMPAIGN-PRIVATE','roadmap:ROADMAP-PRIVATE','lesson:LESSON-PRIVATE','interdomain:LINK-PRIVATE','capability:CAP-PRIVATE']) assert.ok(state.graph.nodes.some(row => row.id === id),id);
  for (const row of state.graph.nodes) {assert.equal(row.source_revision,input.revision);assert.ok(row.source_ref.startsWith(input.sourceRef));}
  assert.equal(state.envelopes[0].authoritative,false);
  assert.equal(state.science_projection_v1.source.tower_commit,null);
  assert.equal(state.science_projection_v1.source.tower_revision,input.revision);
  assert.equal(state.science_projection_v1.tests[0].method.source_ref,`${input.sourceRef}#entities/test/TEST-ENGINEERING.json`);
});

test('existing lab consumes private evidence, preregistration, reviews and roadmap links without a public projection',()=>{
  const state = compile(),lab = buildLab(state),row = lab.tests.get('TEST-PRIVATE');
  assert.equal(row.domain,'OLYMPUS');assert.equal(row.name,'Synthetic private test');assert.equal(row.method,'Synthetic private method');
  assert.equal(row.question,'Synthetic plain question?');assert.equal(row.review,'PENDING_REVIEW');assert.equal(row.verdict,'REVIEW');
  assert.equal(row.prereg.metric,'Synthetic metric');assert.deepEqual(row.prereg.success,['Synthetic success']);assert.equal(row.prereg.null_model,'Synthetic null');
  assert.equal(row.claimBoundary,'Synthetic bounded claim');assert.equal(row.reviews[0].by,'PRIVATE_REVIEWER');assert.deepEqual(row.parents,['TEST-ENGINEERING']);
  assert.deepEqual(lab.roadmaps.get('ROADMAP-PRIVATE').tests,['TEST-PRIVATE']);assert.equal(lab.roadmaps.get('ROADMAP-PRIVATE').used,1);
  assert.deepEqual(lab.hypotheses.get('HYP-PRIVATE').tests,['TEST-PRIVATE']);assert.deepEqual(lab.campaigns.get('CAMPAIGN-PRIVATE').tests,['TEST-PRIVATE']);
  const evidence=state.science_projection_v1.tests.find(row=>row.id==='TEST-PRIVATE');
  assert.equal(evidence.result.value.value,3);assert.equal(evidence.statistics.p_value.value,0.2);
  assert.deepEqual(evidence.artifacts.value,['private://synthetic-artifact']);assert.equal(evidence.robustness_checks.value[0].private_detail,'Not sanitized');
  const alternate=state.science_projection_v1.tests.find(row=>row.id==='TEST-ENGINEERING');
  assert.equal(alternate.result.value.value,7);assert.equal(alternate.statistics.p_value.value,0.3);
});

test('existing Atlas graph retains private Olympus selection and source-backed cross-domain learning',()=>{
  const state=compile(),model=buildAtlasMetroModel(state,Date.parse(state.generated_at));
  assert.ok(model.nodes.some(row=>row.domain==='OLYMPUS'&&row.sourceId==='test:TEST-PRIVATE'));
  assert.ok(model.crossLinks.some(row=>row.isLearning&&row.learningRef==='LESSON-PRIVATE'));
  assert.ok(model.crossLinks.some(row=>row.isLearning&&row.learningRef==='LINK-PRIVATE'));
  assert.equal(state.filaments.find(row=>row.id==='LESSON-PRIVATE').scope,'INTER_DOMAIN');
  const ids=new Set(state.graph.nodes.map(row=>row.id));assert.equal(ids.size,state.graph.nodes.length);
  assert.ok(state.graph.edges.every(row=>ids.has(row.from)&&ids.has(row.to)));
  assert.equal(state.graph.nodes.find(row=>row.id==='campaign:CAMPAIGN-PRIVATE').campaign_id,'CAMPAIGN-PRIVATE');
});

test('human gates are explicit and ordinary WORK is never misrepresented as an executable action',()=>{
  const state=compile(),human=humanActions(state);
  assert.equal(human.length,1);assert.equal(human[0].action_id,'WORK-HUMAN');assert.equal(human[0].lane,'OLYMPUS');
  assert.equal(human[0].required_operation,'UNKNOWN');assert.equal(human[0].runtime,'UNKNOWN');assert.equal(human[0].risk,'UNKNOWN');assert.equal(human[0].reversible,null);
  assert.ok(!state.actions.some(row=>row.id==='WORK-ONLY'));assert.ok(state.projected_work.some(row=>row.id==='work:WORK-ONLY'));
  const inbox=state.inbox.find(row=>row.action_id==='WORK-HUMAN');assert.equal(inbox.kind,'FORNECER_DADO');
  assert.equal(inbox.human_requirements[0].id,'HUMAN-INPUT');assert.equal(inbox.automatic_requirements[0].id,'AUTO-INPUT');
  assert.deepEqual(inbox.readback_criteria,['Synthetic criterion']);assert.equal(inbox.action_location,'Synthetic private location');
  assert.ok(state.inbox.some(row=>row.id==='evolution:charters_waiting:ROADMAP-PRIVATE'));
  assert.ok(!resolvableActions(state).includes(human[0]));
  assert.equal(globalSummary(state).needsHuman,2);
  assert.equal(state.lanes.find(row=>row.domain==='OLYMPUS').state,'SNAPSHOT','WAIT_DEPENDENCY is not whole-lane failure');
  const changed=privateTowerSystemFixture();changed.records.work[0].human_action_required=false;changed.records.work[0].remaining_dependencies=[];
  assert.equal(humanActions(compilePrivateTowerSystem(changed)).length,0);
});

test('missing metrics, proof, providers, cosmology and partial evolution remain explicitly unavailable',()=>{
  const input=privateTowerSystemFixture();input.records.evolution={'thoughts.json':[{id:'ONLY-THOUGHT',at:input.generatedAt,kind:'QUESTION',text:'Synthetic retained thought',refs:[]}]};delete input.records.integrity;
  const state=compilePrivateTowerSystem(input);
  assert.equal(state.evolution,null);assert.equal(state.evolution_partial.thoughts[0].id,'ONLY-THOUGHT');assert.equal(state.availability.evolution.state,'PARTIAL');
  assert.equal(state.guardian,null);assert.equal(state.cosmology_state,null);
  assert.equal(state.capabilities[0].status,'UNVERIFIED');assert.equal(state.capabilities[0].risk,null);assert.equal(state.capabilities[0].last_verified_at,null);
  assert.equal(state.providers[0].last_success_at,null);
  const filament=state.filaments.find(row=>row.id==='LINK-PRIVATE');assert.equal(filament.weight,null);assert.equal(filament.support,null);assert.equal(filament.contradiction,null);
  assert.deepEqual(filament.unavailable_fields,['weight','support','contradiction']);
  const evidence=state.science_projection_v1.tests.find(row=>row.id==='TEST-ENGINEERING');assert.equal(evidence.threshold.value,null);assert.ok(evidence.threshold.unavailable_reason);
  assert.equal(state.graph.nodes.find(row=>row.id==='test:TEST-ENGINEERING').review_state,'UNKNOWN');
  const empty=compilePrivateTowerSystem({...input,records:{}});assert.equal(empty.global_state,'DEGRADED');assert.equal(empty.availability.work.state,'UNAVAILABLE');
  assert.equal(empty.runs.length,0);assert.equal(empty.guardian,null);assert.equal(empty.evolution,null);
  assert.ok(globalSummary(empty).domains.every(row=>row.state==='MISSING_PROVIDER'));
});

test('canonical evolution and integrity retain private details without public incident filtering',()=>{
  const state=compile();assert.equal(state.evolution.genome.generation,3);assert.equal(state.evolution.incidents[0].private,true);
  assert.equal(state.evolution.incidents[0].cause,'Synthetic private cause');assert.equal(state.guardian.private_detail,'Synthetic private integrity detail');
  assert.equal(state.evolution.thoughts[0].text,'Synthetic private thought');assert.equal(state.evolution.learning.rules[0].value,'private');
});

test('canonical complete cosmology keeps historical private tests and validates reference completeness',()=>{
  const input=privateTowerSystemFixture();
  input.records.cosmologyState={model:'COSMOLOGY_STATE_V1',authority:'TOWER',projection_only:true,historical_tests:[{id:'HISTORY-PRIVATE',domain:'OLYMPUS',private:true,status:'DONE',review_state:'REFUTED',method:'Synthetic historical method'}],
    frontiers:[{id:'FRONTIER-PRIVATE',title:'Synthetic private frontier',state:'OPEN',key_evidence:[{id:'HISTORY-PRIVATE'}],historical_lessons:[],campaign_ids:[],roadmap_ids:[],open_questions:[],next_discriminants:[],active_tests:[],synthesis_evidence_ids:['HISTORY-PRIVATE'],nexo_interpretation:[],evidence_counts:{confirmed:0,refuted:1,review:0,inconclusive:0,open:0}}]};
  const state=compilePrivateTowerSystem(input),lab=buildLab(state);
  assert.equal(state.cosmology_state.frontiers[0].id,'FRONTIER-PRIVATE');assert.equal(lab.historicalTests.get('HISTORY-PRIVATE').domain,'OLYMPUS');assert.equal(lab.historicalTests.get('HISTORY-PRIVATE').method,'Synthetic historical method');
  assert.ok(!lab.tests.has('HISTORY-PRIVATE'));
  input.records.cosmologyState.frontiers[0].key_evidence[0].id='MISSING-TEST';assert.equal(compilePrivateTowerSystem(input).cosmology_state,null);
  input.records.cosmologyState={frontiers:[]};assert.equal(compilePrivateTowerSystem(input).cosmology_state,null);
});

test('compiler rejects ambiguous identities and invalid generation instead of manufacturing a snapshot',()=>{
  const input=privateTowerSystemFixture();input.records.tests.push({...input.records.tests[0]});assert.throws(()=>compilePrivateTowerSystem(input),/IDENTITY_INVALID/);
  assert.throws(()=>compilePrivateTowerSystem({...privateTowerSystemFixture(),revision:'unversioned'}),/GENERATION_INVALID/);
  assert.throws(()=>compilePrivateTowerSystem({...privateTowerSystemFixture(),generatedAt:'not a time'}),/GENERATION_INVALID/);
});

test('private compiler contains no public compiler import or IO path',async()=>{
  const code=await readFile(new URL('../server/atlas/private-tower-system.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(code,/buildPagesProjection|buildPublicAtlasSsot|publicReadModel|publicIncidentSummaries|node:fs|fetch\s*\(/);
});

test('all explicitly declared learning endpoints survive without invented empirical weights',()=>{
  const input=privateTowerSystemFixture();
  input.records.interdomain[0].source_nodes=['TEST-PRIVATE','TEST-ENGINEERING'];
  input.records.interdomain[0].target_domains=['SCIENCE','OLYMPUS'];
  const state=compilePrivateTowerSystem(input),edges=state.graph.edges.filter(edge=>edge.is_learning&&edge.learning_ref==='LINK-PRIVATE');
  for (const from of ['test:TEST-PRIVATE','test:TEST-ENGINEERING']) for (const to of ['domain:SCIENCE','domain:OLYMPUS']) assert.ok(edges.some(edge=>edge.from===from&&edge.to===to));
  assert.equal(state.filaments.find(row=>row.id==='LINK-PRIVATE').weight,null);
  assert.ok(edges.every(edge=>edge.weight_basis==='PRESENTATION_ONLY'));
});

test('execution ledger never upgrades a terminal state to success without readback',()=>{
  const input=privateTowerSystemFixture();
  input.records.evolution['runs.json']={runs:[{run_id:'RUN-PRIVATE',action_id:'ACTION-EXEC',domain:'ENGINEERING',status:'SUCCEEDED',private_detail:'Synthetic private receipt'}]};
  const state=compilePrivateTowerSystem(input),run=state.runs[0];
  assert.equal(run.run_id,'RUN-PRIVATE');assert.equal(run.status,'UNKNOWN');assert.equal(run.readback.status,'UNVERIFIED');
  assert.equal(run.started_at,null);assert.equal(run.runtime,'UNKNOWN');assert.equal(run.retries,null);assert.equal(run.private_detail,'Synthetic private receipt');
  input.records.evolution['runs.json'].runs[0].readback={status:'CONFIRMED',provider:'synthetic',checked_at:input.generatedAt};
  assert.equal(compilePrivateTowerSystem(input).runs[0].status,'SUCCEEDED');
});

test('explicitly attested empty collections are distinguished from absent folders',()=>{
  const input=privateTowerSystemFixture(),keys=['work','tests','hypotheses','campaigns','roadmaps','lessons','interdomain','artifacts'];
  for (const key of keys) input.records[key]=[];
  input.records.capabilities={};input.records.evolution={};input.records.integrity=null;
  const state=compilePrivateTowerSystem(input);
  assert.equal(state.global_state,'SNAPSHOT');assert.equal(state.availability.work.state,'EMPTY');assert.equal(state.actions.length,0);
  assert.ok(state.lanes.every(lane=>lane.state==='SNAPSHOT'));
  delete input.records.coverage.work.complete;
  assert.equal(compilePrivateTowerSystem(input).availability.work.state,'UNAVAILABLE');
});

test('cancelled and retired work never becomes APPLIED from an old readback',()=>{
  for (const status of ['CANCELLED','ARCHIVED','RETIRED','SUPERSEDED','CLOSED']) {
    const input=privateTowerSystemFixture();input.records.work[2].status=status;input.records.work[2].readback={status:'CONFIRMED'};
    const action=compilePrivateTowerSystem(input).actions.find(row=>row.action_id==='ACTION-EXEC');
    assert.equal(action.status,'UNKNOWN',status);assert.equal(action.canonical_status,status);
  }
});

test('negative or resolved gate objects do not manufacture human requests',()=>{
  for (const gate of [{pending:false},{required:false},{status:'RESOLVED',kind:'APROVAR',question:'Old synthetic question'},{state:'APPROVED',pending:true},{note:'Synthetic metadata only'}]) {
    const input=privateTowerSystemFixture(),row=input.records.work[0];delete row.human_action_required;row.remaining_dependencies=[];row.human_gate=gate;
    assert.equal(humanActions(compilePrivateTowerSystem(input)).length,0,JSON.stringify(gate));
  }
  const input=privateTowerSystemFixture();input.records.work[0].human_gate={kind:'APROVAR',question:'Synthetic current approval?'};
  assert.equal(humanActions(compilePrivateTowerSystem(input))[0].human_gate.question,'Synthetic current approval?');
});

test('qualitative scientific result alias remains original private evidence',()=>{
  const input=privateTowerSystemFixture();input.records.tests[1].scientific_result='Synthetic private qualitative result';
  const state=compilePrivateTowerSystem(input),lab=buildLab(state);
  assert.equal(lab.tests.get('TEST-ENGINEERING').result,'Synthetic private qualitative result');
});

test('bare graph aliases remain unresolved after three distinct kinds share an identifier',()=>{
  const input=privateTowerSystemFixture();
  for (const key of ['work','tests','hypotheses']) input.records[key].push({id:'SHARED-PRIVATE',domain:'OLYMPUS',_source_path:`entities/${key}/SHARED-PRIVATE.json`});
  input.records.lessons[0].evidence_refs=['SHARED-PRIVATE'];
  const state=compilePrivateTowerSystem(input);
  assert.ok(state.unresolved_relations.some(row=>row.source_reference==='SHARED-PRIVATE'));
  assert.ok(!state.graph.edges.some(row=>row.source_reference==='SHARED-PRIVATE'));
});

test('canonical integrity payload and canonical event target aliases remain usable',()=>{
  const input=privateTowerSystemFixture();delete input.records.integrity;
  input.records.artifacts=[{id:'GUARDIAN-SYNTHETIC',kind:'INTEGRITY_REPORT',_source_path:'entities/artifact/GUARDIAN-SYNTHETIC.json',payload:{status:'RED',checked_at:input.generatedAt,checks_total:5,checks_failing:2,failing_areas:['synthetic'],private_detail:'Synthetic private cause'}}];
  input.records.events=[{event_type:'TEST_RESULT_RECORDED',event_id:'SYNTHETIC-EVENT',at:input.generatedAt,entity_name:'TEST-PRIVATE',role:'SYNTHETIC'}];
  const state=compilePrivateTowerSystem(input);
  assert.equal(state.guardian.status,'RED');assert.equal(state.guardian.private_detail,'Synthetic private cause');
  assert.equal(state.read_model.activity[0].entity_id,'TEST-PRIVATE');
});

test('raw canonical evolution files compile into a usable retained view without fabricated aggregates',()=>{
  const input=privateTowerSystemFixture();
  input.records.roadmaps[0].charter={status:'PROPOSED',question:'Synthetic proposed charter',budget:{max_tests:4},stop:{success_confirmed:2},renewable:true};
  input.records.tests[0].verdict='SUPPORTED';input.records.tests[0].review_state='PENDING_REVIEW';
  input.records.evolution={genome:{generation:5,genes:[{id:'GENE-PRIVATE',status:'CANARY',canonical:'Synthetic base',canary:'Synthetic candidate',private_detail:'Synthetic gene detail'}]},
    decoys:{planted:[{id:'DECOY-1'}],revealed:[{id:'DECOY-1',caught:true}]},
    thoughts:{entries:[{id:'THOUGHT-RAW',at:input.generatedAt,kind:'QUESTION',text:'Synthetic raw private thought',refs:['TEST-PRIVATE'],private:true}]},
    board:{posts:[{id:'BOARD-PRIVATE',at:input.generatedAt,from:'SYNTHETIC',to:'SYNTHETIC',text:'Synthetic private board',refs:['TEST-PRIVATE'],private:true}]},
    batteries:{batteries:[{id:'BAT-PRIVATE',status:'DISPATCHED'}]},
    families:{families:{'FAMILY-PRIVATE':{family_id:'FAMILY-PRIVATE',state:'ACTIVE',recipe:'synthetic_recipe',instances:[{id:'CELL-PRIVATE'}]}}}};
  input.records.tests[0].family_id='FAMILY-PRIVATE';
  const state=compilePrivateTowerSystem(input),evolution=state.evolution;
  assert.ok(evolution);assert.equal(evolution.genome.generation,5);assert.equal(evolution.gate.charters_waiting[0].roadmap_id,'ROADMAP-PRIVATE');
  assert.equal(evolution.gate.canaries_waiting[0].gene,'GENE-PRIVATE');assert.equal(evolution.genome.genes[0].private_detail,'Synthetic gene detail');
  assert.deepEqual(evolution.review_queue.referee_1,['TEST-PRIVATE']);assert.equal(evolution.reviews.PENDING_REVIEW,1);
  assert.equal(evolution.roadmaps[0].tests_used,1);assert.equal(evolution.roadmaps[0].confirmed,0);assert.equal(evolution.roadmaps[0].days,null);
  assert.deepEqual(evolution.decoys,{planted:1,revealed:1,caught:1});assert.equal(evolution.batteries.DISPATCHED,1);
  assert.equal(evolution.thoughts[0].private,true);assert.equal(evolution.board[0].private,true);assert.equal(evolution.families[0].tests,1);
  assert.equal(evolution.source_coverage.tests,true);assert.ok(evolution.source_coverage.derivations.roadmaps);
  assert.deepEqual(state.read_model.evolution.decoys,input.records.evolution.decoys);
  delete input.records.evolution.genome.generation;assert.equal(compilePrivateTowerSystem(input).evolution,null,'missing generation is never invented as zero');
});

test('governance PASS remains raw provenance, never a scientific verdict or state',()=>{
  const input=privateTowerSystemFixture();input.records.tests[1].verdict='PASS';
  const state=compilePrivateTowerSystem(input),row=state.science_projection_v1.tests.find(row=>row.id==='TEST-ENGINEERING');
  assert.equal(row.verdict.value,null);assert.ok(row.verdict.unavailable_reason);assert.equal(row.raw_verdict.value,'PASS');
  assert.equal(state.read_model.tests['TEST-ENGINEERING'].verdict,'PASS');assert.equal(state.graph.nodes.find(row=>row.id==='test:TEST-ENGINEERING').scientific_state,'UNKNOWN');
});

test('alternate hypothesis and WORK execution references keep their canonical links',()=>{
  const input=privateTowerSystemFixture();delete input.records.tests[0].hypothesis_id;input.records.tests[0].hypothesis_ref='HYP-PRIVATE';
  input.records.runs=[{id:'RUN-LINK',work_id:'WORK-EXEC',status:'RUNNING'}];
  delete input.records.capabilities['CAP-PRIVATE']._source_path;
  const state=compilePrivateTowerSystem(input);
  assert.ok(state.graph.edges.some(edge=>edge.from==='test:TEST-PRIVATE'&&edge.to==='hypothesis:HYP-PRIVATE'));
  assert.equal(state.runs[0].action_id,'ACTION-EXEC');
  assert.equal(state.graph.nodes.find(row=>row.id==='capability:CAP-PRIVATE').source_ref,state.capabilities[0].source_ref);
});

test('proposed charters remain human decisions when the unrelated genome is unavailable',()=>{
  const input=privateTowerSystemFixture();input.records.evolution={};input.records.roadmaps[0].charter.status='PROPOSED';
  const state=compilePrivateTowerSystem(input);
  assert.equal(state.evolution,null);assert.equal(state.evolution_partial.gate.charters_waiting[0].roadmap_id,'ROADMAP-PRIVATE');
  assert.ok(!Object.hasOwn(state.evolution_partial.gate,'canaries_waiting'));
  assert.ok(state.inbox.some(row=>row.id==='evolution:charters_waiting:ROADMAP-PRIVATE'));
});

test('explicitly partial source collections never yield complete aggregates or stop decisions',()=>{
  const input=privateTowerSystemFixture();
  input.records.evolution={genome:{generation:1,genes:[]},decoys:{planted:[],revealed:[]}};
  input.records.coverage.tests={status:'PARTIAL',complete:false,count:1};
  input.records.tests=[{id:'ONLY-PARTIAL',domain:'OLYMPUS',roadmap_id:'ROADMAP-PRIVATE',verdict:'REJECTED',review_state:'REFUTED',executed_at:input.generatedAt}];
  input.records.roadmaps[0].charter={status:'CHARTERED',stop:{kill_consecutive_refuted:1}};
  const state=compilePrivateTowerSystem(input);
  assert.equal(state.availability.tests.state,'PARTIAL');assert.equal(state.global_state,'DEGRADED');assert.equal(state.evolution,null);
  assert.equal(state.evolution_partial.source_coverage.tests,false);assert.ok(!state.evolution_partial.roadmaps);assert.ok(!state.evolution_partial.reviews);
});
