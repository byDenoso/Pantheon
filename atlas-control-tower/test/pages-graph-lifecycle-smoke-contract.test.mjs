import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../../.github/workflows/atlas-pages-fallback.yml', import.meta.url), 'utf8');

test('Pages browser smoke waits for the graph renderer canvas and exercises teardown plus remount', () => {
  // .graph-v2-canvas was the old Pixi-based renderer's class; the app has since
  // moved to the Canvas 2.5D/Three.js renderer, whose real, live-verified DOM is
  // .graph-renderer-canvas canvas (containing .canvas-25d-graph-host) -- confirmed
  // by reproducing the smoke test's exact flow against a real local build, not
  // guessed. This assertion was left pointing at the retired class name.
  assert.match(workflow, /waitForSelector\(['"]\.graph-renderer-canvas canvas/);
  assert.doesNotMatch(workflow, /\.graph-v2-canvas/);
  assert.match(workflow, /getByRole\(['"]link['"],\s*\{name:\s*['"]OBSERVATÓRIO['"]\}\)\.click\(\)/);
  assert.match(workflow, /getByRole\(['"]link['"],\s*\{name:\s*['"]GRAFOS['"]\}\)\.click\(\)/);
  assert.match(workflow, /GRAPH_LIFECYCLE_SMOKE_OK/);
});

test('Pages browser smoke enters through the real landing page before asserting on the app shell', () => {
  // The public root is a real, intentional marketing/landing page (LandingPage.tsx)
  // that does not mount the ATLAS shell -- confirmed live. The smoke test must
  // click through it first, exactly as a real visitor would, rather than assume
  // the shell/graph DOM exists at the bare root.
  assert.match(workflow, /getByRole\(['"]link['"],\s*\{name:\s*['"]Mapa['"]\}\)\.click\(\)/);
});
