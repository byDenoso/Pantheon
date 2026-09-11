import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync(new URL('../src/pages/UniversePage.tsx',import.meta.url),'utf8');

test('universe page is a graph-free second level with canonical subdomains',()=>{
 assert.match(page,/useParams/);
 assert.match(page,/loadUniverseSource/);
 assert.match(page,/buildUniverseView/);
 assert.match(page,/Subdomínios/);
 assert.match(page,/Entidades publicadas/);
 assert.match(page,/Link/);
 assert.doesNotMatch(page,/AtlasCanvas|WebGPU|map-workspace/);
});

test('universe page does not synthesize missing taxonomy',()=>{
 assert.match(page,/Nenhum subdomínio canônico publicado|subdomínio/i);
 assert.match(page,/Fonte indisponível|indisponível/i);
 assert.doesNotMatch(page,/NEON/i);
});