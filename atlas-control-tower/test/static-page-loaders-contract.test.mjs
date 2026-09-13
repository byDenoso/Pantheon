import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const load=name=>fs.readFileSync(new URL(`../src/data/${name}`,import.meta.url),'utf8');
const loaders=[
  'load-global-search.ts',
  'load-learning.ts',
  'load-operations.ts',
  'load-overview.ts',
  'load-provenance.ts',
  'load-universe.ts',
  'load-universes.ts'
];

test('active page loaders use the configured sovereign client instead of constructing legacy API clients',()=>{
  for(const name of loaders){
    const source=load(name);
    assert.doesNotMatch(source,/\.\.\/\.\.\/lib\/atlas-api\.mjs/,`${name} still imports the legacy API factory`);
    assert.doesNotMatch(source,/\bcreateApi\s*\(/,`${name} still constructs a legacy API client`);
    assert.match(source,/createConfiguredApi/,`${name} must default to the configured sovereign client`);
  }
});

const staticApi=fs.readFileSync(new URL('../lib/static-artifact-api.mjs',import.meta.url),'utf8');
test('published static runtime covers automation run reads used by Operations and global search',()=>{
  assert.match(staticApi,/automationRuns\s*:/);
  assert.match(staticApi,/operations\/current\.json/);
});
