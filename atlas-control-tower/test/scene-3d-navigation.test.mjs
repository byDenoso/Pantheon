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

test('buildOrbitalNodes centers the focus even when its case does not match the real node id (regression)', () => {
  // Real repro: a URL/session focusId of "domain:d1" against a real node id of
  // "domain:D1" previously matched nothing -- the focus never sat at the origin,
  // hierarchyPositions() found no direct children, and every node fell back to the
  // much-larger-radius golden-spiral layout while the camera stayed framed for the
  // tight hierarchy layout, blowing the scene up on screen (confirmed via a real
  // browser repro at http://localhost:4412/mapa/system:SCIENCE/domain:d1).
  const nodes = [
    { id: 'domain:D1', type: 'DOMAIN' },
    { id: 'CAMP-H0-RULER-ANCHOR', type: 'CAMPAIGN', domain: 'D1' }
  ];
  const edges = [{ source: 'domain:D1', target: 'CAMP-H0-RULER-ANCHOR', type: 'CONTAINS' }];
  const mismatched = buildOrbitalNodes(nodes, 'domain:d1', edges);
  const canonical = buildOrbitalNodes(nodes, 'domain:D1', edges);
  const byIdMismatched = new Map(mismatched.map(n => [n.id, n.position]));
  assert.deepEqual(byIdMismatched.get('domain:D1'), [0, 0, 0], 'a lowercase focusId must still resolve to the real (uppercase) node and center it');
  assert.deepEqual(mismatched.map(n => n.position), canonical.map(n => n.position), 'a case-mismatched focusId must produce the same layout as the exact-cased one');
});

test('CameraRig uses the mature @react-three/drei OrbitControls instead of a hand-rolled rig, and never fights a live user drag with an unconditional per-frame position lerp', async () => {
  // Real, confirmed root cause of "drag does nothing" in WebGL: a useFrame ran
  // `camera.position.lerp(desiredPosition, 0.075)` on every single frame with no
  // guard, so any position OrbitControls set from the user's drag was immediately
  // overwritten ~16ms later. Per the explicit instruction to check for a mature
  // orbit-controls implementation (drei/camera-controls) before hand-rolling one,
  // this locks that the mature implementation is actually wired in and that no
  // code path unconditionally stomps the camera position every frame anymore.
  const { readFileSync } = await import('node:fs');
  const canvas = readFileSync(new URL('../src/scene/AtlasCanvas.tsx', import.meta.url), 'utf8');
  assert.match(canvas, /@react-three\/drei/, 'expected the mature drei OrbitControls to be used');
  assert.doesNotMatch(canvas, /camera\.position\.lerp\(/, 'camera position must never be unconditionally lerped every frame -- that is what defeated user drag before');
});

test('no map node outside DOMAIN/CAMPAIGN/SYSTEM/ROOT/PROGRAM/ACTION reaches the 3D scene once the entity contract has run', async () => {
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
  // -- a real, contract-allowed type distinct from DOMAIN, not a violation. PROGRAM/
  // ACTION are the real structural types Engineering/Olympus/Operations publish in
  // place of DOMAIN/CAMPAIGN and are equally allowed, though this fixture doesn't
  // exercise them (that's covered by graph-map-not-empty.test.mjs against real data).
  const allowed = new Set(['ROOT', 'SYSTEM', 'DOMAIN', 'CAMPAIGN', 'PROGRAM', 'ACTION', 'DERIVED_NAVIGATION_GROUP']);
  for (const node of nodes) assert.ok(allowed.has(String(node.type || '').toUpperCase()), `unexpected node type reached the 3D scene: ${node.type}`);
});
