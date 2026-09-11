import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync(new URL('../src/pages/UniversesPage.tsx',import.meta.url),'utf8');

test('Universes landing is a graph-free catalogue backed by declared sources',()=>{
 assert.match(page,/loadUniversesSources/);
 assert.match(page,/buildUniversesModel/);
 assert.match(page,/Explore os grandes contextos do NEXO/);
 assert.match(page,/subdomainCount/);
 assert.match(page,/entityCount/);
 assert.match(page,/Link/);
 assert.doesNotMatch(page,/AtlasCanvas|Canvas|WebGPU|map-workspace/);
});

test('Universes landing renders unavailable state instead of fabricated cards',()=>{
 assert.match(page,/Fonte indisponível|indisponível/i);
 assert.doesNotMatch(page,/NEON/i);
});