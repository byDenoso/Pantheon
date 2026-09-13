import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMERA25D_PRESETS,depthOpacity25d,depthScale25d,perspectiveDepth25d,projectPoint25d,screenToWorld25d,worldToScreen25d} from '../src/graph-engine/camera-25d.mjs';

test('2.5D projection is deterministic and perspective presets change semantic depth',()=>{
  const point={x:100,y:80,z:2};
  const balanced=projectPoint25d(point,{yaw:12,pitch:-8,depth:perspectiveDepth25d('balanced')});
  const repeated=projectPoint25d(point,{yaw:12,pitch:-8,depth:perspectiveDepth25d('balanced')});
  const flat=projectPoint25d(point,{yaw:12,pitch:-8,depth:perspectiveDepth25d('flat')});
  const deep=projectPoint25d(point,{yaw:12,pitch:-8,depth:perspectiveDepth25d('deep')});
  assert.deepEqual(balanced,repeated);
  assert.notEqual(flat.x,deep.x);
  assert.notEqual(flat.depthScale,deep.depthScale);
  assert.equal(CAMERA25D_PRESETS.balanced.depth,1);
});

test('depth scale and opacity stay bounded while screen transforms round-trip XY',()=>{
  assert.ok(depthScale25d(99,{depth:4})<=1.28);
  assert.ok(depthScale25d(-99,{depth:4})>=.7);
  assert.ok(depthOpacity25d(99,{depth:4})<=1);
  assert.ok(depthOpacity25d(-99,{depth:4})>=.24);
  const camera={x:30,y:-12,zoom:1.4,yaw:0,pitch:0,depth:1};
  const screen=worldToScreen25d({x:52,y:17,z:0},camera);
  const world=screenToWorld25d(screen,camera);
  assert.ok(Math.abs(world.x-52)<1e-9);
  assert.ok(Math.abs(world.y-17)<1e-9);
});