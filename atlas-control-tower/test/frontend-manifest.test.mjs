import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const vercel=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const builds=vercel.builds||[];

test('Vite React owns the public frontend entrypoint',()=>{
  assert.match(index,/id="root"/);
  assert.match(index,/src="\/src\/main\.tsx"/);
  for(const legacy of ['/app.mjs','/graph3d.mjs','/ui/premium-v2.css','/ui/reference-one.css']){
    assert.doesNotMatch(index,new RegExp(legacy.replace(/[./]/g,m=>'\\'+m)));
  }
});

test('Vercel deploys dist instead of enumerating legacy UI assets',()=>{
  assert.ok(builds.some(x=>x.src==='package.json'&&x.use==='@vercel/static-build'));
  for(const legacy of ['app.mjs','graph3d.mjs','ui/premium-v2.css','ui/reference-one.css']){
    assert.equal(builds.some(x=>x.src===legacy),false,`legacy build still declared: ${legacy}`);
  }
});