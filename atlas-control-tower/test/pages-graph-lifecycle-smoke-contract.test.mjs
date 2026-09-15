import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../../.github/workflows/atlas-pages-fallback.yml', import.meta.url), 'utf8');

test('Pages browser smoke waits for the Neural canvas and exercises teardown plus remount', () => {
  assert.match(workflow, /waitForSelector\(['"]\.atlas-r3f-stage canvas,\.atlas-graph-renderer-fallback canvas/);
  assert.doesNotMatch(workflow, /\.graph-v2-canvas/);
  assert.match(workflow, /getByRole\(['"]link['"],\s*\{name:\s*['"]OBSERVATÓRIO['"]\}\)\.click\(\)/);
  assert.match(workflow, /getByRole\(['"]link['"],\s*\{name:\s*['"]GRAFOS['"]\}\)\.click\(\)/);
  assert.match(workflow, /GRAPH_LIFECYCLE_SMOKE_OK/);
});

test('Pages browser smoke opens the graph workspace directly at the public root', () => {
  // The public root is the map-first Atlas workspace; no extra landing-page click
  // should be required before the graph lifecycle assertion.
  assert.doesNotMatch(workflow, /getByRole\(['"]link['"],\s*\{name:\s*['"]Mapa['"]\}\)\.click\(\)/);
  assert.match(workflow, /page\.goto\(['"]http:\/\/127\.0\.0\.1/);
});
