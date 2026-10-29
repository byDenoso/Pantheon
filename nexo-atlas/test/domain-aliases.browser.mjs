// Local synthetic UI verification; no credentials or real private records.
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';
import {memoryFixture} from './helpers/memory.fixture.mjs';
import {memoryRoute} from '../worker/memory.mjs';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
const input=makePrivateTowerFixture(),tower=memoryFixture();
for(const [path,value] of Object.entries({
 'contracts/SCIENCE_DOMAIN_ROUTING_V1.json':{owner_domain:'SCIENCE',subdomains:['COSMOLOGY']},
 'entities/test/C1.json':{id:'C1',kind:'TEST',domain:'SCIENCE',display_name:'Synthetic inherited cosmology',status:'READY',semantic:{subdomain_id:'science.cosmology.h0'}},
 'entities/test/C2.json':{id:'C2',kind:'TEST',domain:'Cosmologia',display_name:'Synthetic Portuguese cosmology',status:'READY'},
 'entities/test/C3.json':{id:'C3',kind:'TEST',domain:'COSMOLOGY',display_name:'Synthetic English cosmology',status:'RETIRED'},
}))input.files[path]={encoding:'json',value};
input.file_count=Object.keys(input.files).length;
const runtime=compilePrivateTowerRuntime(input);

const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 const json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
 if(u.pathname==='/api/atlas-access')return json({signedIn:true,owner:true,setupRequired:false});
 if(u.pathname==='/api/atlas-session')return json(req.method==='DELETE'?{authenticated:false}:{configured:true,authenticated:true,expiresAt:new Date(Date.now()+3600000).toISOString()});
 if(u.pathname==='/api/atlas-private')return json(runtime);
 if(u.pathname==='/api/atlas-public')return json(publicAtlasProjection());
 if(u.pathname==='/api/atlas-locale')return json({contract:'ATLAS_LOCALE_V1',locale:u.searchParams.get('lang')||'pt-BR',source:'preference',supported:['pt-BR','en']});
 if(u.pathname.startsWith('/api/atlas-memory/')){const chunks=[];for await(const c of req)chunks.push(c);const result=await memoryRoute(u.pathname,JSON.parse(Buffer.concat(chunks).toString()||'{}'),async()=>tower);res.statusCode=result.status;return json(result.body);}
 if(u.pathname.startsWith('/api/atlas-knowledge/')){res.statusCode=503;return json({error:'KNOWLEDGE_UNAVAILABLE'});}
 let root='dist/client',path=u.pathname==='/'?'index.html':u.pathname.slice(1);
 if(u.pathname==='/api/atlas-private-ui'){root='server/private-ui';path='index.html';}
 else if(u.pathname.startsWith('/api/atlas-private-assets/')){root='server/private-ui';path=u.pathname.replace('/api/atlas-private-assets/','');}
 if(!/^(index\.html|assets\/[A-Za-z0-9_.-]+)$/.test(path)){res.statusCode=404;return res.end();}
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(await readFile(resolve(root,path)));}catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']}),errors=[];
await mkdir('/tmp/atlas-domain-qa',{recursive:true});
try {
 for(const width of [360,1280]) {
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<720}), page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/#/teia/dominios');await page.locator('.atlas-private-frame').waitFor();
  const frame=page.frames().find(f=>f.url().includes('/api/atlas-private-ui'));await frame.locator('.pw-index').waitFor();
  const card=frame.locator('.pw-index > li').filter({has:frame.getByRole('heading',{name:'Cosmologia',exact:false})});
  assert.equal(await card.count(),1);assert.match(await card.innerText(),/3 testes/);assert.match(await card.innerText(),/2 diretos/);assert.match(await card.innerText(),/1 por vínculos/);assert.match(await card.innerText(),/arquivados ou retirados/);
  await page.screenshot({path:`/tmp/atlas-domain-qa/domains-${width}.png`});
  await card.getByRole('link',{name:/Cosmologia/}).click();await frame.getByRole('heading',{name:'Cosmologia',exact:true}).waitFor();
  assert.equal(await frame.locator('.pw-rows > li').count(),3);
  await frame.getByRole('searchbox').fill('Cosmologia');assert.equal(await frame.locator('.pw-rows > li').count(),3);
  await page.screenshot({path:`/tmp/atlas-domain-qa/cosmology-${width}.png`});
  assert.ok(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await frame.evaluate(()=>{location.hash='#/teia/dominio/Cosmologia';});await frame.getByRole('heading',{name:'Cosmologia',exact:true}).waitFor();assert.equal(await frame.locator('.pw-rows > li').count(),3);
  await frame.getByRole('link',{name:'Domínios',exact:true}).first().click();await frame.locator('.pw-index').waitFor();
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS aliases and explicit descendant counts, search and repeated route at 360px and 1280px; no overflow or browser errors.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
