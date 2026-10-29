import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorker} from '../worker/index.mjs';
const routes=['/metodo.html','/publicacoes.html','/site-config.json','/publications.json','/robots.txt','/sitemap.xml','/assets/fonts/nexo-barlow-medium.ttf','/assets/fonts/nexo-barlow-regular.ttf','/assets/fonts/nexo-nunito-black.ttf','/assets/fonts/FONT-LICENSES.txt'];
test('new public routes reach only explicit static files; private and source paths stay guarded',async()=>{
 const seen=[];const worker=createWorker();const env={ASSETS:{fetch:async r=>{seen.push(new URL(r.url).pathname);return new Response('STATIC');}}};
 for(const p of routes){assert.ok(readFileSync('public-extra'+p).length);for(const method of ['GET','HEAD'])assert.equal((await worker.fetch(new Request('https://example.test'+p,{method}),env,{})).status,200);assert.equal((await worker.fetch(new Request('https://example.test'+p,{method:'POST'}),env,{})).status,405);}
 for(const p of ['/worker/public-tests.json','/public-extra/site-config.json','/assets/fonts/secret.txt','/.env','/server/private-ui/index.html'])assert.equal((await worker.fetch(new Request('https://example.test'+p),env,{})).status,404);
 const n=seen.length;assert.equal((await worker.fetch(new Request('https://example.test/api/atlas-private'),env,{})).status,401);assert.equal(seen.length,n);
});
test('public config matches structured identity and publication list has explicit schema',()=>{
 const c=JSON.parse(readFileSync('public-extra/site-config.json'));const h=readFileSync('index.html','utf8');assert.ok(h.includes(c.orcid));assert.equal(c.email,'phys@denerpereira.com.br');assert.deepEqual(JSON.parse(readFileSync('public-extra/publications.json')),{items:[]});
});
test('publications navigation is temporarily hidden while content is preserved',()=>{
 for(const file of ['metodo.html','publicacoes.html'])assert.doesNotMatch(readFileSync('public-extra/'+file,'utf8'),/href="\/publicacoes\.html"/);
 assert.doesNotMatch(readFileSync('public-extra/assets/nexo-footer.js','utf8'),/link\('\/publicacoes\.html'/);
 assert.doesNotMatch(readFileSync('public-extra/sitemap.xml','utf8'),/publicacoes\.html/);
 assert.ok(readFileSync('public-extra/publicacoes.html').length);
});
