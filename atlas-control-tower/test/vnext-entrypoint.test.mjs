import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const vercel=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));

test('vNext root is a Vite React entrypoint',()=>{
  assert.ok(pkg.dependencies['react-router-dom'],'react-router-dom dependency missing');
  assert.match(index,/id="root"/);
  assert.match(index,/\/src\/main\.tsx/);
  assert.doesNotMatch(index,/\/app\.mjs/);
});

test('Vercel builds Vite dist while preserving API functions',()=>{
  const builds=vercel.builds||[];
  assert.ok(builds.some(x=>x.src==='package.json'&&x.use==='@vercel/static-build'));
  assert.ok(builds.some(x=>x.src==='api/runtime-orphans.js'&&x.use==='@vercel/node'));
});

test('SPA deep links fall back to index without a 404 status',()=>{
  const routes=vercel.routes||[];
  const fallback=routes.at(-1);
  assert.equal(fallback?.dest,'/index.html');
  assert.equal(fallback?.status,undefined);
});