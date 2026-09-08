import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const runtime = read('../api/runtime.js');
const runtimeV2 = read('../api/runtime-v2.js');
const semantic = read('../api/runtime-semantic.js');
const inspector = read('../ui/inspector.mjs');

test('Learning domain hubs are first-class navigable graph entities', () => {
  assert.match(runtime, /learning-domain:/);
  assert.match(runtime, /function learningDomainNode/);
  assert.match(runtime, /startsWith\(['"]learning-domain:/);
  assert.match(runtimeV2, /learning-domain:/);
});

test('Olympus projection exposes source refs as clickable provenance URLs', () => {
  assert.match(semantic, /function sourceRefsOf/);
  assert.match(semantic, /https:\/\/drive\.google\.com\/open\?id=/);
  assert.match(semantic, /sourceRefs:sourceRefsOf\(current\?\.source_ref/);
  assert.match(semantic, /sourceRefs:sourceRefsOf\(current\.source_ref/);
  assert.match(semantic, /sourceRefs:sourceRefsOf\(event\.source_ref/);
});

test('Inspector exposes source link in the normal entity action row', () => {
  assert.match(inspector, /Fonte ↗/);
  assert.match(inspector, /sourceUrl/);
  assert.match(inspector, /window\.open\(sourceUrl/);
});
