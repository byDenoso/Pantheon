import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../src/atlas-route.ts', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../../.github/workflows/atlas-pages-fallback.yml', import.meta.url), 'utf8');

test('Pages fallback preserves route semantics below the repository base path', () => {
  assert.match(route, /import\.meta\.env\.BASE_URL/);
  assert.match(route, /stripAppBase/);
  assert.match(route, /withAppBase/);
});

test('Pages repository root defaults to a known area, never an undefined one', () => {
  // The map is the Atlas workspace entry point. An unrecognized or empty area
  // segment must resolve to that useful surface rather than a dead landing page.
  assert.doesNotMatch(route, /AREAS\.includes\(areaSegment\s*\|\|\s*['"]graphs['"]\)\s*\?\s*areaSegment/);
  assert.match(route, /:\s*'graphs'/);
  assert.match(route, /AREA_BY_SEGMENT\[areaSegment\]/);
});

test('Pages fallback uses the sovereign static runtime and repository base', () => {
  assert.doesNotMatch(workflow, /VITE_NEXO_API_BASE_URL/);
  assert.doesNotMatch(workflow, /nexo-atlas-control-tower\.vercel\.app\/api/);
  assert.match(workflow, /npm run build -- --base=\/Pantheon\//);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /Readback Pages static runtime/);
});
