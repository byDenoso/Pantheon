import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../src/pages/OperationsPage.tsx',import.meta.url),'utf8');

test('Operations page is an execution cockpit without a knowledge graph',()=>{
 assert.match(source,/loadOperationsSources/);
 assert.match(source,/Black Box/);
 assert.match(source,/Runs recentes/);
 assert.match(source,/Automações/);
 assert.match(source,/Integridade/);
 assert.doesNotMatch(source,/AtlasCanvas|StructuralExplorer|LearningMesh/);
});

test('Operations page keeps provider internals out of presentation copy',()=>{
 assert.doesNotMatch(source,/NEON|POSTGREST|OIDC/i);
 assert.match(source,/Fonte indisponível|indisponível/i);
});