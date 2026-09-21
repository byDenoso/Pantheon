import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LAYER_BY_NODE_TYPE,
  LAYERED_LAYERS,
  layoutLayeredGraph,
  neighborhoodOf,
  resolveLayerSelection,
} from '../src/viewmodels/layeredGraph.ts';

const fresh = { state: 'LIVE', observed_at: '2026-09-21T18:42:45Z', ttl_seconds: 3600 };
const node = (id, type, domain) => ({
  id, type, domain, label: id, state: 'LIVE', authority_class: 'DERIVED',
  source_ref: 'tower:' + id, source_revision: 'SNP-20260921-184245Z-De718ee275993',
  fingerprint: id, freshness: fresh, checked_at: '2026-09-21T18:42:45Z', summary: id,
});

const nodes = [
  node('science', 'DOMAIN', 'SCIENCE'),
  node('campaign', 'CAMPAIGN', 'SCIENCE'),
  node('cap', 'CAPABILITY', 'SCIENCE'),
  node('test', 'TEST', 'SCIENCE'),
  node('result', 'EFFECT', 'SCIENCE'),
  node('eng', 'DOMAIN', 'ENGINEERING'),
  node('eng-cap', 'CAPABILITY', 'ENGINEERING'),
];
const edges = [
  { id: 'e1', from: 'science', to: 'campaign', kind: 'OWNS', weight: 1, explanation: 'owns' },
  { id: 'e2', from: 'campaign', to: 'cap', kind: 'DEPENDS_ON', weight: .8, explanation: 'depends' },
  { id: 'e3', from: 'cap', to: 'test', kind: 'VERIFIES', weight: .8, explanation: 'verify' },
  { id: 'e4', from: 'test', to: 'result', kind: 'PRODUCES', weight: .9, explanation: 'produces' },
];

test('layer taxonomy maps canonical node types without changing them', () => {
  assert.equal(LAYER_BY_NODE_TYPE.DOMAIN, 'DOMAIN');
  assert.equal(LAYER_BY_NODE_TYPE.CAMPAIGN, 'ENTITY');
  assert.equal(LAYER_BY_NODE_TYPE.CAPABILITY, 'CAPABILITY');
  assert.equal(LAYER_BY_NODE_TYPE.TEST, 'WORK');
  assert.equal(LAYER_BY_NODE_TYPE.EFFECT, 'INSIGHT');
  assert.equal(LAYERED_LAYERS.length, 5);
});

test('layered layout is deterministic and preserves all canonical nodes and edges', () => {
  const a = layoutLayeredGraph({ nodes, edges });
  const b = layoutLayeredGraph({ nodes: [...nodes].reverse(), edges: [...edges].reverse() });
  assert.equal(a.nodes.length, nodes.length);
  assert.equal(a.edges.length, edges.length);
  assert.deepEqual(
    a.nodes.map(({ id, x, y, z, layer }) => ({ id, x, y, z, layer })).sort((x, y) => x.id.localeCompare(y.id)),
    b.nodes.map(({ id, x, y, z, layer }) => ({ id, x, y, z, layer })).sort((x, y) => x.id.localeCompare(y.id)),
  );
  assert.ok(a.edges.every(edge => edge.crossLayer));
});

test('selection and one-hop focus are stable under filtering', () => {
  const graph = layoutLayeredGraph({ nodes, edges });
  assert.equal(resolveLayerSelection(graph.nodes, 'test'), 'test');
  assert.equal(resolveLayerSelection(graph.nodes, 'missing'), null);
  const neighbors = neighborhoodOf(graph, 'test');
  assert.deepEqual([...neighbors].sort(), ['cap', 'result', 'test']);
});
