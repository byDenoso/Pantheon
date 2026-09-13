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

test('Pages repository root defaults to graphs instead of an undefined area', () => {
  assert.doesNotMatch(route, /AREAS\.includes\(areaSegment\s*\|\|\s*['"]graphs['"]\)\s*\?\s*areaSegment/);
  assert.match(route, /areaSegment\s*&&\s*AREAS\.includes\(areaSegment\)\s*\?\s*areaSegment\s*:\s*['"]graphs['"]/);
});

test('Pages fallback uses the canonical production API and repository base', () => {
  assert.match(workflow, /VITE_NEXO_API_BASE_URL: https:\/\/nexo-atlas-control-tower\.vercel\.app\/api/);
  assert.match(workflow, /npm run build -- --base=\/Pantheon\//);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
