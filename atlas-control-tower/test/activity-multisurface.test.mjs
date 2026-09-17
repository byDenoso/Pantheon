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

test('activity renders canonical labels and statuses and exposes only governed Control Plane actions',()=>{
 const source=read('src/pages/AtividadePage.tsx');
 assert.match(source,/function label\(item/);
 assert.match(source,/function status\(item/);
 for(const action of ['SYNC','RECONCILE','EXECUTE','RECOVER','VALIDATE']) assert.match(source,new RegExp(action));
 assert.match(source,/controlPlaneAction/);
 assert.doesNotMatch(source,/nexo\.create_work/);
 assert.doesNotMatch(source,/Criar WORK/);
});
