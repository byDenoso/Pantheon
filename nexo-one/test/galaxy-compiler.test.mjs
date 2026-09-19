import test from 'node:test';
import assert from 'node:assert/strict';
import { compileGalaxySnapshot, diffGalaxySnapshots } from '../src/viewmodels/galaxyCompiler.ts';
import { GALAXY_CONTRACT, GALAXY_DOMAINS } from '../src/contracts/galaxy.ts';
import { scenarioById } from '../src/data/fixtures/scenarios.ts';
import { layoutGraph3D } from '../src/viewmodels/graph3d.ts';

const baseState = () => scenarioById('all-live').build();

test('compiles the NEXO_ONE_GALAXY_V1 contract from a real SystemState fixture', () => {
  const snapshot = compileGalaxySnapshot(baseState());
  assert.equal(snapshot.contract, GALAXY_CONTRACT);
  assert.deepEqual(snapshot.domains, GALAXY_DOMAINS);
  assert.ok(snapshot.snapshot_id.startsWith('galaxy-'));
  assert.ok(snapshot.generated_at);
  assert.ok(snapshot.tower_revision);
  assert.ok(snapshot.fingerprint);
  assert.ok(snapshot.entities.length > 0);
  assert.equal(snapshot.stats.entities, snapshot.entities.length);
  assert.equal(snapshot.stats.relations, snapshot.relations.length);
  assert.equal(snapshot.stats.subdomains, snapshot.subdomains.length);
  assert.equal(snapshot.stats.needs_you, snapshot.needs_you.length);
  assert.equal(snapshot.presets.length, 5);
});

test('the projection is deterministic: the same SystemState always compiles to the same snapshot', () => {
  const state = baseState();
  const a = compileGalaxySnapshot(state);
  const b = compileGalaxySnapshot(baseState());
  assert.deepEqual(
    a.entities.map(e => ({ id: e.id, layout: e.layout })),
    b.entities.map(e => ({ id: e.id, layout: e.layout })),
  );
  assert.equal(a.snapshot_id, b.snapshot_id);
  assert.equal(a.fingerprint, b.fingerprint);
});

test('layout positions are hash-derived, not random: node order does not change the macro-layout', () => {
  const state = baseState();
  const forward = compileGalaxySnapshot(state);
  const reversedState = { ...state, graph: { nodes: [...state.graph.nodes].reverse(), edges: state.graph.edges } };
  const reversed = compileGalaxySnapshot(reversedState);
  const byId = new Map(reversed.entities.map(e => [e.id, e]));
  for (const entity of forward.entities) {
    assert.deepEqual(entity.layout.position, byId.get(entity.id).layout.position, entity.id);
  }
});

test('every entity keeps its canonical Tower type and only gains a derived visual kind/layer', () => {
  const state = baseState();
  const snapshot = compileGalaxySnapshot(state);
  const canonicalById = new Map(state.graph.nodes.map(n => [n.id, n]));
  for (const entity of snapshot.entities) {
    const canonical = canonicalById.get(entity.id);
    assert.equal(entity.canonical_type, canonical.type);
    assert.equal(entity.domain, canonical.domain);
    assert.equal(entity.status, canonical.state);
    assert.equal(entity.title, canonical.label);
    assert.equal(entity.provenance.source_ref, canonical.source_ref);
    assert.equal(entity.provenance.fingerprint, canonical.fingerprint);
    assert.ok(entity.layout.derived);
  }
});

test('NEXO is CORE, the other domain hubs are DOMAIN, and every other type is ENTITY or PERIPHERY', () => {
  const snapshot = compileGalaxySnapshot(baseState());
  const nexo = snapshot.entities.find(e => e.canonical_type === 'DOMAIN' && e.domain === 'NEXO');
  assert.equal(nexo.layout.layer, 'CORE');
  for (const entity of snapshot.entities.filter(e => e.canonical_type === 'DOMAIN' && e.domain !== 'NEXO')) {
    assert.equal(entity.layout.layer, 'DOMAIN');
  }
  for (const entity of snapshot.entities.filter(e => e.canonical_type === 'SIDE_QUEST' || e.canonical_type === 'FILAMENT')) {
    assert.equal(entity.layout.layer, 'PERIPHERY');
  }
});

test('subdomains group non-domain entities by (domain, canonical type) and are marked derived', () => {
  const state = baseState();
  const snapshot = compileGalaxySnapshot(state);
  const nonDomain = state.graph.nodes.filter(n => n.type !== 'DOMAIN');
  const expectedBuckets = new Set(nonDomain.map(n => `${n.domain}:${n.type}`));
  assert.equal(snapshot.subdomains.length, expectedBuckets.size);
  for (const subdomain of snapshot.subdomains) {
    assert.equal(subdomain.layout.layer, 'SUBDOMAIN');
    assert.equal(subdomain.layout.derived, true);
    const members = snapshot.entities.filter(e => e.subdomain_id === subdomain.id);
    assert.equal(subdomain.entity_count, members.length);
    assert.ok(members.length > 0);
  }
  for (const entity of snapshot.entities.filter(e => e.canonical_type !== 'DOMAIN')) {
    assert.ok(entity.subdomain_id);
  }
});

test('relations include every canonical edge between kept entities plus explicit derived grouping edges', () => {
  const state = baseState();
  const snapshot = compileGalaxySnapshot(state);
  const canonicalIds = new Set(state.graph.nodes.map(n => n.id));
  const keptCanonicalEdges = state.graph.edges.filter(e => canonicalIds.has(e.from) && canonicalIds.has(e.to));
  const canonical = snapshot.relations.filter(r => !r.derived);
  assert.equal(canonical.length, keptCanonicalEdges.length);
  for (const edge of keptCanonicalEdges) {
    assert.ok(canonical.some(r => r.id === edge.id && r.from === edge.from && r.to === edge.to && r.kind === edge.kind));
  }
  const derived = snapshot.relations.filter(r => r.derived);
  assert.ok(derived.length > 0);
  assert.ok(derived.every(r => r.kind === 'OWNS'));
});

test('Needs You is exactly the inbox — never inferred from queued tests, degraded providers or blocked actions', () => {
  const state = baseState();
  const snapshot = compileGalaxySnapshot(state);
  assert.equal(snapshot.needs_you.length, state.inbox.length);
  const ids = new Set(state.inbox.map(item => item.id));
  assert.ok(snapshot.needs_you.every(item => ids.has(item.id)));

  // Fabricate a state with a queued test, a degraded provider and a blocked action,
  // but an EMPTY inbox: none of that may surface as Needs You.
  const noisyState = {
    ...state,
    inbox: [],
    graph: {
      ...state.graph,
      nodes: [...state.graph.nodes, {
        id: 'test.queued.noise', type: 'TEST', label: 'Queued test', domain: 'SCIENCE',
        state: 'SNAPSHOT', authority_class: 'DERIVED', source_ref: 'x', source_revision: '1',
        fingerprint: 'x', freshness: { state: 'LIVE', observed_at: null, ttl_seconds: null },
        checked_at: '', summary: 'queued, not a human gate',
      }],
    },
    providers: state.providers.map(p => ({ ...p, state: 'DEGRADED' })),
    actions: state.actions.map(a => ({ ...a, status: 'BLOCKED' })),
  };
  const noisySnapshot = compileGalaxySnapshot(noisyState);
  assert.equal(noisySnapshot.needs_you.length, 0);
});

test('an empty SystemState compiles to an empty, well-formed snapshot instead of throwing', () => {
  const empty = {
    contract_version: '1', scenario_id: 'empty', scenario_label: 'empty', generated_at: '2026-01-01T00:00:00Z',
    global_state: 'LIVE', bus: { fingerprint: 'FP-EMPTY', generated_at: '2026-01-01T00:00:00Z', state: 'LIVE', envelope_count: 0, sources: [], consumers: [] },
    envelopes: [], findings: [], actions: [], inbox: [], capabilities: [], runs: [], lanes: [],
    graph: { nodes: [], edges: [] }, filaments: [], providers: [],
  };
  const snapshot = compileGalaxySnapshot(empty);
  assert.equal(snapshot.contract, GALAXY_CONTRACT);
  assert.deepEqual(snapshot.entities, []);
  assert.deepEqual(snapshot.subdomains, []);
  assert.deepEqual(snapshot.relations, []);
  assert.deepEqual(snapshot.needs_you, []);
  assert.deepEqual(snapshot.changes, []);
  assert.equal(snapshot.stats.entities, 0);
});

test('malformed/partial graph input does not throw: missing nodes/edges/inbox degrade to empty, not a crash', () => {
  const state = baseState();
  const partial = { ...state, graph: undefined, inbox: undefined };
  assert.doesNotThrow(() => compileGalaxySnapshot(partial));
  const snapshot = compileGalaxySnapshot(partial);
  assert.deepEqual(snapshot.entities, []);
  assert.deepEqual(snapshot.needs_you, []);
});

test('diffGalaxySnapshots returns no changes when there is no previous snapshot', () => {
  const snapshot = compileGalaxySnapshot(baseState());
  assert.deepEqual(diffGalaxySnapshots(null, snapshot), []);
});

test('diffGalaxySnapshots derives ADDED/REMOVED/STATUS_CHANGED only from real differences between two snapshots', () => {
  const state = baseState();
  const previous = compileGalaxySnapshot(state);

  const mutated = {
    ...state,
    graph: {
      nodes: state.graph.nodes
        .filter(n => n.id !== state.graph.nodes.at(-1).id)
        .map((n, i) => i === 0 ? { ...n, state: n.state === 'LIVE' ? 'STALE' : 'LIVE' } : n)
        .concat([{
          id: 'test.new.entity', type: 'TEST', label: 'New test', domain: 'ENGINEERING',
          state: 'LIVE', authority_class: 'DERIVED', source_ref: 'x', source_revision: '1',
          fingerprint: 'x', freshness: { state: 'LIVE', observed_at: null, ttl_seconds: null },
          checked_at: '', summary: 'freshly added',
        }]),
      edges: state.graph.edges,
    },
  };
  const current = compileGalaxySnapshot(mutated, { previous });

  assert.ok(current.changes.some(c => c.change_type === 'ADDED' && c.entity_id === 'test.new.entity'));
  assert.ok(current.changes.some(c => c.change_type === 'REMOVED'));
  assert.ok(current.changes.some(c => c.change_type === 'STATUS_CHANGED'));
  for (const change of current.changes) {
    assert.ok(['ADDED', 'REMOVED', 'STATUS_CHANGED', 'RELATION_CHANGED'].includes(change.change_type));
    assert.equal(change.timestamp, current.generated_at);
  }
});

test('galaxy entity positions match layoutGraph3D exactly — the compiler reuses it instead of re-deriving layout', () => {
  const state = baseState();
  const placed = new Map(layoutGraph3D(state.graph.nodes).map(n => [n.id, n]));
  const snapshot = compileGalaxySnapshot(state);
  for (const entity of snapshot.entities) {
    const expected = placed.get(entity.id);
    assert.deepEqual(entity.layout.position, { x: expected.x, y: expected.y, z: expected.z });
  }
});
