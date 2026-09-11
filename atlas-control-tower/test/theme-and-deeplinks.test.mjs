import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=(p)=>fs.readFileSync(new URL(p,root),'utf8');

test('shell exposes a real theme toggle and main landmark for the skip link',()=>{
 const shell=read('src/app/AppShell.tsx');
 const index=read('index.html');
 assert.match(shell,/ThemeToggle/);
 assert.match(shell,/id="atlas-main"/);
 assert.match(index,/class="skip-link"/);
});

test('design system supports explicit light and dark themes',()=>{
 const theme=read('src/design/theme.css');
 assert.match(theme,/data-theme="dark"/);
 assert.match(theme,/prefers-color-scheme:\s*dark/);
 assert.match(theme,/\.skip-link:not\(:focus\)/);
});

test('global-search deep links are consumed by destination pages',()=>{
 const subdomain=read('src/pages/SubdomainPage.tsx');
 const learning=read('src/pages/LearningPage.tsx');
 const operations=read('src/pages/OperationsPage.tsx');
 assert.match(subdomain,/useSearchParams/);
 assert.match(subdomain,/entity/);
 assert.match(learning,/useSearchParams/);
 assert.match(learning,/item/);
 assert.match(operations,/useSearchParams/);
 assert.match(operations,/run|event/);
});
