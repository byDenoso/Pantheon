// Local synthetic browser verification. Never connects to the real Tower.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {memoryFixture} from './helpers/memory.fixture.mjs';
import {makePrivateRuntimeFixture} from './helpers/private-runtime.fixture.mjs';
import {memoryRoute} from '../worker/memory.mjs';
let expire=false,conflict=false,proposals=0;
const runtime=makePrivateRuntimeFixture().data,tower=memoryFixture();
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/'){
  res.setHeader('Content-Type','text/html');res.end(`<html lang="pt-BR"><head><style>body{margin:0}iframe{border:0;width:100vw;height:100vh}</style></head><body><iframe id="private" src="/api/atlas-private-ui#/teia/memoria"></iframe><script>window.addEventListener('message',e=>{const frame=document.getElementById('private');if(e.source===frame.contentWindow&&e.origin===location.origin&&e.data?.type==='READY'){frame.contentWindow.postMessage({channel:'atlas-private-host',type:'RUNTIME',data:${JSON.stringify(runtime)}},location.origin)}if(e.data?.type==='SESSION_ACTION'){window.loggedOut=true;frame.remove()}})</script></body></html>`);return;
 }
 if(url.pathname.startsWith('/api/atlas-memory/')){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');
  if(url.pathname.endsWith('/propose'))proposals++;
  const result=expire?{status:401,body:{error:'AUTH_REQUIRED'}}:conflict&&url.pathname.endsWith('/propose')?{status:409,body:{error:'MEMORY_REVISION_CONFLICT'}}:await memoryRoute(url.pathname,body,async()=>tower);
  res.statusCode=result.status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result.body));return;
 }
 let path=url.pathname==='/api/atlas-private-ui'?'index.html':url.pathname.replace(/^\/api\/atlas-private-assets\//,'');
 if(!/^(index\.html|assets\/[A-Za-z0-9_.-]+)$/.test(path)){res.statusCode=404;res.end('not found');return;}
 try{const value=await readFile(resolve('server/private-ui',path));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'})[extname(path)]||'application/octet-stream');res.end(value);}catch{res.statusCode=404;res.end('not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/`);const f=page.frameLocator('#private');
 await f.getByRole('button',{name:'Registros e rascunhos',exact:true}).click();
 await f.getByRole('heading',{name:'Histórico e aprendizados',exact:true}).waitFor();
 await f.getByLabel('Buscar nos registros').fill('expansion');await f.getByRole('button',{name:'Buscar',exact:true}).click();
 await f.getByLabel('Tipo de registro',{exact:true}).selectOption('TEST');await f.getByRole('button',{name:'Buscar',exact:true}).click();
 await f.getByRole('heading',{name:/Expansion cosmologique/}).waitFor();
 assert.equal(await f.getByRole('button',{name:/Expansion cosmologique.*Abrir registro/}).count(),1);
 await f.getByRole('button',{name:/Expansion cosmologique.*Abrir registro/}).click();await f.getByRole('button',{name:'Adicionar anotação ou correção',exact:true}).click();
 await f.getByLabel('Sua anotação',{exact:true}).fill('Rever interpretação com outra amostra.');await f.getByLabel('Motivo da alteração',{exact:true}).fill('Amostra pequena.');
 await f.getByRole('button',{name:'Preparar revisão',exact:true}).click();await f.getByRole('heading',{name:'Proposta preparada, ainda não salva',exact:true}).waitFor();
 assert.equal(await f.getByRole('button',{name:/Salvar|Gravar|Save|Apply/}).count(),0);await f.getByText('Nada foi gravado. Este rascunho existe só enquanto esta visão estiver aberta.').waitFor();assert.equal(proposals,1);
 await f.getByLabel('Sua anotação',{exact:true}).fill('Rascunho revisado');assert.equal(await f.getByRole('heading',{name:'Proposta preparada, ainda não salva',exact:true}).count(),0);
 conflict=true;await f.getByRole('button',{name:'Preparar revisão',exact:true}).click();await f.getByRole('alert').filter({hasText:'A fonte mudou'}).waitFor();assert.equal(await f.getByLabel('Sua anotação',{exact:true}).inputValue(),'Rascunho revisado');
 await f.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(await f.getByLabel('Sua anotação',{exact:true}).count(),0);
 await f.getByRole('button',{name:/Voltar à lista/}).click();
 await page.setViewportSize({width:390,height:844});
 const child=page.frames().find(x=>x.url().includes('atlas-private-ui'));assert.ok(await child.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/workspace/shared/atlas-memory-mobile.png',fullPage:true});
 await f.getByRole('link',{name:'Testes',exact:true}).click();await f.getByRole('link',{name:'Memória',exact:true}).click();await f.getByRole('button',{name:'Registros e rascunhos',exact:true}).click();await f.getByRole('heading',{name:'Histórico e aprendizados',exact:true}).waitFor();
 expire=true;await f.getByRole('button',{name:'Buscar',exact:true}).click();await page.waitForFunction(()=>window.loggedOut===true);assert.equal(await page.locator('iframe').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: browse/filter, citation detail, draft review, edit invalidation, CAS conflict, cancel, private navigation, mobile overflow, expired-session teardown; no browser errors.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
