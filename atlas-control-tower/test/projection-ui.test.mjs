import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PROJECTION_STATE as SERVER_STATE, buildScience, buildExecution, buildIntegrity, composeProjections, applyView} from '../lib/projections.mjs';
const applyViewMacro = p => applyView(p, {zoom: 1});
import {PROJECTION_STATE as CLIENT_STATE, STATE_COPY, resolveState, renderState} from '../ui/projection-state.mjs';
import {consoleModel, toggleLayer, LAYER_META, SIGNAL_META, ZOOM_META} from '../ui/layer-console.mjs';
import {projectionLayout, constellations, applyLod, cull, nodeImportance, seed, LOD_BUDGET} from '../ui/projection-layout.mjs';
import {fuzzyScore, rankCommands, rankEntities} from '../ui/command-palette.mjs';
import {frontendFiles} from '../frontend-files.mjs';

const node = (id, over = {}) => ({
 id, layer: 'science', tier: 'TEST', tierIndex: 4, z: 0, zoom: 2,
 type: 'TEST', authority: 'SCIENCE_CANONICAL', derivation: null,
 signal: 'supported', label: id, ...over
});
const projectionOf = (nodes, edges = []) => ({
 contract: 'projection-v1', layer: 'science', layers: ['science'],
 tiers: ['DOMAIN', 'CAMPAIGN', 'HYPOTHESIS', 'CLAIM', 'TEST', 'EVIDENCE', 'DATASET', 'PAPER', 'RESULT'],
 nodes, edges, clusters: [], state: nodes.length ? 'OK' : 'NO_DATA',
 metadata: {counts: {}, drawnNodes: nodes.length, edgeCount: edges.length},
 generatedAt: '2026-09-08T00:00:00Z',
 sourceState: {sourceVersion: '2026-09-07', freshness: 'LIVE'},
 integrity: {canonicalNodes: nodes.length, derivedNodes: 0, derivedRatio: 0, unlinkedNodes: 0, derivations: []}
});

/* ------------------------------------------------------ contract stays in sync */

test('the browser copy of the projection states matches the server list exactly', () => {
 assert.deepEqual(Object.keys(CLIENT_STATE).sort(), Object.keys(SERVER_STATE).sort());
 for (const key of Object.keys(SERVER_STATE)) assert.equal(CLIENT_STATE[key], SERVER_STATE[key]);
});

test('every projection state has its own copy, tone and glyph', () => {
 for (const state of Object.values(SERVER_STATE)) {
  const copy = STATE_COPY[state];
  assert.ok(copy, `no copy for ${state}`);
  assert.ok(copy.title && copy.detail && copy.icon && copy.badge, `${state} is missing copy`);
 }
 // No two states may read the same: that is the whole point of having seven.
 const titles = Object.values(STATE_COPY).map(c => c.title);
 assert.equal(new Set(titles).size, titles.length);
 const badges = Object.values(STATE_COPY).map(c => c.badge);
 assert.equal(new Set(badges).size, badges.length);
});

test('no signal or state is carried by colour alone', () => {
 for (const [id, meta] of Object.entries(SIGNAL_META)) {
  assert.ok(meta.glyph, `${id} has no glyph`);
  assert.ok(meta.label, `${id} has no written label`);
 }
 for (const state of Object.values(SERVER_STATE)) {
  assert.ok(STATE_COPY[state].icon && STATE_COPY[state].badge);
 }
});

/* --------------------------------------------------------------- empty states */

test('a filtered-empty projection never renders as "no data"', () => {
 const filterEmpty = renderState(resolveState({...projectionOf([]), state: SERVER_STATE.FILTER_EMPTY}));
 const noData = renderState(resolveState({...projectionOf([]), state: SERVER_STATE.NO_DATA}));
 assert.match(filterEmpty, /recorte/i);
 assert.match(noData, /não tem registros/i);
 assert.notEqual(filterEmpty, noData);
 assert.match(filterEmpty, /data-state="FILTER_EMPTY"/);
 assert.match(noData, /data-state="NO_DATA"/);
});

test('a failed read names the source that failed instead of showing a blank map', () => {
 const html = renderState(resolveState({
  ...projectionOf([]), state: SERVER_STATE.SOURCE_UNAVAILABLE,
  errors: [{layer: 'integrity', kind: 'SOURCE_UNAVAILABLE', table: 'nexo_ops.truth_states', status: 503}]
 }));
 assert.match(html, /truth_states/);
 assert.match(html, /HTTP 503/);
 assert.match(html, /integrity/);
 assert.match(html, /nem por zeros/);
});

test('a healthy projection renders no banner at all', () => {
 assert.equal(renderState(resolveState(projectionOf([node('a')]))), '');
});

test('a partly degraded composition annotates the map instead of hiding it', () => {
 const html = renderState(resolveState({
  ...projectionOf([node('a')]),
  degraded: [{layer: 'execution', state: 'SOURCE_UNAVAILABLE'}]
 }));
 assert.match(html, /is-warn/);
 assert.match(html, /execution/);
 assert.match(html, /continuam sendo desenhadas/);
});

test('an in-flight sync is reported as syncing, never as empty', () => {
 const resolved = resolveState(projectionOf([]), {syncing: true});
 assert.equal(resolved.state, SERVER_STATE.SYNCING);
 assert.notEqual(resolved.state, SERVER_STATE.NO_DATA);
});

test('an unknown state degrades to BACKEND_ERROR rather than rendering nothing', () => {
 const resolved = resolveState({...projectionOf([]), state: 'WAT'});
 assert.equal(resolved.state, SERVER_STATE.BACKEND_ERROR);
});

/* ------------------------------------------------------------ layer console */

test('the console never lets the operator turn off the last layer', () => {
 assert.deepEqual(toggleLayer(['science'], 'science'), ['science']);
 assert.deepEqual(toggleLayer(['science', 'integrity'], 'science'), ['integrity']);
});

test('layers keep their declared order however they are toggled on', () => {
 const order = Object.keys(LAYER_META);
 assert.deepEqual(toggleLayer(['integrity'], 'science'), ['science', 'integrity']);
 assert.deepEqual(toggleLayer(['integrity', 'science'], 'execution'), order);
});

test('an unknown layer name changes nothing', () => {
 assert.deepEqual(toggleLayer(['science'], 'wormhole'), ['science']);
});

test('the console reports what was read and what was computed, and invents no count', () => {
 const projection = buildScience({
  domains: [{domain_id: 'D1', code: 'C', name: 'C'}],
  entities: [{entity_id: 'H1', entity_type: 'HYPOTHESIS', title: 'h', status: 'HYPOTHESIS_KILLED'}]
 });
 const model = consoleModel({projection, layers: ['science'], zoom: 2});
 assert.equal(model.integrity.canonical + model.integrity.derived, projection.nodes.length);
 assert.ok(model.integrity.derivations.includes('HYPOTHESIS_STATUS_RESOLUTION'));
 assert.equal(model.layers.find(l => l.id === 'science').active, true);
 assert.equal(model.layers.find(l => l.id === 'execution').active, false);

 // A projection that publishes no integrity block reports "not published",
 // never a fabricated zero.
 const bare = consoleModel({projection: {nodes: [], edges: [], tiers: []}, layers: ['science']});
 assert.equal(bare.integrity.canonical, null);
});

test('every tier of the spine appears in the console, including the empty ones', () => {
 const projection = buildIntegrity({truthStates: [{domain: 'SCIENCE', owner_resource: 'x', updated_at: 'y'}]});
 const model = consoleModel({projection, layers: ['integrity'], zoom: 3});
 assert.equal(model.tiers.length, projection.tiers.length);
 assert.ok(model.tiers.some(t => t.count === 0), 'an empty tier must still be listed');
});

test('a tier hidden by the current recorte is never reported as having no records', () => {
 const projection = buildScience({
  domains: [{domain_id: 'D1', code: 'C', name: 'C'}],
  entities: [{entity_id: 'R1', entity_type: 'RESULT', title: 'r', status: 'PASS'}]
 });
 const macro = applyViewMacro(projection);
 const model = consoleModel({projection: macro, layers: ['science'], zoom: 1});
 const result = model.tiers.find(t => t.id === 'RESULT');
 const evidence = model.tiers.find(t => t.id === 'EVIDENCE');
 assert.equal(result.count, 0);
 assert.equal(result.hidden, true, 'a tier excluded by zoom must be marked hidden');
 assert.equal(result.empty, false);
 assert.equal(evidence.empty, true, 'a tier with no rows must be marked empty');
 assert.equal(evidence.hidden, false);
});

test('the zoom control offers exactly the three declared bands', () => {
 assert.deepEqual(ZOOM_META.map(z => z.value), [1, 2, 3]);
});

/* ------------------------------------------------------------------- layout */

test('a node keeps the same seat across renders of the same data', () => {
 const projection = projectionOf([node('a'), node('b', {tier: 'DOMAIN'}), node('c')]);
 assert.deepEqual(projectionLayout(projection), projectionLayout(projection));
 assert.equal(seed('a'), seed('a'));
 assert.notEqual(seed('a'), seed('b'));
});

test('tier position becomes radius and the declared Z becomes depth', () => {
 const projection = projectionOf([
  node('inner', {tier: 'DOMAIN', z: -1}),
  node('outer', {tier: 'RESULT', z: 1})
 ]);
 const [inner, outer] = projectionLayout(projection);
 assert.ok(Math.hypot(inner[0], inner[1]) < Math.hypot(outer[0], outer[1]), 'first tier must sit inside the last');
 assert.ok(inner[2] < outer[2], 'declared Z must drive depth');
});

test('the focused node is pulled to the origin so the camera has a subject', () => {
 const projection = projectionOf([node('a'), node('b')]);
 const [first] = projectionLayout(projection, {focus: 'a'});
 assert.deepEqual(first, [0, 0, 0]);
});

test('constellations group by domain and keep a stable order', () => {
 const groups = constellations([
  node('a', {domain: 'COSMO'}), node('b', {domain: 'GRAV'}), node('c', {domain: 'COSMO'})
 ]);
 assert.equal(groups[0].id, 'COSMO');
 assert.equal(groups[0].nodes.length, 2);
 assert.equal(groups.length, 2);
});

test('nodes with no cluster land in one shared sector rather than scattering', () => {
 const groups = constellations([node('a'), node('b')], {key: () => ''});
 assert.equal(groups.length, 1);
 assert.equal(groups[0].id, '—');
});

/* ---------------------------------------------------------------------- LOD */

test('the level of detail never drops what the operator is looking at', () => {
 const nodes = Array.from({length: 400}, (_, i) => node(`n${i}`));
 const projection = projectionOf(nodes);
 const cut = applyLod(projection, {focus: 'n399', selected: 'n398', hover: 'n397', budget: {...LOD_BUDGET, nodes: 5}});
 const kept = new Set(cut.nodes.map(n => n.id));
 assert.equal(cut.nodes.length, 5);
 for (const id of ['n399', 'n398', 'n397']) assert.ok(kept.has(id), `${id} was dropped by the budget`);
});

test('the level of detail reports what it left out instead of implying completeness', () => {
 const projection = projectionOf(Array.from({length: 50}, (_, i) => node(`n${i}`)));
 const cut = applyLod(projection, {budget: {...LOD_BUDGET, nodes: 10}});
 assert.equal(cut.omitted.nodes, 40);
});

test('structural tiers and cross-layer joins outrank leaves under pressure', () => {
 const tiers = ['DOMAIN', 'TEST', 'RESULT'];
 const domain = nodeImportance(node('d', {tier: 'DOMAIN', zoom: 1}), {tiers});
 const leaf = nodeImportance(node('r', {tier: 'RESULT', zoom: 3}), {tiers});
 const bridge = nodeImportance(node('b', {tier: 'RESULT', zoom: 3, alsoInLayers: ['execution']}), {tiers});
 assert.ok(domain > leaf);
 assert.ok(bridge > leaf);
});

test('a blocked body is kept ahead of a healthy one of the same tier', () => {
 const tiers = ['TEST'];
 assert.ok(
  nodeImportance(node('x', {signal: 'blocked'}), {tiers}) >
  nodeImportance(node('y', {signal: 'supported'}), {tiers}));
});

test('an edge is only drawn when both of its endpoints survived the budget', () => {
 const projection = projectionOf(
  [node('a'), node('b'), node('c')],
  [{id: 'ab', source: 'a', target: 'b'}, {id: 'ac', source: 'a', target: 'c'}]);
 const cut = applyLod(projection, {focus: 'a', budget: {...LOD_BUDGET, nodes: 2}});
 const ids = new Set(cut.nodes.map(n => n.id));
 for (const e of cut.edges) assert.ok(ids.has(e.source) && ids.has(e.target));
});

test('culling hides what the camera cannot see and keeps what it can', () => {
 const points = [{x: 10, y: 10, r: 4}, {x: -900, y: 10, r: 4}, {x: 400, y: 300, r: 4}];
 const visible = cull(points, {width: 800, height: 600});
 assert.equal(visible.length, 2);
 assert.equal(cull(points, {width: 0, height: 0}).length, 3, 'an unmeasured canvas must not cull');
});

/* ---------------------------------------------------------- command palette */

test('the palette matches on subsequences, not just prefixes', () => {
 assert.ok(fuzzyScore('Domínio Cosmologia', 'cosmo') > 0);
 assert.ok(fuzzyScore('Domínio Cosmologia', 'dmco') > 0);
 assert.equal(fuzzyScore('Domínio Cosmologia', 'zzz'), -1);
 assert.equal(fuzzyScore('anything', ''), 0);
});

test('an exact substring outranks a scattered subsequence', () => {
 assert.ok(fuzzyScore('teste planck', 'planck') > fuzzyScore('p l a n c k spread', 'planck'));
});

test('the palette only offers entities that are actually on the map', () => {
 const nodes = [node('T-PLANCK', {label: 'Teste Planck'}), node('T-ACT', {label: 'Teste ACT'})];
 const hits = rankEntities(nodes, 'planck');
 assert.equal(hits.length, 1);
 assert.equal(hits[0].node.id, 'T-PLANCK');
 assert.deepEqual(rankEntities(nodes, ''), []);
});

test('commands are reachable by their keywords as well as their titles', () => {
 const commands = [{id: 'action:sync', title: 'Sincronizar fontes', keywords: 'neon drive leitura'}];
 assert.equal(rankCommands(commands, 'neon').length, 1);
 assert.equal(rankCommands(commands, 'sincronizar').length, 1);
 assert.equal(rankCommands(commands, 'kubernetes').length, 0);
});

/* ------------------------------------------------------------- deployment */

test('the public boundary and build include the active NextGen shell plus reusable legacy modules', () => {
 const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
 const builds = new Set(vercel.builds.map(b => b.src));
 const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
 for (const file of ['nextgen/styles.css', 'nextgen/app.mjs', 'nextgen/graph/engine.mjs', 'ui/projection-layout.mjs', 'ui/projection-state.mjs', 'ui/layer-console.mjs', 'ui/command-palette.mjs']) {
  assert.ok(frontendFiles.includes(file), `frontend boundary missing ${file}`);
  assert.ok(builds.has(file), `vercel build missing ${file}`);
 }
 assert.match(index, /\/nextgen\/styles\.css/);
 assert.match(index, /\/nextgen\/app\.mjs/);
 assert.match(index, /id="cosmos"/);
 assert.match(index, /id="inspector"/);
 assert.doesNotMatch(index, /\/ui\/cosmos\.css/, 'legacy cosmic stylesheet must not compete with the active NextGen shell');
});

test('server-only projection code never reaches the browser bundle', () => {
 for (const file of ['lib/projections.mjs', 'lib/neon-read.mjs', 'api/projection.js']) {
  assert.equal(frontendFiles.includes(file), false, `${file} must stay server-side`);
 }
 const app = fs.readFileSync(new URL('../app.mjs', import.meta.url), 'utf8');
 assert.doesNotMatch(app, /from '\.\/lib\/projections\.mjs'/);
 assert.doesNotMatch(app, /from '\.\/lib\/neon-read\.mjs'/);
});

/* ------------------------------------------------------- composed rendering */

test('a three-layer composition still produces a drawable, honest console model', () => {
 const composed = composeProjections([
  buildScience({domains: [{domain_id: 'D1', code: 'C', name: 'C'}], entities: [{entity_id: 'T1', entity_type: 'TEST', title: 't', status: 'PASS'}]}),
  buildExecution({actions: [{id: 'A1', domain: 'SCIENCE', title: 'a', status: 'BLOCKED', blocker_reason: 'x'}]}),
  buildIntegrity({truthStates: [{domain: 'SCIENCE', owner_resource: 'o', updated_at: 'u'}]})
 ]);
 const model = consoleModel({projection: composed, layers: ['science', 'execution', 'integrity'], zoom: 3});
 assert.equal(model.layers.filter(l => l.active).length, 3);
 assert.ok(model.drawn > 0);
 assert.ok(model.signals.length > 0);
 const positions = projectionLayout(composed, {tiers: composed.tiers});
 assert.equal(positions.length, composed.nodes.length);
 assert.ok(positions.every(p => p.every(Number.isFinite)), 'every seat must be a finite coordinate');
});