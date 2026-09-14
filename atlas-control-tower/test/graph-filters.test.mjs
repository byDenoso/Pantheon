// Real behavior tests for the map's domain/status/authority filters: each must
// genuinely change the visible projection (nodes/edges), never a decorative no-op.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMapFilters, distinctFieldValues, distinctAuthorityValues } from '../src/graph-engine/graph-filters.ts';

function node(id, extra = {}) {
  return { id, label: id, type: 'CAMPAIGN', ...extra };
}

function projection(nodes, edges = [], focusId = 'domain:D1') {
  return {
    id: 'p1', version: '1', level: 'domain', focusId, nodes, edges,
    breadcrumbs: [], capabilities: { drillDown: true, learning: false, provenance: true, search: true }
  };
}

test('applyMapFilters is a no-op when no filter is set', () => {
  const p = projection([node('a'), node('b')]);
  assert.deepEqual(applyMapFilters(p, {}, new Map()), p);
});

test('domain filter narrows nodes to the matching domain, always keeping the focus node', () => {
  const p = projection([
    node('domain:D1', { type: 'DOMAIN' }),
    node('campaign:1', { domain: 'D1' }),
    node('campaign:2', { domain: 'D2' })
  ], [
    { id: 'e1', source: 'domain:D1', target: 'campaign:1', type: 'CONTAINS', declared: true },
    { id: 'e2', source: 'domain:D1', target: 'campaign:2', type: 'CONTAINS', declared: true }
  ], 'domain:D1');
  const filtered = applyMapFilters(p, { domain: 'D1' }, new Map());
  assert.deepEqual(filtered.nodes.map(n => n.id).sort(), ['campaign:1', 'domain:D1']);
  assert.deepEqual(filtered.edges.map(e => e.id), ['e1']);
});

test('status filter narrows nodes by real GraphNode.status, case-insensitively', () => {
  const p = projection([
    node('domain:D1', { type: 'DOMAIN' }),
    node('campaign:1', { status: 'checkpointed' }),
    node('campaign:2', { status: 'DRAFT' })
  ], [], 'domain:D1');
  const filtered = applyMapFilters(p, { status: 'CHECKPOINTED' }, new Map());
  assert.deepEqual(filtered.nodes.map(n => n.id).sort(), ['campaign:1', 'domain:D1']);
});

test('authority filter uses the raw-node lookup, not a field on GraphNode itself', () => {
  const p = projection([
    node('domain:D1', { type: 'DOMAIN' }),
    node('campaign:1'),
    node('campaign:2')
  ], [], 'domain:D1');
  const authorityById = new Map([['campaign:1', 'GITHUB'], ['campaign:2', 'DERIVED_NOT_EVIDENCE']]);
  const filtered = applyMapFilters(p, { authority: 'GITHUB' }, authorityById);
  assert.deepEqual(filtered.nodes.map(n => n.id).sort(), ['campaign:1', 'domain:D1']);
});

test('combining domain and status filters applies both as AND, not OR', () => {
  const p = projection([
    node('domain:D1', { type: 'DOMAIN' }),
    node('campaign:1', { domain: 'D1', status: 'CHECKPOINTED' }),
    node('campaign:2', { domain: 'D1', status: 'DRAFT' }),
    node('campaign:3', { domain: 'D2', status: 'CHECKPOINTED' })
  ], [], 'domain:D1');
  const filtered = applyMapFilters(p, { domain: 'D1', status: 'CHECKPOINTED' }, new Map());
  assert.deepEqual(filtered.nodes.map(n => n.id).sort(), ['campaign:1', 'domain:D1']);
});

test('a filter that matches nothing besides the focus node produces an honestly-empty result, not a crash', () => {
  const p = projection([node('domain:D1', { type: 'DOMAIN' }), node('campaign:1', { domain: 'D1' })], [], 'domain:D1');
  const filtered = applyMapFilters(p, { domain: 'D9-NOT-PRESENT' }, new Map());
  assert.deepEqual(filtered.nodes.map(n => n.id), ['domain:D1']);
});

test('an ancestor or portal node stays visible under any filter (navigation continuity)', () => {
  const p = projection([
    node('domain:D1', { type: 'DOMAIN', contextRole: 'ancestor' }),
    node('campaign:1', { domain: 'D2' })
  ], [], 'campaign:1');
  const filtered = applyMapFilters(p, { domain: 'D2' }, new Map());
  assert.ok(filtered.nodes.some(n => n.id === 'domain:D1'), 'ancestor must survive the filter');
});

test('distinctFieldValues reflects only real values present in the current projection, sorted and deduped', () => {
  const nodes = [node('a', { domain: 'D2' }), node('b', { domain: 'D1' }), node('c', { domain: 'D1' }), node('d', {})];
  assert.deepEqual(distinctFieldValues(nodes, 'domain'), ['D1', 'D2']);
});

test('distinctAuthorityValues never fabricates a value absent from the lookup', () => {
  const authorityById = new Map([['a', 'GITHUB'], ['b', undefined], ['c', 'GITHUB']]);
  assert.deepEqual(distinctAuthorityValues(authorityById), ['GITHUB']);
});
