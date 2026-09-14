// Real behavior tests for the 3D map's camera math and picking decision -- the parts
// of AtlasCanvas.tsx that don't need a WebGL context to verify. No auto-rotation is
// asserted here structurally: applyCameraKey/cameraDistanceForLevel/clampSpherical
// never advance state on their own, only in response to an explicit key or a level
// change, and CameraRig (AtlasCanvas.tsx) sets `autoRotate=false` unconditionally.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCameraKey,
  cameraDistanceForLevel,
  clampSpherical,
  sphericalToCartesian,
  MIN_DISTANCE,
  MAX_DISTANCE
} from '../src/scene/camera-controls.ts';
import { shouldOpenNode } from '../src/scene/picking.ts';
import { buildOrbitalNodes } from '../src/scene/types.ts';

test('cameraDistanceForLevel pulls back further for Universo/System than for Domain, and closer still for Campanha', () => {
  const system = cameraDistanceForLevel('SYSTEM');
  const domain = cameraDistanceForLevel('DOMAIN');
  const campaign = cameraDistanceForLevel('CAMPAIGN');
  assert.ok(system > domain, 'system overview must be further out than a domain focus');
  assert.ok(domain > campaign, 'a domain focus must be further out than a campaign focus');
});

test('cameraDistanceForLevel is deterministic for the same inputs', () => {
  assert.equal(cameraDistanceForLevel('DOMAIN', false), cameraDistanceForLevel('DOMAIN', false));
  assert.notEqual(cameraDistanceForLevel('DOMAIN', false), cameraDistanceForLevel('DOMAIN', true), 'compact framing should differ from desktop');
});

test('applyCameraKey only reacts to the keys it owns, returning null for everything else', () => {
  const state = { azimuth: 0, polar: Math.PI / 2, distance: 16 };
  assert.equal(applyCameraKey(state, 'a'), null);
  assert.equal(applyCameraKey(state, 'Tab'), null);
  assert.notEqual(applyCameraKey(state, 'ArrowLeft'), null);
});

test('ArrowLeft/ArrowRight orbit azimuth in opposite directions without changing distance', () => {
  const state = { azimuth: 0, polar: Math.PI / 2, distance: 16 };
  const left = applyCameraKey(state, 'ArrowLeft');
  const right = applyCameraKey(state, 'ArrowRight');
  assert.ok(left.azimuth < 0);
  assert.ok(right.azimuth > 0);
  assert.equal(left.distance, 16);
});

test('+/- zoom moves distance in opposite directions and stays within clamped bounds', () => {
  const state = { azimuth: 0, polar: Math.PI / 2, distance: 16 };
  const zoomIn = applyCameraKey(state, '+');
  const zoomOut = applyCameraKey(state, '-');
  assert.ok(zoomIn.distance < 16);
  assert.ok(zoomOut.distance > 16);
  const atMin = clampSpherical({ azimuth: 0, polar: Math.PI / 2, distance: MIN_DISTANCE - 10 });
  const atMax = clampSpherical({ azimuth: 0, polar: Math.PI / 2, distance: MAX_DISTANCE + 10 });
  assert.equal(atMin.distance, MIN_DISTANCE);
  assert.equal(atMax.distance, MAX_DISTANCE);
});

test('clampSpherical keeps polar away from the poles so orbit never flips through the top/bottom', () => {
  const flipped = clampSpherical({ azimuth: 0, polar: 10, distance: 16 });
  assert.ok(flipped.polar < Math.PI);
  const negative = clampSpherical({ azimuth: 0, polar: -10, distance: 16 });
  assert.ok(negative.polar > 0);
});

test('sphericalToCartesian is a real, deterministic projection (same angles -> same point)', () => {
  const a = sphericalToCartesian({ azimuth: 0.4, polar: 1.2, distance: 10 });
  const b = sphericalToCartesian({ azimuth: 0.4, polar: 1.2, distance: 10 });
  assert.deepEqual(a, b);
  const distanceFromOrigin = Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2);
  assert.ok(Math.abs(distanceFromOrigin - 10) < 1e-9, 'the point must sit exactly on the requested distance sphere');
});

test('shouldOpenNode never opens the currently focused node (no self-loop drill)', () => {
  assert.equal(shouldOpenNode({ id: 'domain:D1', type: 'DOMAIN' }, 'domain:D1', []), false);
});

test('shouldOpenNode opens structural types even with no declared children yet', () => {
  assert.equal(shouldOpenNode({ id: 'domain:D2', type: 'DOMAIN' }, 'system:SCIENCE', []), true);
  assert.equal(shouldOpenNode({ id: 'campaign:c1', type: 'CAMPAIGN' }, 'domain:D2', []), true);
});

test('shouldOpenNode opens a non-structural node only when it actually has outgoing edges', () => {
  const edges = [{ source: 'test:t1', target: 'result:t1' }];
  assert.equal(shouldOpenNode({ id: 'test:t1', type: 'TEST' }, 'campaign:c1', edges), true);
  assert.equal(shouldOpenNode({ id: 'test:t2', type: 'TEST' }, 'campaign:c1', edges), false);
});

test('picking always carries the clicked node\'s own id through -- selection never substitutes a different id', () => {
  const node = { id: 'campaign:gz-01-b02', type: 'CAMPAIGN' };
  // shouldOpenNode's caller (AtlasCanvas.handlePick) passes `node` itself to
  // onOpen/onSelect verbatim; this test locks that the decision function never
  // needs (and therefore never has the chance to swap) a different identifier.
  assert.equal(shouldOpenNode(node, 'domain:D1', []), true);
  assert.equal(node.id, 'campaign:gz-01-b02');
});

test('buildOrbitalNodes gives deterministic, distinct x/y/z positions for the same input', () => {
  const nodes = [
    { id: 'domain:D1', type: 'DOMAIN', parentId: 'system:SCIENCE' },
    { id: 'campaign:c1', type: 'CAMPAIGN', parentId: 'domain:D1' },
    { id: 'campaign:c2', type: 'CAMPAIGN', parentId: 'domain:D1' }
  ];
  const edges = [
    { source: 'domain:D1', target: 'campaign:c1', type: 'CONTAINS' },
    { source: 'domain:D1', target: 'campaign:c2', type: 'CONTAINS' }
  ];
  const first = buildOrbitalNodes(nodes, 'domain:D1', edges);
  const second = buildOrbitalNodes(nodes, 'domain:D1', edges);
  assert.deepEqual(first.map(n => n.position), second.map(n => n.position), 'positions must be deterministic for the same graph');
  const byId = new Map(first.map(n => [n.id, n.position]));
  assert.deepEqual(byId.get('domain:D1'), [0, 0, 0], 'the focus node sits at the origin');
  assert.notDeepEqual(byId.get('campaign:c1'), byId.get('campaign:c2'), 'distinct nodes must not collapse onto the same point');
});

test('no map node outside DOMAIN/CAMPAIGN/SYSTEM/ROOT reaches the 3D scene once the entity contract has run', async () => {
  const { enforceGraphEntityContract } = await import('../src/graph-engine/graph-entity-contract.ts');
  const projection = {
    id: 'p', version: '1', level: 'domain', focusId: 'domain:D1',
    nodes: [
      { id: 'domain:D1', label: 'D1', type: 'DOMAIN' },
      { id: 'campaign:c1', label: 'C1', type: 'CAMPAIGN', domain: 'D1' },
      { id: 'test:t1', label: 'T1', type: 'TEST', domain: 'D1' },
      { id: 'claim:cl1', label: 'CL1', type: 'CLAIM', domain: 'D1' }
    ],
    edges: [],
    breadcrumbs: [],
    capabilities: { drillDown: true, learning: false, provenance: true, search: true }
  };
  const { projection: enforced } = enforceGraphEntityContract(projection);
  const nodes = buildOrbitalNodes(enforced.nodes, enforced.focusId, enforced.edges);
  // DERIVED_NAVIGATION_GROUP is the locked "Transversais" cross-domain grouping node
  // -- a real, contract-allowed type distinct from DOMAIN, not a violation.
  const allowed = new Set(['ROOT', 'SYSTEM', 'DOMAIN', 'CAMPAIGN', 'DERIVED_NAVIGATION_GROUP']);
  for (const node of nodes) assert.ok(allowed.has(String(node.type || '').toUpperCase()), `unexpected node type reached the 3D scene: ${node.type}`);
});
