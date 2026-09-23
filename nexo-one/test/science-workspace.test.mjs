import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const text=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Science workspace consumes projection v1 without invented counts',async()=>{
  const science=await text('src/features/ScienceWorkspace.tsx');
  const app=await text('src/app/App.tsx');
  const nav=await text('src/app/navigation.ts');
  assert.match(science,/state\.science_projection_v1/);
  assert.match(science,/projection\?\.campaigns\.length/);
  assert.match(science,/projection\?\.tests\.length/);
  assert.match(science,/projection\?\.hypotheses\.length/);
  assert.match(science,/não publicado/);
  assert.match(science,/NexoGraph/);
  assert.match(science,/Evidência/);
  assert.match(science,/Relações/);
  assert.match(science,/CSV/);
  assert.match(science,/PNG/);
  assert.match(science,/nexo\.graph\.view\.v1/);
  assert.doesNotMatch(science,/\b14\b.*Campanhas|Campanhas.*\b14\b/);
  assert.doesNotMatch(science,/\b74\b.*Testes|Testes.*\b74\b/);
  assert.match(app,/ScienceWorkspace/);
  assert.match(nav,/#\/cockpit\/ciencia\?tab=campanhas/);
});

test('Science graph keeps campaigns, tests and hypotheses on the shared model',async()=>{
  const science=await text('src/features/ScienceWorkspace.tsx');
  assert.match(science,/entityType:'CAMPAIGN'/);
  assert.match(science,/entityType:'CLAIM'/);
  assert.match(science,/entityType:'TEST'/);
  assert.match(science,/kind:'VERIFIES'/);
  assert.match(science,/view=\{graphView\}/);
});
