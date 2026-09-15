import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/atlas-v3/AtlasV3App.tsx',import.meta.url),'utf8');

test('V4 shell separates primary domains from contextual overlays',()=>{
  assert.match(app,/PRIMARY_DOMAINS/);
  assert.match(app,/OVERLAYS/);
  assert.match(app,/atlas-domain-bar/);
  assert.match(app,/atlas-overlay-menu/);
});

test('V4 shell exposes semantic orientation and stale last-known-good state',()=>{
  assert.match(app,/atlas-breadcrumb/);
  assert.match(app,/STALE/);
  assert.match(app,/diffSnapshots/);
  assert.doesNotMatch(app,/setSnapshot\(null\);setScene\(null\);setError/);
});

test('V4 shell exposes fit selection and semantic shortcuts',()=>{
  assert.match(app,/atlas:fit-selection/);
  assert.match(app,/event\.key==='Home'/);
  assert.match(app,/event\.key\.toLowerCase\(\)==='f'/);
  assert.match(app,/event\.key\.toLowerCase\(\)==='l'/);
});
