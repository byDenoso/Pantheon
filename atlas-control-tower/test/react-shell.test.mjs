import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=()=>fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const labels=()=>fs.readFileSync(new URL('../src/scene/LabelOverlay.tsx',import.meta.url),'utf8');
const session=()=>fs.readFileSync(new URL('../src/state/useAtlasSession.ts',import.meta.url),'utf8');
const index=()=>fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('React shell preserves approved orbital Atlas navigation and copy',()=>{
 const src=app();
 assert.match(index(),/id="root"/);
 assert.match(src,/NEXO/);
 assert.match(src,/Visão do sistema/);
 assert.match(src,/Universo científico/);
 assert.match(src,/Black Box/);
 assert.match(src,/Learning/);
 assert.match(src,/Ideias em órbita/);
 assert.match(src,/Sincronizar/);
 assert.match(src,/Atlas é projeção somente leitura/);
});

test('React state bridge reuses existing Atlas API and session contracts',()=>{
 const src=session();
 assert.match(src,/createApi/);
 assert.match(src,/createSession/);
 assert.match(src,/\.\.\/\.\.\/lib\/atlas-api\.mjs/);
 assert.match(src,/\.\.\/\.\.\/lib\/graph-session\.mjs/);
});

test('HTML overlay is a bounded single DOM label layer',()=>{
 const src=labels();
 assert.match(src,/atlas-label-overlay/);
 assert.match(src,/labelIds/);
 assert.match(src,/project/);
 assert.doesNotMatch(src,/<Html/);
});
