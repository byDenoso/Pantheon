import test from 'node:test';
import assert from 'node:assert/strict';
import {cosmicGeometry} from '../src/experience/cosmic-geometry.ts';

test('illustrative geometry is finite, bounded and deterministic for each seed',()=>{
  const a=cosmicGeometry(1200,41),b=cosmicGeometry(1200,41),c=cosmicGeometry(1200,42);
  assert.deepEqual(a,b);assert.notDeepEqual(a.positions,c.positions);
  assert.equal(a.positions.length,3600);assert.equal(a.sizes.length,1200);
  assert.ok(a.positions.every(Number.isFinite));
  assert.ok(a.positions.every(value=>Math.abs(value)<5));
  assert.ok(a.sizes.every(value=>value>0));
});
