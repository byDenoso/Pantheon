import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../src/pages/LearningPage.tsx',import.meta.url),'utf8');

test('Learning page is backed by the vNext learning projection and neural renderer',()=>{
 assert.match(source,/loadLearningSource/);
 assert.match(source,/buildLearningMeshModel/);
 assert.match(source,/LearningMesh/);
 assert.match(source,/Mapa neural/);
 assert.match(source,/Transferências/);
 assert.match(source,/Aprendizados/);
 assert.match(source,/Memória procedural/);
});

test('Learning page remains transversal and provider agnostic',()=>{
 assert.doesNotMatch(source,/AtlasCanvas|system:LEARNING/i);
 assert.doesNotMatch(source,/Neon/i);
 assert.match(source,/Fonte indisponível|indisponível/i);
 assert.match(source,/Contextos conectados/);
});
