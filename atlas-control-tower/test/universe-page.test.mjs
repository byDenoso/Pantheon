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

test('graphs navigation contract',()=>{
 const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
 const route=fs.readFileSync(new URL('../src/atlas-route.ts',import.meta.url),'utf8');
 assert.equal(app.includes('GRAFOS'),true);
 // Public route contract update: the map's canonical public URL is /mapa/science/:domain;
 // /graphs/science/:domain is still accepted and redirected, not the canonical form anymore.
 assert.equal(route.includes('/science/'),true);
 assert.equal(route.includes("mapa: 'graphs'"),true);
 assert.equal(route.includes('domain'),true);
});
