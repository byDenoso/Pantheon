// Local synthetic UI verification; no credentials or real private records.
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {makePrivateRuntimeFixture} from './helpers/private-runtime.fixture.mjs';
import {memoryFixture} from './helpers/memory.fixture.mjs';
import {memoryRoute} from '../worker/memory.mjs';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
const runtime=makePrivateRuntimeFixture(),tower=memoryFixture();
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
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']}),errors=[],report=[];
await mkdir('/workspace/shared/atlas-mobile-qa',{recursive:true});
try{
 for(const width of [360,390,430,1280]){
  const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,isMobile:width<720,hasTouch:width<720,colorScheme:'dark'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/#/teia/dominios');await page.locator('.atlas-private-frame').waitFor();
  const frame=page.frames().find(f=>f.url().includes('/api/atlas-private-ui'));await frame.locator('.pw-index').waitFor();
  await page.screenshot({path:`/workspace/shared/atlas-mobile-qa/private-${width}.png`});
  const metrics=await page.evaluate(()=>({outerScroll:document.documentElement.scrollWidth,outerWidth:innerWidth,header:document.querySelector('.atlas-header').getBoundingClientRect().height,frame:document.querySelector('iframe').getBoundingClientRect().height}));
  assert.ok(metrics.outerScroll<=width,`outer overflow ${width}`);if(width<720)assert.ok(metrics.frame>=700,`frame too short ${width}: ${metrics.frame}`);
  const check=async name=>{const m=await frame.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth,content:document.querySelector('.pw-content')?.clientWidth,innerScroll:document.querySelector('.pw-content')?.scrollWidth,nav:[...document.querySelectorAll('.pw-header nav a')].map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})),scrollTop:document.querySelector('.pw-content')?.scrollTop}));assert.ok(m.scroll<=m.w&&m.innerScroll<=m.content,`inner overflow ${name} ${width}: ${JSON.stringify(m)}`);assert.ok(m.nav.every(x=>x.w>=44&&x.h>=44),`touch nav ${width}`);report.push({width,name,...m,...metrics});};
  await check('domains');
  if(width<720){await page.getByRole('button',{name:/Opções/}).click();await page.getByRole('group',{name:'Tema'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:/Opções/}).getAttribute('aria-expanded'),'false');}
  const nav=frame.locator('.pw-header nav');
  await nav.getByRole('link',{name:'Testes',exact:true}).click();await frame.getByRole('heading',{name:'Testes',exact:true}).waitFor();await check('tests');
  await frame.getByRole('searchbox').fill('Synthetic');await frame.getByRole('link',{name:'Synthetic private test',exact:true}).click();await frame.getByRole('heading',{name:'Synthetic private test',exact:true}).waitFor();await check('detail');
  await nav.getByRole('link',{name:'Operação',exact:true}).click();await frame.locator('[data-private-heading]').waitFor();await check('operations');
  await nav.getByRole('link',{name:'Memória',exact:true}).click();await frame.getByRole('heading',{name:'Histórico e aprendizados',exact:true}).waitFor();await check('memory');
  await nav.getByRole('link',{name:'Teia',exact:true}).click();await frame.locator('.tc-stage').waitFor();await check('web');
  await frame.getByRole('button',{name:/^Filtros/}).click();await frame.getByRole('button',{name:/Fechar filtros/}).click();
  await frame.getByRole('combobox',{name:'Procurar por rótulo ou ID'}).fill('Synthetic');await frame.getByRole('option').first().click();await frame.locator('.tc-side').waitFor();await frame.getByRole('button',{name:/Fechar painel/}).click();
  await page.screenshot({path:`/workspace/shared/atlas-mobile-qa/web-${width}.png`});
  await page.goto(origin);await page.getByRole('heading',{level:1}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`/workspace/shared/atlas-mobile-qa/public-${width}.png`});
  await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile('/workspace/shared/atlas-mobile-qa/report.json',JSON.stringify(report,null,2));console.log('PASS mobile 360/390/430 + desktop: public, shell menu/Escape, private five routes, detail, touch targets, no overflow, search, filter/panel open and close.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
