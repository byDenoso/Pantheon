import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const pages=fs.readFileSync(new URL('../../.github/workflows/atlas-pages-fallback.yml',import.meta.url),'utf8');

test('Atlas production artifact is a portable Vite static build',()=>{
  assert.equal(pkg.scripts?.build,'vite build');
  assert.ok(!Object.keys(pkg.dependencies||{}).some(name=>/vercel|neon/i.test(name)));
});

test('GitHub Pages is an active deployment target with browser verification',()=>{
  assert.match(pages,/actions\/deploy-pages@v4/);
  assert.match(pages,/Browser bootstrap smoke/);
  assert.match(pages,/playwright@/);
});

test('Pages production build does not require a remote API environment variable',()=>{
  assert.doesNotMatch(pages,/VITE_NEXO_API_BASE_URL/);
  assert.doesNotMatch(pages,/VERCEL_TOKEN|VERCEL_PROJECT_ID|VERCEL_ORG_ID/);
});

test('Pages readback validates the published site rather than a serverless API',()=>{
  assert.match(pages,/PAGE_URL/);
  assert.doesNotMatch(pages,/\/api\/health/);
  assert.doesNotMatch(pages,/\/api\/graph\?focus=/);
});
