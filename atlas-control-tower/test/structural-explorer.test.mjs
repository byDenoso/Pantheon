import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('subdomain route owns the only structural knowledge graph',()=>{
 const page=read('src/pages/SubdomainPage.tsx');
 const explorer=read('src/components/StructuralExplorer.tsx');
 assert.match(page,/StructuralExplorer/);
 assert.match(page,/domain:\$\{subdomainId\}/);
 assert.match(explorer,/AtlasCanvas/);
 assert.match(explorer,/api\.graph/);
 assert.match(explorer,/depth:2/);
 assert.match(explorer,/Mapa/);
 assert.match(explorer,/Resumo/);
 assert.match(explorer,/Claims/);
 assert.match(explorer,/Testes/);
 assert.match(explorer,/Evidências/);
 assert.match(explorer,/Fontes/);
 assert.doesNotMatch(page,/AtlasCanvas/);
});
test('structural explorer keeps inspection human-facing and provider agnostic',()=>{
 const explorer=read('src/components/StructuralExplorer.tsx');
 assert.match(explorer,/selectedEntity/);
 assert.match(explorer,/status-pill/);
 assert.match(explorer,/Fonte/);
 assert.match(explorer,/Mais entidades/);
 assert.doesNotMatch(explorer,/NEON|VERCEL_OIDC|Authorization:/i);
 assert.doesNotMatch(explorer,/JSON\.stringify\(selectedEntity/);
});
