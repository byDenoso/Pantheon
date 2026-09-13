import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const loadData=name=>fs.readFileSync(new URL(`../src/data/${name}`,import.meta.url),'utf8');
const loadUi=path=>fs.readFileSync(new URL(`../src/${path}`,import.meta.url),'utf8');
const boundaries=[
  ['load-global-search.ts','components/GlobalSearch.tsx','loadGlobalSearchSources'],
  ['load-learning.ts','pages/LearningPage.tsx','loadLearningSource'],
  ['load-operations.ts','pages/OperationsPage.tsx','loadOperationsSources'],
  ['load-overview.ts','pages/OverviewPage.tsx','loadOverviewSources'],
  ['load-provenance.ts','pages/ProvenancePage.tsx','loadProvenanceSources'],
  ['load-universe.ts','pages/UniversePage.tsx','loadUniverseSource'],
  ['load-universes.ts','pages/UniversesPage.tsx','loadUniversesSources']
];

test('active data loaders stay runtime-agnostic and UI boundaries inject the configured sovereign client',()=>{
  for(const [loaderName,uiPath,fnName] of boundaries){
    const loader=loadData(loaderName);
    const ui=loadUi(uiPath);
    assert.doesNotMatch(loader,/\.\.\/\.\.\/lib\/atlas-api\.mjs/,`${loaderName} still imports the legacy API factory`);
    assert.doesNotMatch(loader,/\.\.\/api\/client/,`${loaderName} imports a Vite/browser client and breaks direct Node tests`);
    assert.doesNotMatch(loader,/\bcreateApi\s*\(/,`${loaderName} still constructs a legacy API client`);
    assert.doesNotMatch(loader,/\bcreateConfiguredApi\s*\(/,`${loaderName} constructs the browser client instead of accepting injection`);
    assert.match(ui,/createConfiguredApi/,`${uiPath} must own configured client creation`);
    assert.match(ui,new RegExp(`${fnName}\\([^)]*api`),`${uiPath} must inject the configured client into ${fnName}`);
  }
});

test('all graph entry pages use the configured sovereign client and never recreate the legacy factory',()=>{
  for(const path of ['pages/GraphDomainPage.tsx','pages/GraphDomainV2Page.tsx','pages/GraphsPage.tsx','pages/GraphsV2Page.tsx']){
    const source=loadUi(path);
    assert.match(source,/createConfiguredApi/,`${path} must use configured sovereign client`);
    assert.doesNotMatch(source,/\.\.\/\.\.\/lib\/atlas-api\.mjs/,`${path} still imports the legacy API factory`);
    assert.doesNotMatch(source,/\bcreateApi\s*\(/,`${path} still constructs the legacy API client`);
  }
});

const clientTypes=fs.readFileSync(new URL('../src/api/types.ts',import.meta.url),'utf8');
test('typed Atlas client declares automation run reads exposed by both remote and static runtimes',()=>{
  assert.match(clientTypes,/automationRuns\s*:\s*\(\)\s*=>\s*Promise/);
});

const staticApi=fs.readFileSync(new URL('../lib/static-artifact-api.mjs',import.meta.url),'utf8');
test('published static runtime covers automation run reads used by Operations and global search',()=>{
  assert.match(staticApi,/automationRuns\s*:/);
  assert.match(staticApi,/operations\/current\.json/);
});
