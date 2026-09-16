import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const pages=fs.readFileSync(new URL('../../.github/workflows/atlas-pages-fallback.yml',import.meta.url),'utf8');
const legacyVercel=fs.readFileSync(new URL('../../.github/workflows/atlas-deploy.yml',import.meta.url),'utf8');

test('Atlas production artifact is a portable Vite static build',()=>{
  assert.equal(pkg.scripts?.build,'vite build');
  assert.ok(!Object.keys(pkg.dependencies||{}).some(name=>/vercel|neon/i.test(name)));
});

test('GitHub Pages is the canonical Atlas deployment target with browser verification',()=>{
  assert.match(pages,/name:\s*Atlas Deploy/);
  assert.match(pages,/actions\/deploy-pages@v4/);
  assert.match(pages,/Browser bootstrap smoke/);
  assert.match(pages,/playwright@/);
  assert.match(pages,/group:\s*atlas-production/);
});

test('Pages production build does not require a remote API environment variable or Vercel secret',()=>{
  assert.doesNotMatch(pages,/VITE_NEXO_API_BASE_URL/);
  assert.doesNotMatch(pages,/VERCEL_TOKEN|VERCEL_PROJECT_ID|VERCEL_ORG_ID/);
});

test('Pages readback validates both static runtime and Atlas Neural V3',()=>{
  assert.match(pages,/PAGE_URL/);
  assert.match(pages,/ATLAS_V3_READBACK_OK/);
  assert.match(pages,/ATLAS_PROJECTION_V3/);
  assert.match(pages,/TOWER_V06/);
  assert.match(pages,/COSMO-OLYMPUS-SELECTION-AWARE-CHANGE-001/);
  assert.doesNotMatch(pages,/\/api\/health/);
  assert.doesNotMatch(pages,/\/api\/graph\?focus=/);
});

test('legacy Vercel Action is manual compatibility fallback, not a second automatic production deployer',()=>{
  assert.match(legacyVercel,/name:\s*Atlas Legacy Vercel Deploy/);
  assert.match(legacyVercel,/workflow_dispatch:/);
  assert.doesNotMatch(legacyVercel,/push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(legacyVercel,/VERCEL_TOKEN/);
  assert.match(legacyVercel,/VERCEL_COMPATIBILITY_READBACK_OK/);
  assert.match(legacyVercel,/group:\s*atlas-vercel-compatibility/);
  assert.doesNotMatch(legacyVercel,/actions\/deploy-pages@v4/);
  assert.doesNotMatch(legacyVercel,/commits\/\$\{GITHUB_SHA\}\/status/);
});
