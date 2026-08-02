import test from 'node:test';
import assert from 'node:assert/strict';
import { projects } from '../src/data.js';
import { AtlasRenderer } from '../src/atlas.js';

function rendererWith(expanded = []) {
  const renderer = Object.create(AtlasRenderer.prototype);
  renderer.projects = projects;
  renderer.expandedIds = new Set(expanded);
  return renderer;
}

test('renderer draws only canonical root projects before interaction', () => {
  const visible = rendererWith().visibleProjects();
  assert.equal(visible.length, 8);
  assert.deepEqual(new Set(visible.map((project) => project.id)), new Set([
    'peer-core', 'admindesk', 'auditdata', 'pantheon', 'tcc', 'project-atlas', 'olympus', 'astronomy-stories',
  ]));
});

test('renderer expands only the clicked Olympus subtree', () => {
  const visible = rendererWith(['olympus']).visibleProjects();
  const ids = new Set(visible.map((project) => project.id));
  assert.equal(visible.length, 11);
  assert.ok(ids.has('project-natalia'));
  assert.ok(ids.has('miqueias-v3'));
  assert.ok(ids.has('renilde'));
  assert.equal(ids.has('peer-paper'), false);
});

test('renderer expands only the clicked PEER subtree', () => {
  const visible = rendererWith(['peer-core']).visibleProjects();
  const ids = new Set(visible.map((project) => project.id));
  assert.equal(visible.length, 12);
  assert.ok(ids.has('peer-paper'));
  assert.ok(ids.has('peer-camb'));
  assert.ok(ids.has('lh-data'));
  assert.ok(ids.has('peer-inflation'));
  assert.equal(ids.has('project-natalia'), false);
});
