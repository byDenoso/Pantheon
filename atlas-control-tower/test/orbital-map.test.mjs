/** Orbital layout, filament semantics and the explainable Black Box summary.
 *  Geometry and filaments are navigation aids: they never carry scientific
 *  authority, and no relation is drawn that the source does not declare. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const domainGraph = (count, focus = 'domain:D7') => ({
 nodes: [
  {id: focus, type: 'DOMAIN', label: 'CMB', domain: 'D7'},
  ...Array.from({length: count}, (_, i) => ({
   id: `TEST-D7-${String(i + 1).padStart(3, '0')}`,
   type: 'TEST',
   label: `Question number ${i + 1}`,
   domain: 'D7',
   domains: ['D7']
  }))
 ],
 edges: Array.from({length: count}, (_, i) => ({
  id: `${focus}:CONTAINS:TEST-D7-${String(i + 1).padStart(3, '0')}`,
  source: focus,
  target: `TEST-D7-${String(i + 1).padStart(3, '0')}`,
  type: 'CONTAINS',
  authority: 'DERIVED_NOT_EVIDENCE'
 }))
});

/* ---------- 1-4 : orbital layout geometry ---------- */

test('a domain layout spreads its children on both sides of the focus', async () => {
 const {orbitalLayout} = await import('../ui/orbital-layout.mjs');
 const g = domainGraph(28);
 const pos = orbitalLayout(g.nodes, 'domain:D7');
 assert.equal(pos.length, g.nodes.length);
 assert.deepEqual(pos[0], [0, 0, 0], 'the focus must sit at the origin');
 const kids = pos.slice(1);
 const left = kids.filter(p => p[0] < -40).length, right = kids.filter(p => p[0] > 40).length;
 const up = kids.filter(p => p[1] < -40).length, down = kids.filter(p => p[1] > 40).length;
 assert.ok(left >= 5, `only ${left} children left of the focus`);
 assert.ok(right >= 5, `only ${right} children right of the focus`);
 assert.ok(up >= 4 && down >= 4, `vertical spread too flat (up=${up} down=${down})`);
 const ratio = Math.min(left, right) / Math.max(left, right);
 assert.ok(ratio >= 0.45, `sides too unbalanced (${left} vs ${right})`);
});

test('a domain layout has real depth instead of a single Z plane', async () => {
 const {orbitalLayout} = await import('../ui/orbital-layout.mjs');
 const kids = orbitalLayout(domainGraph(28).nodes, 'domain:D7').slice(1);
 const zs = kids.map(p => p[2]);
 const behind = zs.filter(z => z < -30).length, front = zs.filter(z => z > 30).length;
 assert.ok(behind >= 4 && front >= 4, `Z is flat (behind=${behind} front=${front})`);
 const spread = Math.max(...zs) - Math.min(...zs);
 assert.ok(spread >= 140, `Z spread ${spread} is too small to read as depth`);
});

test('a domain layout uses several orbital radii, never one perfect ring', async () => {
 const {orbitalLayout} = await import('../ui/orbital-layout.mjs');
 const kids = orbitalLayout(domainGraph(28).nodes, 'domain:D7').slice(1);
 const radii = kids.map(p => Math.hypot(p[0], p[1], p[2]));
 const min = Math.min(...radii), max = Math.max(...radii);
 assert.ok(max - min >= 130, `radius spread ${Math.round(max - min)} looks like a mandala`);
 const buckets = new Set(radii.map(r => Math.round(r / 60)));
 assert.ok(buckets.size >= 3, `only ${buckets.size} distinct distance bands`);
 // an even angular fan would leave the angle histogram perfectly flat
 const angles = kids.map(p => Math.atan2(p[1], p[0]));
 const sorted = [...angles].sort((a, b) => a - b);
 const gaps = sorted.slice(1).map((a, i) => a - sorted[i]);
 const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
 const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
 assert.ok(variance > 1e-4, 'angular spacing is perfectly regular (mandala)');
});

test('the orbital layout is deterministic for the same entity ids', async () => {
 const {orbitalLayout} = await import('../ui/orbital-layout.mjs');
 const g = domainGraph(24);
 assert.deepEqual(orbitalLayout(g.nodes, 'domain:D7'), orbitalLayout(g.nodes, 'domain:D7'));
 const shuffled = {nodes: [g.nodes[0], ...g.nodes.slice(1).reverse()]};
 const a = new Map(g.nodes.map((n, i) => [n.id, orbitalLayout(g.nodes, 'domain:D7')[i]]));
 const b = new Map(shuffled.nodes.map((n, i) => [n.id, orbitalLayout(shuffled.nodes, 'domain:D7')[i]]));
 for (const [id, p] of a) assert.deepEqual(b.get(id), p, `${id} moved when the input order changed`);
});

/* ---------- 5 : density ---------- */

test('the default cut never renders more than 36 nodes and keeps the real total', () => {
 const cfg = read('ui/visual-config.mjs');
 const max = Number(cfg.match(/maxNodes:(\d+)/)?.[1]);
 assert.ok(max >= 24 && max <= 36, `maxNodes=${max} must stay inside the readable 24-36 window`);
 const html = read('index.html');
 assert.match(html, /id="more"/, 'the "more entities" affordance must survive the density cap');
});

/* ---------- 6-8 : filament semantics ---------- */

test('an edge between different declared domains classifies as cross-domain', async () => {
 const {classifyEdge} = await import('../ui/filaments.mjs');
 const a = {id: 'T1', type: 'TEST', domain: 'D7', domains: ['D7']};
 const b = {id: 'T2', type: 'PATTERN', domain: 'D2', domains: ['D2']};
 assert.equal(classifyEdge(a, b, {type: 'RELATES_TO'}), 'cross-domain');
 const bridge = {id: 'T3', type: 'TEST', domain: 'D7', domains: ['D7', 'D1']};
 assert.equal(classifyEdge(bridge, {id: 'D1', type: 'DOMAIN', domain: 'D1'}, {type: 'CONTAINS'}), 'cross-domain');
 assert.equal(classifyEdge(a, b, {type: 'RELATES_TO', relationScope: 'CROSS_DOMAIN'}), 'cross-domain');
});

test('an edge inside one declared domain classifies as intra-domain', async () => {
 const {classifyEdge} = await import('../ui/filaments.mjs');
 const dom = {id: 'domain:D7', type: 'DOMAIN', domain: 'D7'};
 const pat = {id: 'P1', type: 'PATTERN', domain: 'D7', domains: ['D7']};
 assert.equal(classifyEdge(dom, pat, {type: 'CONTAINS'}), 'intra-domain');
 const noDomain = {id: 'S1', type: 'SYSTEM'};
 assert.equal(classifyEdge(noDomain, {id: 'S2', type: 'DOMAIN'}, {type: 'CONTAINS'}), 'intra-domain',
  'undeclared domains must never be invented as a cross-domain bridge');
});

test('an edge between two tests classifies as intra-test', async () => {
 const {classifyEdge} = await import('../ui/filaments.mjs');
 const a = {id: 'T1', type: 'TEST', domain: 'D7', domains: ['D7']};
 const b = {id: 'T2', type: 'TEST', domain: 'D7', domains: ['D7']};
 assert.equal(classifyEdge(a, b, {type: 'RELATES_TO'}), 'intra-test');
});

test('filaments are only built from relations the source declares', async () => {
 const {buildFilaments} = await import('../ui/filaments.mjs');
 const g = domainGraph(10);
 const built = buildFilaments(g, {});
 assert.equal(built.length, g.edges.length, 'a filament must map to exactly one declared edge');
 for (const f of built) assert.ok(g.edges.some(e => e.id === f.edge.id), 'filament without a source edge');
 assert.equal(buildFilaments({nodes: g.nodes, edges: []}, {}).length, 0, 'no edges must mean no filaments');
});

/* ---------- 9-10 : pulse motion ---------- */

test('a filament pulse stays inside [0,1] whatever the delta time', async () => {
 const {advancePulse} = await import('../ui/filaments.mjs');
 let f = {phase: 0.4, direction: 1, speed: 0.3};
 for (const dt of [0.016, 0.4, 3, 12, 0.001, 60]) {
  f = advancePulse(f, dt);
  assert.ok(f.phase >= 0 && f.phase <= 1, `phase escaped the curve: ${f.phase}`);
  assert.ok(f.direction === 1 || f.direction === -1, `direction must stay ±1, got ${f.direction}`);
 }
});

test('a filament pulse reverses direction at both ends instead of jumping back', async () => {
 const {advancePulse} = await import('../ui/filaments.mjs');
 let f = {phase: 0.95, direction: 1, speed: 0.2};
 f = advancePulse(f, 0.5);
 assert.equal(f.direction, -1, 'reaching 1 must flip the pulse back towards A');
 f = {phase: 0.05, direction: -1, speed: 0.2};
 f = advancePulse(f, 0.5);
 assert.equal(f.direction, 1, 'reaching 0 must flip the pulse back towards B');
 // continuity: a small step never teleports across the curve
 let g = {phase: 0.5, direction: 1, speed: 0.25};
 const before = g.phase;
 g = advancePulse(g, 0.016);
 assert.ok(Math.abs(g.phase - before) < 0.05, 'the pulse jumped instead of travelling');
});

test('pulse speed is ordered cross-domain < intra-domain < intra-test and time based', async () => {
 const {pulseSpeed} = await import('../ui/filaments.mjs');
 const cross = pulseSpeed('cross-domain', 'a'), intra = pulseSpeed('intra-domain', 'a'), test_ = pulseSpeed('intra-test', 'a');
 assert.ok(cross < intra && intra < test_, `speeds out of order: ${cross} ${intra} ${test_}`);
 assert.ok(cross >= 0.10 && cross <= 0.16, `cross-domain speed ${cross} outside 0.10-0.16`);
 assert.ok(intra >= 0.18 && intra <= 0.28, `intra-domain speed ${intra} outside 0.18-0.28`);
 assert.ok(test_ >= 0.28 && test_ <= 0.42, `intra-test speed ${test_} outside 0.28-0.42`);
 assert.equal(pulseSpeed('cross-domain', 'a'), pulseSpeed('cross-domain', 'a'), 'speed must be deterministic per id');
 const graph = read('graph3d.mjs');
 assert.match(graph, /advancePulse/, 'the renderer must advance pulses');
 assert.match(graph, /\bdt\b|deltaTime/, 'pulse motion must be driven by real delta time, not frame count');
});

/* ---------- 11 : reduced motion ---------- */

test('reduced motion switches the orbital drift and the pulses off', async () => {
 const {orbitalOffset} = await import('../ui/orbital-layout.mjs');
 const still = orbitalOffset('TEST-1', 1234, {reducedMotion: true});
 assert.deepEqual(still, [0, 0, 0], 'reduced motion must not move any node');
 const moving = orbitalOffset('TEST-1', 1234, {reducedMotion: false});
 assert.ok(moving.some(v => v !== 0), 'orbital drift is missing');
 const amp = Math.max(...moving.map(Math.abs));
 assert.ok(amp <= 14, `drift amplitude ${amp} is large enough to break hit-testing`);
 const graph = read('graph3d.mjs');
 assert.match(graph, /prefers-reduced-motion/, 'the renderer must respect prefers-reduced-motion');
});

test('the animated offset never replaces the semantic base position', async () => {
 const {orbitalOffset} = await import('../ui/orbital-layout.mjs');
 const a = orbitalOffset('TEST-1', 0, {reducedMotion: false});
 const b = orbitalOffset('TEST-1', 900, {reducedMotion: false});
 assert.notDeepEqual(a, b, 'the drift must actually animate over time');
 const graph = read('graph3d.mjs');
 assert.match(graph, /orbitalOffset/, 'the renderer must add a drift offset to the base position');
});

/* ---------- 12-14 : explainable Black Box ---------- */

test('the decision summary never exposes or names private chain-of-thought', async () => {
 const mod = await import('../ui/decision-summary.mjs');
 const source = read('ui/decision-summary.mjs') + read('ui/blackbox-view.mjs');
 assert.doesNotMatch(source, /chain[- ]of[- ]thought/i);
 assert.doesNotMatch(source, /cadeia de pensamento/i);
 assert.doesNotMatch(source, /raciocínio interno/i);
 const summary = mod.decisionSummary({status: 'SUCCESS', metadata: {operation: 'PASS'}});
 assert.equal(summary.authority, 'DERIVED_NOT_EVIDENCE');
});

test('the decision summary is the declared eight-step operational trajectory', async () => {
 const {decisionSummary, DECISION_STEPS} = await import('../ui/decision-summary.mjs');
 assert.deepEqual(DECISION_STEPS.map(s => s.id),
  ['observations', 'patterns', 'comparisons', 'hypotheses', 'evidence', 'decision', 'confidence', 'next']);
 const rich = decisionSummary({
  status: 'SUCCESS',
  summary: 'Bounded pass completed.',
  metadata: {
   runtime_env: 'NEXO_CONTINUITY_SCHEDULED_TASK',
   operation: 'CONTINUITY_BLACKBOX_VBLOCKER_PASS',
   new_observation: 'OBS::snapshot',
   pattern_link: 'PAT-NEXO-X',
   readback_verified: true,
   science_boundary: 'UNCHANGED'
  }
 });
 assert.equal(rich.steps.length, 8);
 const byId = Object.fromEntries(rich.steps.map(s => [s.id, s]));
 assert.ok(byId.observations.available, 'runtime_env/new_observation must feed the observations step');
 assert.ok(byId.patterns.available, 'pattern_link must feed the patterns step');
 assert.ok(byId.confidence.available, 'readback_verified must feed the confidence step');
 const bare = decisionSummary({status: 'SUCCESS'});
 for (const step of bare.steps) {
  if (step.available) continue;
  assert.equal(step.value, 'Não informado na fonte.', `${step.id} invented content`);
 }
});

test('the Black Box surface says "Como chegou aqui" and marks the summary as derived', () => {
 const view = read('ui/blackbox-view.mjs');
 assert.match(view, /Como chegou aqui/i);
 assert.match(view, /decisionSummary/);
 assert.match(view, /DERIVED_NOT_EVIDENCE/);
});

test('Learning keeps its relations derived and never promotes them to evidence', () => {
 const learning = read('ui/learning-view.mjs');
 assert.match(learning, /DERIVED_NOT_EVIDENCE/, 'the filament legend must declare its authority');
 assert.match(learning, /filament-legend/, 'Learning must carry the filament legend');
 const filaments = read('ui/filaments.mjs');
 assert.match(filaments, /DERIVED_NOT_EVIDENCE/);
 assert.doesNotMatch(filaments, /SCIENCE_CANONICAL\s*=/, 'filaments must never mint canonical authority');
});

/* ---------- 15 : labels ---------- */

test('no hash or machine initialism reaches the map as a display label', async () => {
 const {nodeDisplayLabel} = await import('../ui/cockpit-copy.mjs');
 const test_ = {
  id: 'DISC26-010-R1', canonicalId: 'DISC26-010-R1', type: 'TEST',
  label: 'Does the eta=.1 deformed-pNGB PR4 response localize to a TT frequency subset?',
  metadata: {short_label_pt: '', acronym: 'DEDPPRLTT'}
 };
 const shown = nodeDisplayLabel(test_, 22);
 assert.notEqual(shown, 'DEDPPRLTT', 'a machine initialism must not win over the readable canonical id');
 assert.equal(shown, 'DISC26-010-R1');
 assert.equal(nodeDisplayLabel({...test_, metadata: {short_label_pt: 'Resposta PR4 em TT'}}, 22), 'Resposta PR4 em TT');
 const uuid = {id: 'run:a3ca0f0e-d5c3-4891-8cf4-8e0f3e4e3af4', canonicalId: 'a3ca0f0e-d5c3-4891-8cf4-8e0f3e4e3af4',
  type: 'AUTOMATION_RUN', label: 'ENGINEERING · SUCCESS', metadata: {}};
 const runLabel = nodeDisplayLabel(uuid, 22);
 assert.doesNotMatch(runLabel, /[0-9a-f]{8}-[0-9a-f]{4}/, 'a uuid must never be a display label');
 assert.equal(runLabel, 'ENGINEERING · SUCCESS');
 assert.equal(nodeDisplayLabel({id: 'domain:D7', type: 'DOMAIN',
  label: 'CMB, Recombination, Primordial Signatures & Systematics', metadata: {}}, 22), 'CMB');
});

test('a long canonical code is shortened, never replaced by an initialism', async () => {
 const {nodeDisplayLabel} = await import('../ui/cockpit-copy.mjs');
 const node = id => ({id, canonicalId: id, type: 'TEST',
  label: 'A very long English research question that will not fit on the map at all',
  metadata: {short_label_pt: '', acronym: 'AVLERQTWNFOTMAA'}});
 for (const id of ['T-CMB-BIREFRINGENCE-ACTDR6-SYSTEMATICS-001',
                   'T-DET26-FNL-DESIQSO-CMBLENS-009',
                   'T-COMP-C032-PLANCK-PEER-NOVA-ACTIVE-STRESS-001']) {
  const shown = nodeDisplayLabel(node(id), 22);
  assert.ok(shown.length <= 22, `${shown} is longer than the label budget`);
  assert.notEqual(shown, 'AVLERQTWNFOTMAA', `${id} fell back to the machine initialism`);
  assert.ok(shown.startsWith(id.split('-').slice(0, 2).join('-')), `${shown} lost the code family of ${id}`);
  const ordinal = id.split('-').pop();
  assert.ok(shown.endsWith(ordinal), `${shown} dropped the ordinal that separates siblings`);
 }
 // a code that already fits is never mangled
 assert.equal(nodeDisplayLabel(node('T-BAT26-020'), 22), 'T-BAT26-020');
});

/* ---------- 16-21 : navigation stays progressive and real ---------- */

test('nodes stay hit-testable while the filaments animate', () => {
 const graph = read('graph3d.mjs');
 assert.match(graph, /hit\(x,y\)/, 'the hit test must survive');
 assert.match(graph, /this\.points=/, 'hit-testing reads projected points');
 assert.ok(graph.indexOf('orbitalOffset') < graph.indexOf('this.points='),
  'the drift must be applied before points are projected so clicks match what is drawn');
});

test('root NEXO still shows systems only and science still opens domains only', () => {
 const graph = read('graph3d.mjs');
 assert.match(graph, /rootOnly/);
 assert.match(graph, /n\.type==='SYSTEM'/);
 const api = read('lib/adapters.mjs');
 assert.match(api, /DOMAIN/);
});

test('the visual cut keeps the declared total and the hidden-children signal', async () => {
 const {visualCut} = await import('../ui/map-data.mjs');
 const g = domainGraph(120);
 const cut = visualCut(g, 'domain:D7', 36);
 assert.ok(cut.nodes.length <= 36, `cut kept ${cut.nodes.length} nodes`);
 assert.equal(cut.nodes[0].id, 'domain:D7', 'the focus must never be cut away');
 assert.equal(cut.visualTotal, 121, 'the real total must be preserved');
 assert.ok(cut.hasMore, 'the cut must declare that more entities exist');
 for (const e of cut.edges) {
  assert.ok(cut.nodes.some(n => n.id === e.source), 'dangling edge source');
  assert.ok(cut.nodes.some(n => n.id === e.target), 'dangling edge target');
 }
 const small = visualCut(domainGraph(9), 'domain:D7', 36);
 assert.equal(small.nodes.length, 10, 'a small domain must not be padded or cut');
 assert.equal(small.hasMore, false);
});

/* ---------- 17-20 : filament budget ---------- */

test('filaments stay inside the readable budget with and without a selection', async () => {
 const {buildFilaments, FILAMENT_LIMITS} = await import('../ui/filaments.mjs');
 assert.ok(FILAMENT_LIMITS.crossDomain <= 20 && FILAMENT_LIMITS.intraDomain <= 30 && FILAMENT_LIMITS.intraTest <= 20);
 const nodes = [{id: 'domain:D7', type: 'DOMAIN', domain: 'D7'}];
 const edges = [];
 for (let i = 0; i < 200; i++) {
  const id = `T${i}`;
  nodes.push({id, type: 'TEST', domain: i % 3 ? 'D7' : 'D2', domains: [i % 3 ? 'D7' : 'D2']});
  edges.push({id: 'e' + i, source: 'domain:D7', target: id, type: 'CONTAINS'});
  if (i > 0) edges.push({id: 'x' + i, source: `T${i - 1}`, target: id, type: 'RELATES_TO'});
 }
 const idle = buildFilaments({nodes, edges}, {});
 assert.ok(idle.length <= 35, `idle view drew ${idle.length} filaments`);
 const selected = buildFilaments({nodes, edges}, {selected: 'T5'});
 assert.ok(selected.length <= 60, `selection drew ${selected.length} filaments`);
 assert.ok(selected.some(f => f.edge.source === 'T5' || f.edge.target === 'T5'),
  'the selected neighbourhood must be kept');
});

test('the Learning legend names the three filament classes', () => {
 const learning = read('ui/learning-view.mjs');
 for (const label of ['intra-domínio', 'entre testes', 'cross-domain']) {
  assert.ok(learning.toLowerCase().includes(label.toLowerCase()), `legend is missing "${label}"`);
 }
});

test('one render loop drives every filament: no per-edge timer or DOM node', () => {
 const graph = read('graph3d.mjs'), filaments = read('ui/filaments.mjs');
 assert.doesNotMatch(graph, /setInterval/, 'per-edge timers are forbidden');
 assert.doesNotMatch(filaments, /setInterval|setTimeout|requestAnimationFrame/);
 assert.doesNotMatch(filaments, /document\.create/, 'filaments must stay on the canvas');
 assert.equal((graph.match(/requestAnimationFrame/g) || []).length <= 3, true, 'more than one animation loop');
});

test('stylesheet imports resolve next to their own file, not against the host root', () => {
 // The deployed page loads these stylesheets from a pinned CDN path. A root
 // absolute @import would resolve against the CDN origin and silently 404,
 // dropping the whole theme token set in production.
 for (const file of ['styles.css', 'ui/premium-v2.css', 'ui/official-dashboard.css', 'ui/readability.css']) {
  const css = read(file);
  const absolute = css.match(/@import\s+url\(['"]?\/[^)]*\)/g) || [];
  assert.deepEqual(absolute, [], `${file} imports from the host root: ${absolute.join(', ')}`);
 }
 assert.match(read('styles.css'), /@import url\('\.\/ui\/tokens\.css'\)/,
  'styles.css must still pull the theme tokens it declares it owns');
});

test('light theme keeps map labels and chrome readable on a pale ground', async () => {
 const graph = read('graph3d.mjs');
 assert.match(graph, /palette\.isLight\?mixHex\(labelColor,palette\.text/,
  'a pale system colour must be darkened before it is used as type on light');
 // a theme-scoped colour must never leak into the other theme through a comma
 const css = read('ui/readability.css');
 for (const line of css.split(/\r?\n/)) {
  const selector = line.split('{')[0];
  if (!/\[data-theme=/.test(selector) || !selector.includes(',')) continue;
  for (const part of selector.split(',')) {
   assert.match(part, /\[data-theme=/,
    `"${part.trim()}" is not theme-scoped but rides on a theme-scoped selector`);
  }
 }
 assert.doesNotMatch(css, /(^|})\.sidebar-foot b\{color:#edf7ff\}/,
  'the sidebar heading colour must stay inside the dark theme');
});

test('the structural expansion is slower and eased, never bouncy', () => {
 const cfg = read('ui/visual-config.mjs');
 const ms = Number(cfg.match(/transitionMs:(\d+)/)?.[1]);
 assert.ok(ms >= 420 && ms <= 600, `transitionMs=${ms} outside the 420-600ms cinematic window`);
 const graph = read('graph3d.mjs');
 assert.match(graph, /easeInOutCubic/, 'expansion must use an easeInOutCubic-style curve');
 assert.doesNotMatch(graph, /elastic|bounce/i);
});
