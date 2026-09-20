import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const TARGETS=[
  'api/mcp.js',
  'api/private/control.mjs',
  'api/private/semantic.mjs'
];

test('active semantic surfaces route through the storage gateway', async()=>{
  for(const relative of TARGETS){
    const source=await readFile(new URL('../'+relative,import.meta.url),'utf8');
    assert.match(source,/tower-gateway\.mjs/);
    assert.doesNotMatch(source,/tower-github-gateway\.mjs/);
    assert.doesNotMatch(source,/createTowerGithubGateway/);
  }
});

test('sync source label is storage-neutral', async()=>{
  const source=await readFile(new URL('../api/private/sync.mjs',import.meta.url),'utf8');
  assert.match(source,/tower-state/);
  assert.doesNotMatch(source,/github-state/);
});
