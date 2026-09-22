import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scenarioById, DEFAULT_SCENARIO_ID } from '../src/data/fixtures/scenarios.ts';
import {
  ATLAS_METRO_ROOTS,
  atlasPathTo,
  buildAtlasMetroModel,
  visibleAtlasIds,
} from '../src/atlas3d/atlasAdapter.ts';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');
const state = () => scenarioById(DEFAULT_SCENARIO_ID).build();

test('production Metro adapter materializes Nexo, Science and Olympus simultaneously', () => {
  const model = buildAtlasMetroModel(state());
  assert.deepEqual(model.roots, ATLAS_METRO_ROOTS);
  assert.equal(model.roots.length, 3);
  for (const rootId of model.roots) {
    const hub = model.nodeMap.get(rootId);
    assert.ok(hub, `missing hub ${rootId}`);
    assert.equal(hub.entityType, 'hub');
    assert.ok(hub.childCount > 0, `${hub.name} has no initial stations`);
  }

  const expanded = new Set(model.roots);
  const visible = visibleAtlasIds(model, expanded);
  assert.ok(visible.length > 3, 'initial view must contain stations in addition to the three hubs');
  assert.ok(model.roots.every(id => visible.includes(id)));
  assert.ok(visible.some(id => model.nodeMap.get(id)?.depth === 1), 'initial view must expose named subdomains');
});

test('an empty public domain still gets an honest operational station from its lane', () => {
  const source = state();
  source.graph.nodes = source.graph.nodes.filter(node => node.domain !== 'OLYMPUS' || node.type === 'DOMAIN');
  source.graph.edges = source.graph.edges.filter(edge =>
    source.graph.nodes.some(node => node.id === edge.from) &&
    source.graph.nodes.some(node => node.id === edge.to)
  );
  source.lanes = source.lanes.map(lane => lane.domain === 'OLYMPUS'
    ? { ...lane, current_state: '0 WORK · 0 TEST in sanctioned projection', next_action: 'Await next canonical projection.' }
    : lane
  );

  const model = buildAtlasMetroModel(source);
  const olympus = model.nodeMap.get('atlas.domain.olympus');
  assert.ok(olympus);
  assert.equal(olympus.childCount, 1);
  const child = model.nodeMap.get(model.childrenMap.get(olympus.id)[0]);
  assert.equal(child.name, 'Estado operacional');
  assert.match(child.summary, /0 WORK/);
  assert.equal(child.synthetic, true);
});

test('entities stay below subdomain stations and preserve production provenance', () => {
  const model = buildAtlasMetroModel(state());
  const canonical = model.nodes.find(node => !node.synthetic);
  assert.ok(canonical);
  assert.equal(canonical.depth, 2);
  assert.ok(canonical.parentId?.startsWith('atlas.subdomain.'));
  assert.ok(canonical.sourceId);
  assert.ok(canonical.fingerprint);
  const path = atlasPathTo(model, canonical.id);
  assert.equal(path.length, 3);
  assert.equal(path[0].entityType, 'hub');
  assert.equal(path[1].entityType, 'subdomain');
});

test('canonical graph relations become Metro bridge data instead of a second force layout', () => {
  const source = state();
  const model = buildAtlasMetroModel(source);
  assert.ok(model.crossLinks.length > 0);
  assert.ok(model.crossLinks.some(link => !link.aggregated));
  assert.ok(model.crossLinks.every(link => model.nodeMap.has(link.source) && model.nodeMap.has(link.target)));
});

test('dedicated Atlas production page uses Metro renderer, G6 and deterministic Three mode', async () => {
  const [app, renderer, index] = await Promise.all([
    text('src/atlas3d/Atlas3DApp.tsx'),
    text('src/atlas3d/MetroAtlasRenderer.tsx'),
    text('atlas3d/index.html'),
  ]);

  assert.match(app, /data-atlas-renderer="metro-cluster"/);
  assert.match(app, /new Set\(model\.roots\)/);
  assert.match(app, /navigationRevision !== model\.revision/);
  assert.match(app, /activeExpanded = navigationStale \? new Set\(model\.roots\) : expanded/);
  assert.match(app, /URLSearchParams/);
  assert.match(app, /mode.*=== '3d'/);
  assert.match(app, /3D Explorar/);
  assert.match(app, /2D Metro/);
  assert.doesNotMatch(app, /kind: 'ROOT'/);
  assert.doesNotMatch(app, /GalaxyThree3D/);

  assert.match(renderer, /window\.G6\?\.Graph/);
  assert.match(renderer, /metroLayoutPositions/);
  assert.match(renderer, /g6NodeCount/);
  assert.match(renderer, /querySelector\('canvas'\)/);
  assert.match(renderer, /OrbitControls/);
  assert.match(renderer, /threeNodeCount/);
  assert.match(renderer, /threeReady/);
  assert.match(renderer, /domainBaseZ|NEXO: -155/);
  assert.doesNotMatch(renderer, /forceSimulation|forceManyBody|forceLink/);

  assert.match(index, /@antv\/g6@5\/dist\/g6\.min\.js/);
});
