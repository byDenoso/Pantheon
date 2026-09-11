import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../src/pages/ProvenancePage.tsx',import.meta.url),'utf8');

test('Provenance page separates audit overview from entity lineage',()=>{
 assert.match(source,/loadProvenanceSources/);
 assert.match(source,/Saúde da proveniência/);
 assert.match(source,/Lineage/);
 assert.match(source,/LineageDag/);
 assert.match(source,/SourceRefs|Fontes/);
});

test('Provenance page does not reuse structural or neural graph renderers',()=>{
 assert.doesNotMatch(source,/AtlasCanvas|StructuralExplorer|LearningMesh/);
 assert.doesNotMatch(source,/92%|score de confiança/i);
 assert.match(source,/Selecione uma entidade|entidade/i);
});