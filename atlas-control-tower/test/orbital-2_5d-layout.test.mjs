import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutRing, buildSceneLayout, applyParallax, hitTest, nodeRadius } from '../src/graph-engine/orbital-2_5d-layout.ts';

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
