import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('activity page consumes the dedicated public activity surface',()=>{
 const source=read('src/pages/AtividadePage.tsx');
 assert.match(source,/research\(['"]activity['"]\)/);
 assert.match(source,/Fonte de atividade indisponível/);
 assert.match(source,/Nenhum evento publicado neste recorte/);
 assert.doesNotMatch(source,/requer a fachada privada/);
});

test('activity renders real stage status and timestamp fields when records exist',()=>{
 const source=read('src/pages/AtividadePage.tsx');
 assert.match(source,/item\.stage/);
 assert.match(source,/item\.status/);
 assert.match(source,/item\.timestamp/);
});
