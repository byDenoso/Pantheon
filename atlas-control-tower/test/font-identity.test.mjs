import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=(p)=>fs.readFileSync(new URL(p,root),'utf8');

test('vNext bundles Recursive Variable and uses it as its primary UI typeface',()=>{
 const main=read('src/main.tsx');
 const tokens=read('src/design/tokens.css');
 assert.match(main,/@fontsource-variable\/recursive/);
 assert.match(tokens,/Recursive Variable/);
 assert.doesNotMatch(tokens,/font-family:Inter/);
});
