import test from 'node:test';
import assert from 'node:assert/strict';
import {atlasModeFromHash,hashForView,viewFromHash} from '../src/app/navigation.ts';

test('atlas nested hashes are stable and shareable',()=>{
  assert.equal(hashForView('ATLAS','operations'),'#atlas/operations');
  assert.equal(hashForView('ATLAS','truth'),'#atlas/truth');
  assert.equal(viewFromHash('#atlas/capabilities'),'ATLAS');
  assert.equal(atlasModeFromHash('#atlas/capabilities'),'capabilities');
});

test('legacy atlas hash normalizes to general mode',()=>{
  assert.equal(viewFromHash('#atlas'),'ATLAS');
  assert.equal(atlasModeFromHash('#atlas'),'general');
});

test('invalid atlas mode falls back to general without breaking the ATLAS view',()=>{
  assert.equal(viewFromHash('#atlas/not-real'),'ATLAS');
  assert.equal(atlasModeFromHash('#atlas/not-real'),'general');
});

test('non-atlas view hashes remain unchanged',()=>{
  assert.equal(hashForView('EXECUTION'),'#execution');
  assert.equal(viewFromHash('#execution'),'EXECUTION');
});
