import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const graphDomain=fs.readFileSync(new URL('../src/pages/GraphDomainPage.tsx',import.meta.url),'utf8');
const graphDetail=fs.readFileSync(new URL('../src/pages/GraphDetailPage.tsx',import.meta.url),'utf8');
const vite=fs.readFileSync(new URL('../vite.config.ts',import.meta.url),'utf8');
const deploy=fs.readFileSync(new URL('../../.github/workflows/atlas-deploy.yml',import.meta.url),'utf8');
const quality=fs.readFileSync(new URL('../../.github/workflows/atlas-quality.yml',import.meta.url),'utf8');

test('graphs domain route renders an explicit unavailable state when the SSOT read returns null',()=>{
  assert.match(graphDomain,/graph===null/);
  assert.match(graphDomain,/indisponível/i);
});

test('graph detail drills into canonical domain node ids for every universe',()=>{
  assert.match(graphDetail,/['"]domain:['"]\s*\+\s*subgraphId|`domain:\$\{subgraphId\}`/);
  assert.doesNotMatch(graphDetail,/domainId\s*\+\s*['"]:['"]\s*\+\s*subgraphId/);
});

test('production workflow verifies the vNext app rather than the retired orbital shell',()=>{
  assert.match(deploy,/npm ci --no-audit --no-fund/);
  assert.match(deploy,/npm run typecheck/);
  assert.match(deploy,/npm run build/);
  assert.match(deploy,/\/graphs/);
  assert.match(deploy,/\/graphs\/science/);
  assert.match(deploy,/\/graphs\/science\/D3/);
  assert.doesNotMatch(deploy,/app\.mjs/);
  assert.doesNotMatch(deploy,/id=\\?['"]graph\\?['"]/);
});

test('main quality gate is reproducible and uploads only the tested frontend build',()=>{
  assert.match(quality,/main/);
  assert.match(quality,/npm ci --no-audit --no-fund/);
  assert.match(quality,/path:\s*atlas-control-tower\/dist\//);
  assert.doesNotMatch(quality,/path:\s*atlas-control-tower\/\s*$/m);
});

test('production Vite build does not publish source maps by default',()=>{
  assert.match(vite,/sourcemap\s*:\s*false/);
});
