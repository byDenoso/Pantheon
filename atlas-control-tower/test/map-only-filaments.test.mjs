/** The workspace is the map, and the map carries the relations.
 *  Domain-to-domain filaments are counted from tests that themselves declare
 *  membership in both domains; nothing is inferred from titles or wording. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const testNode = (id, domains) => ({id, type: 'TEST', label: id, domain: domains[0], domains});

/* ---------- 1. the declared domain-to-domain web ---------- */

test('a domain link counts the tests that declare both domains', async () => {
 const {domainCoDeclarations} = await import('../lib/domain-links.mjs');
 const links = domainCoDeclarations([
  testNode('T1', ['D7', 'D3']),
  testNode('T2', ['D3', 'D7']),
  testNode('T3', ['D7', 'D2']),
  testNode('T4', ['D7']),
  testNode('T5', ['D1', 'D3', 'D7']),
  {id: 'domain:D7', type: 'DOMAIN', domain: 'D7'}
 ]);
 const find = (a, b) => links.find(l => l.a === a && l.b === b);
 assert.equal(find('D3', 'D7').tests, 3, 'D3↔D7 is declared by T1, T2 and T5');
 assert.equal(find('D2', 'D7').tests, 1);
 assert.equal(find('D1', 'D3').tests, 1);
 assert.equal(find('D1', 'D7').tests, 1);
 assert.equal(links.length, 4);
 for (const l of links) assert.ok(l.a < l.b, `${l.a}|${l.b} must be stored in a stable order`);
 assert.deepEqual(links.map(l => l.tests), [...links.map(l => l.tests)].sort((x, y) => y - x));
});

test('domain links never invent a relation', async () => {
 const {domainCoDeclarations} = await import('../lib/domain-links.mjs');
 assert.deepEqual(domainCoDeclarations([]), []);
 assert.deepEqual(domainCoDeclarations(null), []);
 assert.deepEqual(domainCoDeclarations([testNode('T', ['D1'])]), []);
 assert.deepEqual(domainCoDeclarations([{id: 'T', type: 'TEST', domains: ['D1', '', 'D1', null]}]), []);
 assert.deepEqual(domainCoDeclarations([{id: 'x', type: 'CLAIM', domains: ['D1', 'D2']}]), []);
});

test('the science graph response carries the declared domain links', () => {
 const runtime = read('api/runtime.js');
 assert.match(runtime, /domainCoDeclarations/, 'the runtime must derive the links from the full graph');
 assert.match(runtime, /domainLinks/, 'the graph payload must expose them');
 assert.match(runtime, /system:SCIENCE/, 'they belong to the science overview only');
});

test('the graph contract carries domain links instead of dropping them as extra', async () => {
 const {normalizeGraph} = await import('../lib/graph-contract.mjs');
 const g = normalizeGraph({
  focus: 'system:SCIENCE', nodes: [], edges: [],
  domainLinks: [
   {a: 'D3', b: 'D7', tests: 11},
   {a: 'D1', b: 'D1', tests: 4},
   {a: 'D2', b: '', tests: 2},
   {a: 'D5', b: 'D6', tests: 0}
  ]
 });
 assert.deepEqual(g.domainLinks, [{a: 'D3', b: 'D7', tests: 11}]);
 assert.ok(!('domainLinks' in (g.extra || {})), 'domain links belong to the contract, not to extra');
 assert.deepEqual(normalizeGraph({nodes: [], edges: []}).domainLinks, []);
});

/* ---------- 2. links become filaments on the map ---------- */

test('domain links become cross-domain filaments between the domain bodies', async () => {
 const {withDomainLinks} = await import('../ui/map-data.mjs');
 const {classifyEdge} = await import('../ui/filaments.mjs');
 const data = {
  focus: 'system:SCIENCE',
  nodes: [
   {id: 'system:SCIENCE', type: 'SYSTEM'},
   {id: 'domain:D7', type: 'DOMAIN', domain: 'D7'},
   {id: 'domain:D3', type: 'DOMAIN', domain: 'D3'},
   {id: 'domain:D2', type: 'DOMAIN', domain: 'D2'}
  ],
  edges: [],
  domainLinks: [{a: 'D3', b: 'D7', tests: 11}, {a: 'D2', b: 'D7', tests: 1}, {a: 'D9', b: 'D7', tests: 4}]
 };
 const out = withDomainLinks(data, 'system:SCIENCE');
 const added = out.edges.filter(e => e.type === 'CO_DECLARED');
 assert.equal(added.length, 2, 'a link to a domain that is not on the map cannot be drawn');
 const strong = added.find(e => e.id.includes('D3'));
 assert.deepEqual([strong.source, strong.target].sort(), ['domain:D3', 'domain:D7']);
 assert.equal(strong.authority, 'DERIVED_NOT_EVIDENCE');
 assert.equal(strong.tests, 11);
 const byId = new Map(out.nodes.map(n => [n.id, n]));
 assert.equal(classifyEdge(byId.get(strong.source), byId.get(strong.target), strong), 'cross-domain');
 assert.equal(data.edges.length, 0);
 assert.equal(withDomainLinks({...data, domainLinks: []}, 'system:SCIENCE').edges.length, 0);
 assert.equal(withDomainLinks(data, 'domain:D7').edges.length, 0, 'links belong to the science overview');
});

/* ---------- 3. each class of filament reads as its own colour ---------- */

test('every filament class declares its own hue and pulse', async () => {
 const {FILAMENT_STYLE} = await import('../ui/visual-config.mjs');
 const hues = ['cross-domain', 'intra-domain', 'intra-test'].map(k => FILAMENT_STYLE[k].hue);
 assert.equal(new Set(hues).size, 3, 'the three classes must be told apart by colour');
 for (const kind of ['cross-domain', 'intra-domain', 'intra-test']) {
  const s = FILAMENT_STYLE[kind];
  assert.match(String(s.hue), /^#[0-9a-f]{6}$/i, `${kind} needs a real hue`);
  assert.ok(s.led > 0, `${kind} needs a visible pulse head`);
  assert.ok(s.trail > 0, `${kind} needs a trail so direction is readable`);
 }
 const graph = read('graph3d.mjs');
 assert.match(graph, /style\.hue/, 'the renderer must tint each filament by its class');
 assert.match(graph, /style\.led/, 'the renderer must draw the pulse head at the class size');
});

test('the pulse head travels the curve rather than blinking in place', () => {
 const graph = read('graph3d.mjs');
 assert.match(graph, /quadraticBezierPoint\(a,cp,b,f\.phase\)/, 'the head must sit on the curve at the current phase');
 assert.match(graph, /f\.phase-f\.direction/, 'the trail must follow behind the direction of travel');
 assert.doesNotMatch(graph, /Math\.random/, 'motion must stay deterministic');
});

/* ---------- 4. the workspace is the map ---------- */

test('the NextGen workspace is one map with semantic depth instead of tab panels', () => {
 const html = read('index.html');
 assert.doesNotMatch(html, /role="tablist"|data-mode="explore"|data-mode="learning"|data-mode="audit"/);
 assert.doesNotMatch(html, /id="data-section"|id="learning-section-panel"|id="audit-section"|data-open-mode/);
 assert.match(html, /id="cosmos"/);
 for (const view of ['macro','scientific','provenance']) assert.ok(html.includes(`data-view="${view}"`), `semantic view ${view} must remain`);
 assert.match(html, /id="auto-layer"/);
 assert.match(html, /id="inspector"/);
});

test('the workspace module knows only the map', async () => {
 const {normalizeMode, modeState} = await import('../ui/workspace.mjs');
 assert.equal(normalizeMode('learning'), 'overview');
 assert.equal(normalizeMode('audit'), 'overview');
 assert.equal(normalizeMode('explore'), 'overview');
 assert.equal(normalizeMode(), 'overview');
 assert.deepEqual(modeState('overview'), {map: true});
});

test('no legacy code still reaches for the removed panels', () => {
 const app = read('app.mjs');
 for (const gone of ['#data-section', '#learning-section-panel', '#audit-section', 'data-open-mode']) assert.ok(!app.includes(gone), `app.mjs still references ${gone}`);
 assert.doesNotMatch(app, /loadAudit|loadLearning\(/, 'the removed panels must not be loaded');
 assert.match(app, /renderBlackBox/);
 assert.match(app, /graph\.set\(/);
 const nextgen = read('nextgen/app.mjs');
 assert.doesNotMatch(nextgen, /#data-section|#learning-section-panel|#audit-section|data-open-mode/);
 assert.match(nextgen, /new AtlasEngine/);
});
