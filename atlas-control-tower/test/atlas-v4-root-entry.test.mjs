import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAtlasV4RootRedirect} from '../src/atlas-v3/root-entry.mjs';

test('public Pantheon root resolves directly to the Neural V4 standalone workspace',()=>{
  assert.equal(
    resolveAtlasV4RootRedirect({pathname:'/Pantheon/',search:'?atlas-view=abc',hash:'#focus'},'/Pantheon/'),
    '/Pantheon/atlas-v3/?atlas-view=abc#focus'
  );
});

test('deep product routes are not hijacked by the Neural V4 root redirect',()=>{
  assert.equal(resolveAtlasV4RootRedirect({pathname:'/Pantheon/observatorio',search:'',hash:''},'/Pantheon/'),null);
  assert.equal(resolveAtlasV4RootRedirect({pathname:'/Pantheon/atlas-v3/',search:'',hash:''},'/Pantheon/'),null);
});
