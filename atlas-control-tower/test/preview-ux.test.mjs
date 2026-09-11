import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=(p)=>fs.readFileSync(new URL(p,root),'utf8');

test('preview shell fixes skip-link and exposes higher contrast theme surfaces',()=>{
 const shell=read('src/app/AppShell.tsx');
 const theme=read('src/design/theme.css');
 assert.match(shell,/id="atlas-main"/);
 assert.match(theme,/--text:/);
 assert.match(theme,/--muted:/);
 assert.match(theme,/skip-link/);
});

test('destination pages consume global-search selection parameters',()=>{
 const sub=read('src/pages/SubdomainPage.tsx');
 const learn=read('src/pages/LearningPage.tsx');
 const ops=read('src/pages/OperationsPage.tsx');
 assert.match(sub,/searchParams/);
 assert.match(learn,/searchParams/);
 assert.match(ops,/searchParams/);
});
