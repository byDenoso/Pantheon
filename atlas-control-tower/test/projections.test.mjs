import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
 buildScience, buildExecution, buildIntegrity, composeProjections, applyView, traverse,
 parseLayers, signalOf, humanCode, LAYERS, AUTHORITY, PROJECTION_STATE, ZOOM, PROJECTION_CONTRACT
} from '../lib/projections.mjs';

/* Fixtures mirror the real column names in Neon, so a schema drift breaks a test
   instead of quietly producing an empty layer. */

const scienceRows = () => ({
 domains: [
  {domain_id: 'D1', code: 'COSMO', name: 'Cosmologia', kind: 'SCIENCE', status: 'ACTIVE', description: 'Domínio'},
  {domain_id: 'D2', code: 'GRAV', name: 'Gravitação', kind: 'SCIENCE', status: 'ACTIVE', description: ''}
 ],
 entities: [
  {entity_id: 'C-1', entity_type: 'CAMPAIGN', title: 'Campanha 1', status: 'ACTIVE', updated_at: '2026-09-01T00:00:00Z'},
  {entity_id: 'H-1', entity_type: 'HYPOTHESIS', title: 'Hipótese aberta', status: 'OPEN', updated_at: '2026-09-02T00:00:00Z'},
  {entity_id: 'H-2', entity_type: 'HYPOTHESIS', title: 'Hipótese resolvida', status: 'HYPOTHESIS_KILLED', updated_at: '2026-09-03T00:00:00Z'},
  {entity_id: 'DH-1', entity_type: 'DECISION_HYPOTHESIS', title: 'Decisão', status: 'COMPLETE_VALIDATED__PASS', updated_at: '2026-09-04T00:00:00Z'},
  {entity_id: 'T-1', entity_type: 'TEST', title: 'Teste 1', status: 'PASS', updated_at: '2026-09-05T00:00:00Z'},
  {entity_id: 'RESULT::R-1', entity_type: 'RESULT', title: 'Resultado 1', status: 'DERIVED', updated_at: '2026-09-06T00:00:00Z'},
  {entity_id: 'P-1', entity_type: 'PUBLICATION', title: 'Artigo', status: 'SUBMITTED_PRD', updated_at: '2026-09-06T00:00:00Z'}
 ],
 entityDomains: [
  {entity_id: 'T-1', domain_id: 'D1', role: 'PRIMARY', mapping_basis: 'EXACT', confidence: 'HIGH'},
  {entity_id: 'H-1', domain_id: 'D1', role: 'PRIMARY', mapping_basis: 'EXACT', confidence: 'HIGH'},
  {entity_id: 'H-2', domain_id: 'D2', role: 'PRIMARY', mapping_basis: 'EXACT', confidence: 'HIGH'}
 ],
 relations: [
  {relation_id: 'R1', from_entity_id: 'T-1', to_entity_id: 'C-1', relation_type: 'PART_OF_CAMPAIGN', status: 'ACTIVE'},
  {relation_id: 'R2', from_entity_id: 'T-1', to_entity_id: 'H-1', relation_type: 'TESTS', status: 'ACTIVE', evidence_class: 'DIRECT'}
 ],
 provenance: [
  {provenance_id: 'PV1', owner_entity_id: 'T-1', source_kind: 'GOOGLE_SHEETS', source_id: 'SHEET', source_location: 'https://example.invalid/a', authority: 'CANONICAL_EVIDENCE_BYTES', hash: 'h1', observed_at: '2026-09-05T00:00:00Z'},
  {provenance_id: 'PV2', owner_entity_id: 'T-1', source_kind: 'GOOGLE_SHEETS', source_id: 'SHEET', source_location: 'row', authority: 'SHEET_PROJECTION', hash: 'h2', observed_at: '2026-09-05T00:00:00Z'}
 ],
 assets: [
  {asset_id: 'ASSET-1', drive_file_id: null, display_name: 'Pacote BAO', mime_type: null, authority: 'INPUT_CATALOG', origin: 'Tower/Input Catalog', observed_at: '2026-08-30T00:00:00Z'}
 ],
 publicationSubmissions: [
  {submission_id: 'SUB-1', manuscript: 'Manuscrito', journal: 'JCAP', status: 'SUBMITTED', external_status: 'RECEIVED', imported_at: '2026-09-01T00:00:00Z'}
 ],
 resultSubjects: [
  {result_entity_id: 'RESULT::R-1', resolved_entity_id: 'T-1', subject_type: 'TEST', classification_basis: 'EXACT_ENTITY_ID'}
 ],
 entityDisplay: [
  {entity_id: 'T-1', display_label: 'Teste um', is_curated: true, naming_method: 'CURATED', naming_version: 'v2', generated_at: '2026-09-05T00:00:00Z'}
 ]
});

const executionRows = () => ({
 actions: [
  {id: 'A1', domain: 'SCIENCE', title: 'Rodar teste', priority: 1, status: 'BLOCKED', blocker_reason: 'Falta input', source_ref: 'T-1', updated_at: '2026-09-05T00:00:00Z', metadata: {}},
  {id: 'A2', domain: 'ENGINEERING', title: 'Deploy', priority: 2, status: 'DONE', blocker_reason: '', source_ref: '', updated_at: '2026-09-06T00:00:00Z', metadata: {}}
 ],
 runs: [
  {id: 'R1', action_id: 'A2', domain: 'ENGINEERING', status: 'SUCCESS', runtime_env: 'NEON + GITHUB', artifact_hash: 'abc123', execution_log: 'ok', readback_verified: true, created_at: '2026-09-06T00:00:00Z', metadata: {}},
  {id: 'R2', action_id: null, domain: 'SCIENCE', status: 'BLOCKED', runtime_env: 'NEON', artifact_hash: '', execution_log: '', readback_verified: false, created_at: '2026-09-05T00:00:00Z', metadata: {}}
 ],
 events: [
  {event_id: 'E1', event_type: 'MATERIAL_RUN', component: 'executor', domain: 'SCIENCE', action_id: 'A1', status: 'OK', summary: '', occurred_at: '2026-09-05T00:00:00Z', source_ref: 'T-1'}
 ],
 attention: [
  {item_id: 'I1', domain: 'SCIENCE', item_type: 'BLOCK', priority: 'HIGH', status: 'OPEN', title: 'Aguardando bytes', blocker_code: 'INPUT_MISSING', updated_at: '2026-09-05T00:00:00Z'}
 ],
 currentState: [{component: 'atlas', domain: 'ENGINEERING', status: 'OK', action_id: 'A2'}]
});

const integrityRows = () => ({
 truthStates: [
  {domain: 'SCIENCE', owner_resource: 'NEON:science_v1', canonical_hash: 'f6b8', updated_at: '2026-09-07T00:00:00Z', metadata: {parity_status: 'PASS'}},
  {domain: 'LEARNING', owner_resource: 'NEON:learning_v1', canonical_hash: '209b', updated_at: '2026-09-06T00:00:00Z', metadata: {}}
 ],
 sources: [{source_id: 'SRC-1', source_type: 'Drive', name: 'PEER CANNON', url: 'https://example.invalid/doc', role: 'Inventário', trust_state: 'High', source_surface: 'Sources', imported_at: '2026-09-01T00:00:00Z'}],
 revisions: [
  {revision_id: 'REV1', entity_id: 'T-1', source_surface: 'Test Registry', observed_at: '2026-09-05T00:00:00Z', is_current: true},
  {revision_id: 'REV2', entity_id: 'T-1', source_surface: 'Test Registry', observed_at: '2026-09-04T00:00:00Z', is_current: false}
 ],
 syncState: [{source_key: 'ACTION_REGISTER', source_kind: 'GOOGLE_SHEETS', source_id: 'S1', source_ref: 'range', fingerprint: 'fp', sync_status: 'SYNCED', last_synced_at: '2026-09-04T00:00:00Z', error_text: ''}],
 importBatches: [{batch_id: 'B1', source_file_id: 'F1', status: 'COMPLETE', payload_hash: 'ph', created_at: '2026-09-06T00:00:00Z'}],
 entityDisplay: [{entity_id: 'T-1', is_curated: true, naming_method: 'CURATED', naming_version: 'v2', generated_at: '2026-09-05T00:00:00Z'}],
 migrationIssues: [
  {issue_id: 'MI1', issue_type: 'BROKEN_REFERENCE', severity: 'WARN', status: 'RESOLVED', detail: 'ok', created_at: '2026-09-01T00:00:00Z', resolved_at: '2026-09-02T00:00:00Z'},
  {issue_id: 'MI2', issue_type: 'MISSING_PARENT', severity: 'BLOCKER', status: 'OPEN', detail: 'sem pai', created_at: '2026-09-03T00:00:00Z'}
 ],
 learningIssues: [],
 runs: [{id: 'R1', domain: 'ENGINEERING', status: 'SUCCESS', artifact_hash: 'abc123', readback_verified: true, created_at: '2026-09-06T00:00:00Z'}],
 patterns: [{pattern_id: 'P1', title: 'Padrão', description: 'd', status: 'ACTIVE', supporting_count: 3, contradicting_count: 2, confidence_score: 0.6, updated_at: '2026-09-06T00:00:00Z'}],
 recordCounts: {'science_v1.entities': 5047, 'nexo_ops.actions': 12},
 projection: {generatedAt: '2026-09-08T00:00:00Z', fingerprint: 'fp', sourceVersion: 'sv'}
});

/* ------------------------------------------------------- three real layers */

test('each layer is assembled from its own tables, not one array filtered thrice', () => {
 const science = buildScience(scienceRows());
 const execution = buildExecution(executionRows());
 const integrity = buildIntegrity(integrityRows());

 assert.equal(science.layer, 'science');
 assert.equal(execution.layer, 'execution');
 assert.equal(integrity.layer, 'integrity');

 const sourcesOf = p => new Set(p.nodes.map(n => n.metadata?.source).filter(Boolean));
 assert.ok([...sourcesOf(science)].every(s => /^science_v1\./.test(s)));
 assert.ok([...sourcesOf(execution)].some(s => /^nexo_ops\./.test(s)));
 assert.ok([...sourcesOf(integrity)].some(s => /truth_states/.test(s)));

 // No two layers produce the same node set.
 const ids = p => new Set(p.nodes.map(n => n.id));
 assert.notDeepEqual([...ids(science)], [...ids(execution)]);
 assert.notDeepEqual([...ids(execution)], [...ids(integrity)]);
});

test('every declared tier of every layer is reachable from real rows', () => {
 const built = {
  science: buildScience(scienceRows()),
  execution: buildExecution(executionRows()),
  integrity: buildIntegrity(integrityRows())
 };
 for (const [id, projection] of Object.entries(built)) {
  const drawn = new Set(projection.nodes.map(n => n.tier));
  for (const tier of LAYERS[id].tiers) {
   assert.ok(drawn.has(tier), `${id} produced no ${tier} node from canonical rows`);
  }
 }
});

/* --------------------------------------------------------- honest labelling */

test('a derived node is labelled derived and names the rule that produced it', () => {
 const science = buildScience(scienceRows());
 const derivedClaim = science.nodes.find(n => n.id === 'claim:H-2');
 assert.ok(derivedClaim, 'resolved hypothesis did not produce a claim');
 assert.equal(derivedClaim.authority, AUTHORITY.DERIVED);
 assert.equal(derivedClaim.derivation, 'HYPOTHESIS_STATUS_RESOLUTION');
 assert.deepEqual(derivedClaim.derivedFrom, ['H-2']);

 // The canonical decision hypothesis is NOT relabelled as derived.
 const canonicalClaim = science.nodes.find(n => n.id === 'DH-1');
 assert.equal(canonicalClaim.authority, AUTHORITY.SCIENCE);
 assert.equal(canonicalClaim.derivation, null);

 // An unresolved hypothesis is not promoted into a claim.
 assert.equal(science.nodes.some(n => n.id === 'claim:H-1'), false);
});

test('assets with no declared entity link are shown as unlinked, never attached to a guess', () => {
 const science = buildScience(scienceRows());
 const dataset = science.nodes.find(n => n.tier === 'DATASET');
 assert.equal(dataset.unlinked, true);
 assert.equal(dataset.metadata.link_state, 'NO_ENTITY_LINK_DECLARED');
 assert.equal(science.edges.some(e => e.target === dataset.id), false);
});

test('only evidence-grade provenance becomes evidence', () => {
 const science = buildScience(scienceRows());
 const evidence = science.nodes.filter(n => n.tier === 'EVIDENCE');
 assert.equal(evidence.length, 1);
 assert.equal(evidence[0].metadata.owner_entity_id, 'T-1');
 assert.equal(evidence[0].authority, AUTHORITY.SCIENCE);
});

test('execution groupings are marked derived while the rows behind them are not', () => {
 const execution = buildExecution(executionRows());
 const runtime = execution.nodes.find(n => n.tier === 'RUNTIME');
 const run = execution.nodes.find(n => n.tier === 'RUN');
 assert.equal(runtime.authority, AUTHORITY.DERIVED);
 assert.equal(runtime.derivation, 'DISTINCT_RUNTIME_ENV');
 assert.equal(run.authority, AUTHORITY.OPERATIONAL);
 assert.equal(run.derivation, null);
});

test('a writeback exists only where a run actually verified its readback', () => {
 const execution = buildExecution(executionRows());
 const writebacks = execution.nodes.filter(n => n.tier === 'WRITEBACK');
 assert.equal(writebacks.length, 1);
 assert.equal(writebacks[0].metadata.run_id, 'R1');
});

test('the Atlas declares itself a projection, never a truth owner', () => {
 const integrity = buildIntegrity(integrityRows());
 const self = integrity.nodes.find(n => n.id === 'atlas:projection');
 assert.equal(self.tier, 'ATLAS_PROJECTION');
 assert.equal(self.authority, AUTHORITY.DERIVED);
 assert.equal(integrity.nodes.some(n => n.tier === 'TRUTH_OWNER' && n.id === 'atlas:projection'), false);
 assert.ok(integrity.nodes.some(n => n.tier === 'TRUTH_OWNER' && n.authority !== AUTHORITY.DERIVED));
});

test('an open validation issue also surfaces as a contradiction, a resolved one does not', () => {
 const integrity = buildIntegrity(integrityRows());
 const contradictions = integrity.nodes.filter(n => n.tier === 'CONTRADICTION');
 assert.ok(contradictions.some(n => n.id.includes('MI2')));
 assert.equal(contradictions.some(n => n.id.includes('MI1')), false);
});

test('probed record counts are carried through and an unknown count is absent, not zero', () => {
 const rows = integrityRows();
 const integrity = buildIntegrity(rows);
 const record = integrity.nodes.find(n => n.id === 'record:science_v1.entities');
 assert.equal(record.metadata.count, 5047);
 assert.equal(integrity.nodes.some(n => n.id === 'record:science_v1.relations'), false);
});

/* --------------------------------------------------------- depth and layout */

test('tier position drives real Z depth across the declared spine', () => {
 const science = buildScience(scienceRows());
 const domain = science.nodes.find(n => n.tier === 'DOMAIN');
 const result = science.nodes.find(n => n.tier === 'RESULT');
 assert.ok(domain.z < result.z, 'first tier must sit in front of the last');
 assert.equal(domain.z, -1);
 assert.equal(result.z, 1);
});

test('composition gives each layer its own Z band instead of flattening them', () => {
 const composed = composeProjections([buildScience(scienceRows()), buildIntegrity(integrityRows())]);
 assert.deepEqual(composed.layers, ['science', 'integrity']);
 const scienceZ = composed.nodes.filter(n => n.layer === 'science').map(n => n.z);
 const integrityZ = composed.nodes.filter(n => n.layer === 'integrity').map(n => n.z);
 assert.ok(Math.max(...scienceZ) <= Math.min(...integrityZ) + 1e-9, 'layer bands must not interleave');
});

test('a node present in two composed layers is reported as a bridge, not silently merged', () => {
 const a = buildScience(scienceRows());
 const b = buildExecution(executionRows());
 const composed = composeProjections([a, b]);
 // T-1 is a science entity referenced by an operational action.
 assert.ok(composed.bridges.some(x => x.id === 'T-1'), 'cross-layer node not reported');
 assert.equal(composed.nodes.filter(n => n.id === 'T-1').length, 1);
 assert.equal(composed.metadata.bridgeCount, composed.bridges.length);
});

test('one, two and three layers all compose', () => {
 const all = [buildScience(scienceRows()), buildExecution(executionRows()), buildIntegrity(integrityRows())];
 assert.deepEqual(composeProjections([all[0]]).layers, ['science']);
 assert.equal(composeProjections(all.slice(0, 2)).layers.length, 2);
 const three = composeProjections(all);
 assert.equal(three.layers.length, 3);
 assert.ok(three.nodes.length > all[0].nodes.length);
 assert.equal(three.contract, PROJECTION_CONTRACT);
});

/* ------------------------------------------------------------ semantic zoom */

test('semantic zoom adds detail instead of reshuffling the map', () => {
 const science = buildScience(scienceRows());
 const macro = applyView(science, {zoom: ZOOM.MACRO});
 const meso = applyView(science, {zoom: ZOOM.MESO});
 const micro = applyView(science, {zoom: ZOOM.MICRO});
 assert.ok(macro.nodes.length < meso.nodes.length);
 assert.ok(meso.nodes.length < micro.nodes.length);
 const macroIds = new Set(macro.nodes.map(n => n.id));
 assert.ok([...macroIds].every(id => meso.nodes.some(n => n.id === id)), 'zooming in must keep what was already visible');
 assert.deepEqual(macro.nodes.map(n => n.tier).filter(t => t === 'RESULT'), []);
});

/* ----------------------------------------------------------- empty states */

test('filtering everything out reports FILTER_EMPTY, never NO_DATA', () => {
 const science = buildScience(scienceRows());
 const filtered = applyView(science, {q: 'nada-que-exista-aqui'});
 assert.equal(filtered.nodes.length, 0);
 assert.equal(filtered.state, PROJECTION_STATE.FILTER_EMPTY);
 assert.equal(filtered.metadata.hiddenByView, science.nodes.length);
});

test('a layer with no rows reports NO_DATA and stays distinguishable from a filter', () => {
 const empty = buildScience({});
 assert.equal(empty.state, PROJECTION_STATE.NO_DATA);
 assert.equal(empty.nodes.length, 0);
 assert.notEqual(empty.state, PROJECTION_STATE.FILTER_EMPTY);
});

test('the endpoint distinguishes every declared empty state', () => {
 const declared = new Set(Object.values(PROJECTION_STATE));
 for (const required of ['NO_DATA', 'FILTER_EMPTY', 'BACKEND_ERROR', 'SOURCE_UNAVAILABLE', 'SYNCING', 'GRAPH_BUILDING', 'PERMISSION_ERROR']) {
  assert.ok(declared.has(required), `missing empty state ${required}`);
 }
 const source = fs.readFileSync(new URL('../api/projection.js', import.meta.url), 'utf8');
 assert.match(source, /PERMISSION_ERROR/);
 assert.match(source, /SOURCE_UNAVAILABLE/);
 assert.doesNotMatch(source, /catch\s*\(\s*\)\s*\{\s*return\s*\[\s*\]/, 'no silent fallback to fake data');
});

test('a filtered view recomputes integrity over what is actually on screen', () => {
 const science = buildScience(scienceRows());
 const macro = applyView(science, {zoom: ZOOM.MACRO});
 assert.equal(macro.integrity.canonicalNodes + macro.integrity.derivedNodes, macro.nodes.length);
 assert.notEqual(macro.integrity.canonicalNodes, science.integrity.canonicalNodes);
 // The whole-layer figures survive, explicitly labelled rather than discarded.
 assert.equal(macro.integrity.ofLayer.canonicalNodes, science.integrity.canonicalNodes);
});

test('a tier with no status column is not counted as a missing status', () => {
 const science = buildScience(scienceRows());
 const dataset = science.nodes.find(n => n.tier === 'DATASET');
 const test1 = science.nodes.find(n => n.tier === 'TEST');
 assert.equal(dataset.statusDeclared, false);
 assert.equal(test1.statusDeclared, true);
 assert.ok(science.integrity.statuslessNodes > 0);
 const shouldHaveStatus = science.nodes.filter(n => n.statusDeclared && n.signal === 'unknown').length;
 assert.equal(science.integrity.unknownSignal, shouldHaveStatus);
});

/* -------------------------------------------------------------- traversal */

test('traversal walks neighbours, ancestors, descendants and full lineage', () => {
 const science = buildScience(scienceRows());
 const neighbours = traverse(science, 'T-1', {direction: 'neighbors', depth: 1});
 assert.ok(neighbours.nodes.length > 1);
 const ancestors = traverse(science, 'T-1', {direction: 'ancestors', depth: 3});
 assert.ok(ancestors.nodes.some(n => n.id === 'domain:COSMO'));
 const descendants = traverse(science, 'T-1', {direction: 'descendants', depth: 3});
 assert.ok(descendants.nodes.some(n => n.id === 'RESULT::R-1'));
 const lineage = traverse(science, 'T-1', {direction: 'lineage'});
 assert.ok(lineage.nodes.length >= neighbours.nodes.length);
});

test('cross-layer traversal reaches the other layer through a bridge node', () => {
 const composed = composeProjections([buildScience(scienceRows()), buildExecution(executionRows())]);
 const lineage = traverse(composed, 'T-1', {direction: 'lineage'});
 assert.ok(lineage.layers.includes('science'));
 assert.ok(lineage.layers.includes('execution'), 'lineage did not cross into the execution layer');
});

/* --------------------------------------------------------------- contract */

test('layer names are validated and an unknown one is reported, not dropped', () => {
 assert.deepEqual(parseLayers('science,integrity').layers, ['science', 'integrity']);
 assert.deepEqual(parseLayers('science,science').layers, ['science']);
 const bad = parseLayers('science,wormhole');
 assert.deepEqual(bad.layers, ['science']);
 assert.deepEqual(bad.unknown, ['wormhole']);
 assert.deepEqual(parseLayers('').layers, ['science']);
});

test('the free-text science status vocabulary collapses to drawable signals', () => {
 assert.equal(signalOf('COMPLETE_VALIDATED__PASS_EXACT_IDENTITY'), 'supported');
 assert.equal(signalOf('HYPOTHESIS_KILLED__TERMINAL'), 'negative');
 assert.equal(signalOf('BLOCKED_INPUT_BYTES__NO_SCIENCE_RESULT'), 'blocked');
 assert.equal(signalOf('SUPERSEDED_DUPLICATE'), 'legacy');
 assert.equal(signalOf('PENDING_CANONICALIZATION'), 'partial');
 assert.equal(signalOf('RUNNING'), 'active');
 assert.equal(signalOf(''), 'unknown');
});

test('long operator prose is a summary, never a map label', () => {
 const rows = executionRows();
 rows.actions[0].blocker_reason = 'Falta o pacote de bytes oficial do DESI DR2 e o gate humano ainda não decidiu o caminho de submissão simultânea';
 const execution = buildExecution(rows);
 const blocker = execution.nodes.find(n => n.id === 'blocker:action:A1');
 assert.equal(blocker.label, 'Rodar teste', 'the task title names the node');
 assert.equal(blocker.summary, rows.actions[0].blocker_reason, 'the reason is kept whole');
 assert.ok(blocker.label.length < 40);
});

test('a screaming-snake code becomes readable while the raw code is preserved', () => {
 assert.equal(humanCode('BLOCKED_SOURCE_EMBARGOED_PENDING_DESI_DR2_RELEASE'), 'Source embargoed pending desi…');
 assert.equal(humanCode('INPUT_MISSING'), 'Input missing');
 assert.equal(humanCode(''), '');
 const execution = buildExecution(executionRows());
 const item = execution.nodes.find(n => n.id === 'blocker:item:I1');
 assert.equal(item.label, 'Input missing');
 assert.equal(item.metadata.blocker_code, 'INPUT_MISSING', 'the code itself must survive in metadata');
});

test('integrity reports how much of the picture the Atlas computed', () => {
 const science = buildScience(scienceRows());
 assert.ok(science.integrity.derivedNodes > 0);
 assert.ok(science.integrity.canonicalNodes > science.integrity.derivedNodes);
 assert.ok(science.integrity.derivations.includes('HYPOTHESIS_STATUS_RESOLUTION'));
 assert.equal(science.integrity.canonicalNodes + science.integrity.derivedNodes, science.nodes.length);
});

test('no edge ever reaches the renderer without both endpoints drawn', () => {
 for (const projection of [buildScience(scienceRows()), buildExecution(executionRows()), buildIntegrity(integrityRows())]) {
  const ids = new Set(projection.nodes.map(n => n.id));
  for (const e of projection.edges) {
   assert.ok(ids.has(e.source) && ids.has(e.target), `${projection.layer} emitted an unplaceable edge ${e.id}`);
  }
 }
});

test('a capped tier declares what it left out instead of pretending to be complete', () => {
 const science = buildScience(scienceRows(), {perTier: 1});
 const tiers = science.metadata.tiers;
 assert.equal(tiers.HYPOTHESIS.drawn, 1);
 assert.equal(tiers.HYPOTHESIS.declared, 2);
 assert.equal(tiers.HYPOTHESIS.truncated, true);
 assert.equal(science.metadata.truncated, true);
 assert.equal(science.integrity.truncated, true);
});

test('the projection route is declared in the deployment manifest', () => {
 const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
 assert.ok(vercel.builds.some(b => b.src === 'api/projection.js'), 'projection function is not built');
 const route = (vercel.routes || []).find(r => r.src === '/api/projection');
 assert.ok(route, 'projection route missing');
 assert.equal(route.dest, '/api/projection.js');
 const legacy = (vercel.routes || []).findIndex(r => String(r.src).includes('state|sync|graph'));
 const projection = (vercel.routes || []).findIndex(r => r.src === '/api/projection');
 assert.ok(projection < legacy, 'projection must be matched before the legacy alternation');
});
