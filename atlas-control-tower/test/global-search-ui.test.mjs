import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component=()=>readFileSync(new URL('../src/components/GlobalSearch.tsx',import.meta.url),'utf8');
const shell=()=>readFileSync(new URL('../src/app/AppShell.tsx',import.meta.url),'utf8');

test('shell owns one global search trigger instead of a decorative placeholder',()=>{
 assert.match(shell(),/GlobalSearch/);
 assert.doesNotMatch(shell(),/<div className="nexo-search">/);
});

test('global search supports keyboard opening, resilient loading and route navigation',()=>{
 const src=component();
 assert.match(src,/loadGlobalSearchSources/);
 assert.match(src,/buildGlobalSearchModel/);
 assert.match(src,/useNavigate/);
 assert.match(src,/metaKey|ctrlKey/);
 assert.match(src,/Escape/);
 assert.match(src,/role="dialog"/);
 assert.match(src,/Buscar no Atlas/);
});
