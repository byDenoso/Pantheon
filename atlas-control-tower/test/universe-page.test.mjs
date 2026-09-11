import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync(new URL('../src/pages/UniversePage.tsx',import.meta.url),'utf8');

test('universe page uses lightweight domain navigation before structural drill-down',()=>{
 assert.match(page,/useParams/);
 assert.match(page,/loadUniverseSource/);
 assert.match(page,/buildUniverseView/);
 assert.match(page,/DomainNavigator/);
 assert.match(page,/Domínios/);
 assert.match(page,/Entidades publicadas/);
 assert.doesNotMatch(page,/AtlasCanvas|WebGPU|map-workspace/);
});

test('universe page does not synthesize missing taxonomy',()=>{
 assert.match(page,/Nenhum subdomínio canônico publicado|subdomínio/i);
 assert.match(page,/Fonte indisponível|indisponível/i);
 assert.doesNotMatch(page,/NEON/i);
});
