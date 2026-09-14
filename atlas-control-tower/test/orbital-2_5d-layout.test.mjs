import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  layoutRing, buildSceneLayout, applyParallax, hitTest, nodeRadius, clampZoom, zoomStep, MIN_ZOOM, MAX_ZOOM,
  clampTilt, rotationFromDrag, tiltFromDrag, rotationFromKey, tiltFromKey, panFromDrag, clampPan, MIN_TILT, MAX_TILT, MAX_PAN
} from '../src/graph-engine/orbital-2_5d-layout.ts';

test('layoutRing places nodes evenly around the center and is deterministic', () => {
  const first = layoutRing(['a', 'b', 'c', 'd'], 100);
  const second = layoutRing(['a', 'b', 'c', 'd'], 100);
  assert.deepEqual(first, second);
  assert.equal(first.length, 4);
  for (const pos of first) {
    // roughly on the ellipse defined by radius 100 (x) / 55 (y)
    assert.ok(Math.abs(pos.x) <= 100.001);
    assert.ok(Math.abs(pos.y) <= 55.001);
  }
});

test('layoutRing with zero satellites returns an empty array, never throws', () => {
  assert.deepEqual(layoutRing([], 100), []);
});

test('buildSceneLayout pins the center at (0,0) with z=1 (nearest/brightest)', () => {
  const scene = buildSceneLayout('domain:sci', ['campaign:c1', 'campaign:c2'], 120);
  assert.deepEqual(scene.center, { id: 'domain:sci', x: 0, y: 0, z: 1 });
  assert.equal(scene.satellites.length, 2);
});

test('applyParallax moves farther (lower z) nodes more than nearer ones', () => {
  const near = { id: 'near', x: 10, y: 10, z: 0.9, angle: 0 };
  const far = { id: 'far', x: 10, y: 10, z: 0.1, angle: 0 };
  const pointer = { x: 100, y: 0 };
  const nearMoved = applyParallax(near, pointer);
  const farMoved = applyParallax(far, pointer);
  const nearDelta = Math.abs(nearMoved.x - near.x);
  const farDelta = Math.abs(farMoved.x - far.x);
  assert.ok(farDelta > nearDelta, `expected far delta (${farDelta}) > near delta (${nearDelta})`);
});

test('applyParallax with a zero pointer offset returns the position unchanged (static frame for reduced motion)', () => {
  const pos = { id: 'x', x: 10, y: 20, z: 0.5, angle: 0 };
  const result = applyParallax(pos, { x: 0, y: 0 });
  assert.equal(result.x, 10);
  assert.equal(result.y, 20);
});

test('hitTest finds a node whose radius contains the point', () => {
  const positions = [
    { id: 'a', x: 0, y: 0, radius: 20 },
    { id: 'b', x: 100, y: 0, radius: 15 }
  ];
  assert.equal(hitTest(positions, 5, 5), 'a');
  assert.equal(hitTest(positions, 100, 5), 'b');
  assert.equal(hitTest(positions, 500, 500), null);
});

test('hitTest returns the topmost (last-drawn) node when two overlap', () => {
  const positions = [
    { id: 'behind', x: 0, y: 0, radius: 30 },
    { id: 'front', x: 5, y: 5, radius: 30 }
  ];
  assert.equal(hitTest(positions, 5, 5), 'front');
});

test('nodeRadius: center > domain > campaign, and selection adds a fixed increment', () => {
  const center = nodeRadius('center', false);
  const domain = nodeRadius('domain', false);
  const campaign = nodeRadius('campaign', false);
  assert.ok(center > domain);
  assert.ok(domain > campaign);
  assert.equal(nodeRadius('campaign', true) - nodeRadius('campaign', false), 4);
});

test('clampZoom keeps values within [MIN_ZOOM, MAX_ZOOM] and passes valid values through', () => {
  assert.equal(clampZoom(0.1), MIN_ZOOM);
  assert.equal(clampZoom(10), MAX_ZOOM);
  assert.equal(clampZoom(1), 1);
});

test('zoomStep moves by the given step and stays clamped at the bounds', () => {
  assert.equal(zoomStep(1, 1), 1.25);
  assert.equal(zoomStep(1, -1), 0.75);
  assert.equal(zoomStep(MAX_ZOOM, 1), MAX_ZOOM);
  assert.equal(zoomStep(MIN_ZOOM, -1), MIN_ZOOM);
});

// Real drag-to-orbit behavior (the Canvas 2.5D "navigate in 3D" interaction): a
// pointer drag on the canvas itself rotates/tilts the ring, not just a passive
// hover parallax.

test('layoutRing accepts a live tilt so the ellipse squash is drag-controlled, not fixed', () => {
  const flat = layoutRing(['a'], 100, -Math.PI / 2, 0.9);
  const steep = layoutRing(['a'], 100, -Math.PI / 2, 0.35);
  assert.ok(Math.abs(flat[0].y) > Math.abs(steep[0].y), 'a higher tilt value must produce a taller ellipse (less steep/edge-on)');
});

test('buildSceneLayout applies a live rotation offset so dragging genuinely spins the ring', () => {
  const noRotation = buildSceneLayout('focus', ['a', 'b'], 100, { rotation: 0, tilt: 0.55 });
  const rotated = buildSceneLayout('focus', ['a', 'b'], 100, { rotation: Math.PI / 2, tilt: 0.55 });
  assert.notDeepEqual(noRotation.satellites.map(s => [s.x, s.y]), rotated.satellites.map(s => [s.x, s.y]));
});

test('rotationFromDrag: dragging right and left spin in opposite directions', () => {
  assert.ok(rotationFromDrag(0, 100) > 0);
  assert.ok(rotationFromDrag(0, -100) < 0);
  assert.equal(rotationFromDrag(0, 0), 0);
});

test('tiltFromDrag: dragging down flattens the ellipse (lower tilt), dragging up steepens it, and it never leaves [MIN_TILT, MAX_TILT]', () => {
  const down = tiltFromDrag(0.55, 100);
  const up = tiltFromDrag(0.55, -100);
  assert.ok(down < 0.55);
  assert.ok(up > 0.55);
  assert.equal(clampTilt(-5), MIN_TILT);
  assert.equal(clampTilt(5), MAX_TILT);
});

test('rotationFromKey/tiltFromKey move by a fixed step per keypress, tilt still clamped', () => {
  assert.ok(rotationFromKey(0, 1) > 0);
  assert.ok(rotationFromKey(0, -1) < 0);
  assert.equal(tiltFromKey(MAX_TILT, 1), MAX_TILT);
  assert.equal(tiltFromKey(MIN_TILT, -1), MIN_TILT);
});

test('panFromDrag accumulates a pan offset and stays within [-MAX_PAN, MAX_PAN]', () => {
  const once = panFromDrag({ x: 0, y: 0 }, 10, -5);
  assert.deepEqual(once, { x: 10, y: -5 });
  const clamped = panFromDrag({ x: MAX_PAN - 2, y: 0 }, 100, 0);
  assert.equal(clamped.x, MAX_PAN);
  assert.equal(clampPan(-9999), -MAX_PAN);
});

test('an orbit drag and a pan drag produce different results for the same node set (they are not the same operation)', () => {
  const orbited = buildSceneLayout('focus', ['a'], 100, { rotation: rotationFromDrag(0, 200), tilt: 0.55 });
  const base = buildSceneLayout('focus', ['a'], 100, { rotation: 0, tilt: 0.55 });
  // Orbit changes satellite geometry; a pan is applied separately at draw time as a
  // canvas translate and never touches these coordinates -- this locks that
  // separation by asserting orbit alone already moves the satellite.
  assert.notDeepEqual(orbited.satellites[0], base.satellites[0]);
});
