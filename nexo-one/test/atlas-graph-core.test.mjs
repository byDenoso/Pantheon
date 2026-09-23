import assert from 'node:assert/strict';
import test from 'node:test';
import { scenarioById, DEFAULT_SCENARIO_ID } from '../src/data/fixtures/scenarios.ts';
import {
  ATLAS_GRAPH_LAYERS,
  atlasGraphLayersForNode,
  atlasHopDistances,
  buildAtlasMetroModel,
  visibleAtlasIds,
} from '../src/atlas3d/atlasAdapter.ts';

const makeState = () => scenarioById(DEFAULT_SCENARIO_ID).build();

function coreFixture() {
  const state = makeState();
  const template = state.graph.nodes.find(node => node.type !== 'DOMAIN' && node.type !== 'FILAMENT');
  assert.ok(template);
  state.graph.nodes.push(
    { ...template, id: 'test:atlas-core-a', type: 'TEST', domain: 'SCIENCE', label: 'Core test A', parent_subdomain: 'Core A' },
    { ...template, id: 'capability:atlas-core-b', type: 'CAPABILITY', domain: 'OLYMPUS', label: 'Core capability B', parent_subdomain: 'Core B' },
    { ...template, id: 'claim:atlas-core-c', type: 'CLAIM', domain: 'NEXO', label: 'Core claim C', parent_subdomain: 'Core C' },
  );
  state.graph.edges.push(
    { id: 'atlas-core-edge-a-b', from: 'test:atlas-core-a', to: 'capability:atlas-core-b', kind: 'DEPENDS_ON', weight: 0.8, explanation: 'cross-domain dependency', is_learning: true, learning_scope: 'INTER_DOMAIN' },
    { id: 'atlas-core-edge-b-c', from: 'capability:atlas-core-b', to: 'claim:atlas-core-c', kind: 'SUPPORTS', weight: 0.9, explanation: 'cross-domain support', is_learning: true, learning_scope: 'INTER_DOMAIN' },
  );
  return state;
}

test('ATLAS graph core indexes directed relations and derives undirected one/two-hop context', () => {
  const model = buildAtlasMetroModel(coreFixture());
  const a = 'test:atlas-core-a';
  const b = 'capability:atlas-core-b';
  const c = 'claim:atlas-core-c';

  assert.deepEqual(model.outgoing.get(a).map(link => link.id), ['entity:atlas-core-edge-a-b']);
  assert.deepEqual(model.incoming.get(b).map(link => link.id), ['entity:atlas-core-edge-a-b']);
  assert.deepEqual(model.outgoing.get(b).map(link => link.id), ['entity:atlas-core-edge-b-c']);
  assert.ok(model.adjacency.get(a).has(b));
  assert.ok(model.adjacency.get(b).has(a));

  const visible = new Set(model.nodes.map(node => node.id));
  const hops = atlasHopDistances(model, a, visible);
  assert.equal(hops.get(a), 0);
  assert.equal(hops.get(b), 1);
  assert.equal(hops.get(c), 2);
  const parentA = model.nodeMap.get(a).parentId;
  const parentB = model.nodeMap.get(b).parentId;
  const parentC = model.nodeMap.get(c).parentId;
  const collapsedVisible = new Set([...model.roots, parentA, parentB, parentC]);
  const collapsedHops = atlasHopDistances(model, parentA, collapsedVisible);
  assert.equal(collapsedHops.get(parentB), 1);
  assert.equal(collapsedHops.get(parentC), 2);
  assert.equal(model.crossLinks.find(link => link.id === 'entity:atlas-core-edge-a-b').kind, 'DEPENDS_ON');
  assert.equal(model.crossLinks.find(link => link.id === 'entity:atlas-core-edge-b-c').kind, 'SUPPORTS');
});

test('Knowledge, Execution and Capability are view layers over the same canonical node identities', () => {
  const model = buildAtlasMetroModel(coreFixture());
  const allIds = new Set(model.nodes.map(node => node.id));
  const allExpanded = new Set(model.nodes.map(node => node.id));
  const allLayerIds = visibleAtlasIds(model, allExpanded);
  const everyLayer = visibleAtlasIds(model, allExpanded, new Set(ATLAS_GRAPH_LAYERS));
  const capabilityOnly = new Set(visibleAtlasIds(model, allExpanded, new Set(['capability'])));
  const testNode = model.nodeMap.get('test:atlas-core-a');
  const capabilityNode = model.nodeMap.get('capability:atlas-core-b');
  const root = model.nodeMap.get('atlas.domain.science');

  assert.deepEqual(allLayerIds, everyLayer);
  assert.deepEqual(atlasGraphLayersForNode(testNode), ['knowledge', 'execution']);
  assert.deepEqual(atlasGraphLayersForNode(capabilityNode), ['capability']);
  assert.deepEqual(atlasGraphLayersForNode(root), []);
  assert.ok(capabilityOnly.has('capability:atlas-core-b'));
  assert.ok(capabilityOnly.has('atlas.domain.olympus'), 'domain hubs stay as visual context');
  assert.ok(!capabilityOnly.has('test:atlas-core-a'));
  assert.ok(!capabilityOnly.has('claim:atlas-core-c'));

  assert.deepEqual(new Set(model.nodes.map(node => node.id)), allIds);
  assert.ok(model.crossLinks.some(link => link.id === 'entity:atlas-core-edge-a-b'));
  assert.ok(model.crossLinks.some(link => link.id === 'entity:atlas-core-edge-b-c'));
});

test('empty layer selection keeps only top-level context and does not rewrite graph state', () => {
  const model = buildAtlasMetroModel(coreFixture());
  const visible = visibleAtlasIds(model, new Set(model.nodes.map(node => node.id)), new Set());
  assert.deepEqual(visible, model.roots);
  assert.equal(model.revision, scenarioById(DEFAULT_SCENARIO_ID).build().bus.fingerprint);
});
