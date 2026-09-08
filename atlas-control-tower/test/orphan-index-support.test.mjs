import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const semantic = read('../api/runtime-semantic.js');
const orphanRuntime = read('../api/runtime-orphans.js');
const inspector = read('../ui/inspector.mjs');

test('Learning domain hubs are first-class navigable graph entities', () => {
  assert.match(orphanRuntime, /isLearningDomainId/);
  assert.match(orphanRuntime, /domainProjection/);
  assert.match(orphanRuntime, /learning_v1/);
  assert.match(orphanRuntime, /semanticHandler/);
});

test('Olympus projection exposes source refs as clickable provenance URLs', () => {
  assert.match(semantic, /function sourceRefsOf/);
  assert.match(semantic, /https:\/\/drive\.google\.com\/open\?id=/);
  assert.match(semantic, /sourceRefs:sourceRefsOf\(current\?\.source_ref/);
  assert.match(semantic, /sourceRefs:sourceRefsOf\(current\.source_ref/);
  assert.match(semantic, /sourceRefs:sourceRefsOf\(event\.source_ref/);
});

test('Olympus normal entity reads receive semantic cockpit metadata', () => {
  assert.match(orphanRuntime, /loadOlympus/);
  assert.match(orphanRuntime, /olympusEntity/);
  assert.match(orphanRuntime, /semanticMeta\(req,id\)/);
  assert.match(orphanRuntime, /metadata:\{\.\.\.\(base\.metadata\|\|\{\}\),\.\.\.meta\}/);
});

test('Inspector exposes source link in the normal entity action row', () => {
  assert.match(inspector, /Fonte ↗/);
  assert.match(inspector, /sourceUrl/);
  assert.match(inspector, /window\.open\(sourceUrl/);
});
