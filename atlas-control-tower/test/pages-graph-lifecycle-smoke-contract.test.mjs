import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../../.github/workflows/atlas-pages-fallback.yml', import.meta.url), 'utf8');

test('Pages browser smoke waits for the Pixi graph and exercises teardown plus remount', () => {
  assert.match(workflow, /waitForSelector\(['"]\.graph-v2-canvas canvas/);
  assert.match(workflow, /getByRole\(['"]link['"],\s*\{name:\s*['"]OBSERVATÓRIO['"]\}\)\.click\(\)/);
  assert.match(workflow, /getByRole\(['"]link['"],\s*\{name:\s*['"]GRAFOS['"]\}\)\.click\(\)/);
  assert.match(workflow, /GRAPH_LIFECYCLE_SMOKE_OK/);
});
