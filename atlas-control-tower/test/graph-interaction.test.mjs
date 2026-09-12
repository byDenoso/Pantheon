import test from 'node:test';
import assert from 'node:assert/strict';
import {pointerParallaxTarget, isNavigableNode} from '../graph3d.mjs';

test('pointerParallaxTarget maps pointer position to bounded yaw and pitch offsets', () => {
  assert.deepEqual(pointerParallaxTarget(500, 330, 1000, 660), {yaw: 0, pitch: 0});
  assert.deepEqual(pointerParallaxTarget(1000, 660, 1000, 660), {yaw: 0.16, pitch: 0.11});
  assert.deepEqual(pointerParallaxTarget(0, 0, 1000, 660), {yaw: -0.16, pitch: -0.11});
});

test('isNavigableNode opens a subgraph when the node participates in graph relations', () => {
  const data = {
    nodes: [
      {id: 'domain:COSMOLOGY', type: 'DOMAIN'},
      {id: 'thread:T1', type: 'THREAD'},
      {id: 'work:W1', type: 'WORK'}
    ],
    edges: [
      {source: 'domain:COSMOLOGY', target: 'thread:T1', type: 'CONTAINS'},
      {source: 'thread:T1', target: 'work:W1', type: 'CONTAINS'}
    ]
  };

  assert.equal(isNavigableNode(data.nodes[0], data, 'system:NEXO'), true);
  assert.equal(isNavigableNode(data.nodes[1], data, 'system:NEXO'), true);
  assert.equal(isNavigableNode(data.nodes[2], data, 'system:NEXO'), true, 'a related leaf can still open its local relation subgraph');
  assert.equal(isNavigableNode({id: 'orphan:X', type: 'WORK'}, data, 'system:NEXO'), false);
});
