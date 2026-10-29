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
 'contracts/OLYMPUS_DOMAIN_ROUTING_V1.json':{owner_domain:'OLYMPUS',domain_surface:'02_DOMAINS/Bodybuilding/'},
 'entities/interdomain/SURFACE.json':{id:'SURFACE',source_domains:['Bodybuilding'],target_domains:['Bodybuilding']},
 'evolution/board.json':{posts:[
  {id:'ROOT',at:'2025-12-31T12:00:00Z',from:'ENGINEER',to:'EXECUTOR',text:'Synthetic exact canonical board question',refs:['TEST-01'],private:true},
  {id:'REPLY',at:'2025-12-31T13:00:00Z',from:'EXECUTOR',to:'ENGINEER',text:'Synthetic exact canonical board answer',reply_to:'ROOT',refs:[],private:true},
  {id:'EXPIRED',at:'2025-12-30T12:00:00Z',expires_at:'2025-12-31T12:00:00Z',from:'LEARNER',to:'ENGINEER',text:'Synthetic expired private message',refs:[],private:true},
 ]},
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
await mkdir('/tmp/atlas-private-repair-qa',{recursive:true});
try {
 for(const width of [360,768,1280]) {
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<720}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/#/cockpit/comando');await page.locator('.atlas-private-frame').waitFor();
  const frame=page.frames().find(f=>f.url().includes('/api/atlas-private-ui'));await frame.getByRole('heading',{name:'Operação',exact:true}).waitFor();
  assert.equal(await frame.locator('.pw-legacy,.pw-legacy-return,.observatory').count(),0);
  await frame.locator('.pw-header nav').getByRole('link',{name:'Mural',exact:true}).click();await frame.getByRole('heading',{name:'Mural dos agentes',exact:true}).waitFor();
  assert.equal(await frame.locator('.pw-board-post').count(),3);await frame.getByText('Synthetic exact canonical board answer',{exact:true}).waitFor();
  assert.equal(await frame.locator('[data-post-id=ROOT]').getByText('Respondido',{exact:true}).count(),1);
  await frame.getByRole('searchbox').fill('expired');assert.equal(await frame.locator('.pw-board-post').count(),1);await frame.getByRole('searchbox').fill('');
  await frame.getByLabel('Agente',{exact:true}).selectOption('LEARNER');assert.equal(await frame.locator('.pw-board-post').count(),1);await frame.getByLabel('Agente',{exact:true}).selectOption('');
  await frame.getByLabel('Estado registrado',{exact:true}).selectOption('expired');assert.equal(await frame.locator('.pw-board-post').count(),1);await frame.getByLabel('Estado registrado',{exact:true}).selectOption('all');
  const sizes=await frame.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,content:document.querySelector('.pw-content').clientWidth,contentScroll:document.querySelector('.pw-content').scrollWidth,nav:[...document.querySelectorAll('.pw-header nav a')].map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height}))}));
  assert.ok(sizes.scroll<=sizes.width&&sizes.contentScroll<=sizes.content,JSON.stringify(sizes));assert.ok(sizes.nav.every(x=>x.w>=44&&x.h>=44),JSON.stringify(sizes));
  await page.screenshot({path:`/tmp/atlas-private-repair-qa/board-${width}.png`});
  await frame.locator('[data-post-id=ROOT]').getByRole('link',{name:'TEST-01',exact:true}).click();await frame.getByRole('heading',{name:'Synthetic private test',exact:true}).waitFor();
  await frame.evaluate(()=>history.back());await frame.getByRole('heading',{name:'Mural dos agentes',exact:true}).waitFor();
  await frame.evaluate(()=>{location.hash='#/cockpit/ciencia?tab=mural';});await frame.getByRole('heading',{name:'Mural dos agentes',exact:true}).waitFor();await page.waitForTimeout(50);assert.equal(await frame.evaluate(()=>location.hash),'#/teia/mural');
  await frame.locator('.pw-header nav').getByRole('link',{name:'Domínios',exact:true}).click();await frame.locator('.pw-index').waitFor();
  assert.equal(await frame.locator('.pw-index h2').filter({hasText:'Olympus'}).count(),1);assert.equal(await frame.locator('.pw-index h2').filter({hasText:'Fisiculturismo'}).count(),0);
  await frame.evaluate(()=>{location.hash='#/teia/dominio/Bodybuilding';});await frame.getByRole('heading',{name:'Olympus',exact:true}).waitFor();assert.equal(await frame.locator('.pw-rows > li').count(),1);
  await page.screenshot({path:`/tmp/atlas-private-repair-qa/surface-${width}.png`});
  await page.getByRole('button',{name:'Sair',exact:true}).click();assert.equal(await page.locator('.atlas-private-frame').count(),0);
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS current routes, canonical mural, search/role/status, test links, back navigation, legacy migration, alias navigation, logout teardown at 360/768/1280; no overflow or browser errors.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
