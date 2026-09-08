import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const vite=fs.readFileSync(new URL('../vite.config.ts',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

test('Vercel builds Vite dist while preserving Node API functions',()=>{
 const json=JSON.stringify(vercel);
 assert.match(json,/@vercel\/static-build/);
 assert.match(json,/dist/);
 assert.match(json,/api\/runner\.js/);
 assert.match(json,/api\/runtime-orphans\.js/);
 assert.equal(pkg.scripts.build,'vite build');
 assert.match(vite,/defineConfig/);
 assert.match(vite,/outDir:\s*['"]dist['"]/);
});
