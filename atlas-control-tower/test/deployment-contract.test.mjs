import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const routes=vercel.routes||[];
const builds=vercel.builds||[];

test('Vercel uses the Vite static build and retains serverless APIs',()=>{
  assert.ok(builds.some(x=>x.src==='package.json'&&x.use==='@vercel/static-build'));
  for(const api of ['api/projection.js','api/runner.js','api/runtime-orphans.js']){
    assert.ok(builds.some(x=>x.src===api&&x.use==='@vercel/node'),`missing ${api}`);
  }
});

test('API rewrites execute before static filesystem handling',()=>{
  const fsIndex=routes.findIndex(x=>x.handle==='filesystem');
  const apiIndex=routes.findIndex(x=>String(x.src||'').startsWith('/api/'));
  assert.ok(apiIndex>=0&&fsIndex>apiIndex);
});

test('SPA fallback serves index with normal 200 semantics',()=>{
  const fallback=routes.at(-1);
  assert.equal(fallback?.src,'/(.*)');
  assert.equal(fallback?.dest,'/index.html');
  assert.equal(fallback?.status,undefined);
});

test('scheduled state refresh remains declared',()=>{
  assert.deepEqual(vercel.crons,[{path:'/api/state?refresh=1',schedule:'0 8 * * *'}]);
});