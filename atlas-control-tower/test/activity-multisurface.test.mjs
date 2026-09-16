import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('activity page consumes the live canonical Tower surface',()=>{
 const source=read('src/pages/AtividadePage.tsx');
 assert.match(source,/\/api\/live\/activity/);
 assert.match(source,/TOWER_V06/);
 assert.doesNotMatch(source,/research\(['"]activity['"]\)/);
 assert.doesNotMatch(source,/Fonte de atividade indisponível/);
});

test('activity renders canonical labels and statuses and exposes governed work creation',()=>{
 const source=read('src/pages/AtividadePage.tsx');
 assert.match(source,/function label\(item/);
 assert.match(source,/function status\(item/);
 assert.match(source,/semanticCommand\(['"]nexo\.create_work['"]/);
 assert.match(source,/Criar WORK/);
});
