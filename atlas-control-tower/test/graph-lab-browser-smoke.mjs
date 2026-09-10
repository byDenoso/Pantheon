import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../graph-lab');
const MIME=new Map([['.html','text/html; charset=utf-8'],['.mjs','text/javascript; charset=utf-8'],['.js','text/javascript; charset=utf-8'],['.css','text/css; charset=utf-8'],['.json','application/json; charset=utf-8'],['.svg','image/svg+xml']]);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port))})})}
async function startStaticServer(){
 const server=createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(pathname==='/favicon.ico'){res.writeHead(204,{'cache-control':'no-store'});res.end();return}
   const requested=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
   const file=path.resolve(root,requested);
   if(!file.startsWith(root+path.sep)&&file!==path.join(root,'index.html'))throw new Error('path escape');
   const info=await stat(file);if(!info.isFile())throw new Error('not file');
   res.writeHead(200,{'content-type':MIME.get(path.extname(file))||'application/octet-stream','cache-control':'no-store'});res.end(await readFile(file));
  }catch{res.writeHead(404,{'content-type':'text/plain'});res.end('not found')}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 return{server,base:`http://127.0.0.1:${server.address().port}`};
}

function findChrome(){return[process.env.CHROME_BIN,process.env.GOOGLE_CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(existsSync)||null}
class Cdp{
 constructor(wsUrl){this.wsUrl=wsUrl;this.id=0;this.pending=new Map();this.events=new Map()}
 async connect(){this.socket=new WebSocket(this.wsUrl);await new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve,{once:true});this.socket.addEventListener('error',reject,{once:true})});this.socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const waiter=this.pending.get(msg.id);if(!waiter)return;this.pending.delete(msg.id);msg.error?waiter.reject(new Error(msg.error.message)):waiter.resolve(msg.result);return}for(const fn of this.events.get(msg.method)||[])fn(msg.params)})}
 send(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}))})}
 on(method,fn){const list=this.events.get(method)||[];list.push(fn);this.events.set(method,list)}
 close(){try{this.socket?.close()}catch{}}
}
async function openPage(debugPort,{width=1440,height=1000,reducedMotion=false}={}){
 const target=await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());const cdp=new Cdp(target.webSocketDebuggerUrl);await cdp.connect();
 await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Log.enable');await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=760});
 if(reducedMotion)await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 const errors=[];cdp.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails?.text||e.exceptionDetails?.exception?.description||'Runtime exception'));cdp.on('Log.entryAdded',e=>{if(e.entry?.level==='error'&&!/favicon/i.test(`${e.entry?.url||''} ${e.entry?.text||''}`))errors.push(`error: ${e.entry?.url||e.entry?.text}`)});
 return{cdp,errors,targetId:target.id};
}
async function evaluate(cdp,expression){const result=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text||'evaluation failed');return result.result?.value}
async function waitFor(cdp,expression,{timeout=15000,label=expression}={}){const started=Date.now();let last;while(Date.now()-started<timeout){try{last=await evaluate(cdp,expression);if(last)return last}catch(error){last=error.message}await delay(120)}throw new Error(`Timed out waiting for ${label}; last=${String(last)}`)}
async function navigate(page,url){await page.cdp.send('Page.navigate',{url});await waitFor(page.cdp,"document.readyState==='complete'",{timeout:15000,label:'document complete'})}
async function closePage(page){await page.cdp.send('Target.closeTarget',{targetId:page.targetId}).catch(()=>{});page.cdp.close()}

const renderers=[
 {id:'canvas-2d',base:'legacy-canvas',selector:'#graph-lab-canvas:not([hidden])'},
 {id:'pixi-2d',base:'legacy-canvas',selector:'.atlas-pixi-canvas'},
 {id:'three-25d',base:'three-canvas',selector:'.graph-gl'},
 {id:'babylon-25d',base:'three-canvas',selector:'.atlas-babylon-canvas'}
];
async function smokeRenderer(debugPort,baseUrl,item){
 const page=await openPage(debugPort);try{
  await navigate(page,`${baseUrl}/?demo=1&experience=OPERATIONAL&renderer-v4=${item.id}&renderer=${item.base}`);
  await waitFor(page.cdp,`globalThis.__ATLAS_RENDERER_RUNTIME?.graphRendererId===${JSON.stringify(item.id)}`,{timeout:20000,label:`runtime ${item.id}`});
  await waitFor(page.cdp,`Boolean(document.querySelector(${JSON.stringify(item.selector)}))`,{timeout:20000,label:`surface ${item.id}`});
  await waitFor(page.cdp,"Number(document.querySelector('#hud-nodes')?.textContent||0)>0",{timeout:20000,label:`nodes ${item.id}`});
  const initial=await evaluate(page.cdp,"Number(document.querySelector('#stage-nodes')?.textContent||0)");await evaluate(page.cdp,"document.querySelector('#expand-all')?.click(); true");
  await waitFor(page.cdp,`Number(document.querySelector('#stage-nodes')?.textContent||0)>${initial}`,{timeout:10000,label:`projection refresh ${item.id}`});
  assert.equal(await evaluate(page.cdp,"document.documentElement.dataset.atlasRenderer"),item.id);assert.deepEqual(page.errors,[],`${item.id}: ${page.errors.join(' | ')}`);
 }finally{await closePage(page)}
}

async function smokeCanonical(debugPort,baseUrl){
 const page=await openPage(debugPort);try{
  await navigate(page,`${baseUrl}/?experience=OPERATIONAL&renderer-v4=canvas-2d&renderer=legacy-canvas`);await waitFor(page.cdp,"Number(document.querySelector('#hud-nodes')?.textContent||0)>=4",{timeout:30000,label:'canonical macro hierarchy'});
  const initial=await evaluate(page.cdp,"Number(document.querySelector('#stage-nodes')?.textContent||0)");await evaluate(page.cdp,"document.querySelector('#atlas-experience-bar [data-domain-target=SCIENCE]')?.click(); true");await waitFor(page.cdp,`Number(document.querySelector('#stage-nodes')?.textContent||0)>${initial}`,{timeout:12000,label:'Science expansion'});await waitFor(page.cdp,"Boolean(document.querySelector('.atlas-node-actions:not([hidden]) [data-action=open]:not([hidden])'))",{timeout:5000,label:'ABRIR affordance'});assert.deepEqual(page.errors,[]);
 }finally{await closePage(page)}
}

async function smokeAssociative(debugPort,baseUrl){
 const page=await openPage(debugPort);try{
  await navigate(page,`${baseUrl}/?experience=OPERATIONAL&renderer-v4=canvas-2d&renderer=legacy-canvas`);await waitFor(page.cdp,"String(document.querySelector('#stage-source')?.textContent||'').includes('FIL')",{timeout:30000,label:'associative projection'});assert.equal(await evaluate(page.cdp,"document.querySelectorAll('#atlas-experience-bar [data-domain-target]').length"),4);
  await evaluate(page.cdp,"document.querySelector('.atlas-filaments-toggle')?.click(); true");await evaluate(page.cdp,"(()=>{const i=document.querySelector('#hierarchy-search');i.value='SEM-CROSS-NULL-AUDIT-001';i.dispatchEvent(new Event('input',{bubbles:true}));return true})()");await waitFor(page.cdp,"Boolean(document.querySelector('#search-results button'))",{timeout:5000,label:'semantic search'});await evaluate(page.cdp,"document.querySelector('#search-results button')?.click(); true");await waitFor(page.cdp,"String(document.querySelector('.cockpit-summary')?.textContent||'').includes('hipóteses rivais')",{timeout:5000,label:'semantic meaning'});await waitFor(page.cdp,"String(document.querySelector('#cockpit-body')?.textContent||'').includes('peso 0.90')",{timeout:5000,label:'weight'});assert.deepEqual(page.errors,[]);
 }finally{await closePage(page)}
}

async function smokeBreakthrough(debugPort,baseUrl,{width=1440,height=1000,reducedMotion=false}={}){
 const page=await openPage(debugPort,{width,height,reducedMotion});try{
  await navigate(page,`${baseUrl}/?experience=BREAKTHROUGH&renderer-v4=canvas-25d&renderer=legacy-canvas`);
  await waitFor(page.cdp,"globalThis.__ATLAS_RENDERER_RUNTIME?.graphRendererId==='canvas-25d'",{timeout:20000,label:'Breakthrough renderer'});await waitFor(page.cdp,"document.documentElement.dataset.atlasVisual==='breakthrough'",{timeout:10000,label:'Breakthrough identity'});await waitFor(page.cdp,"Boolean(globalThis.__ATLAS_GRAPH_RENDERER&&document.querySelector('#atlas-breakthrough-lenses'))",{timeout:10000,label:'Breakthrough shell'});
  assert.equal(await evaluate(page.cdp,"document.documentElement.scrollWidth<=innerWidth"),true);assert.equal(await evaluate(page.cdp,"getComputedStyle(document.querySelector('#atlas-breakthrough-lenses')).display==='flex'"),true);
  await evaluate(page.cdp,"(()=>{const r=globalThis.__ATLAS_GRAPH_RENDERER;r.camera.zoom=.45;r.render();return true})()");await waitFor(page.cdp,"document.documentElement.dataset.atlasSemanticBand==='overview'",{timeout:5000,label:'overview zoom'});await evaluate(page.cdp,"(()=>{const r=globalThis.__ATLAS_GRAPH_RENDERER;r.camera.zoom=2.6;r.render();return true})()");await waitFor(page.cdp,"document.documentElement.dataset.atlasSemanticBand==='audit'",{timeout:5000,label:'audit zoom'});
  assert.ok(await evaluate(page.cdp,"globalThis.__ATLAS_GRAPH_RENDERER.domainFields.length>=3"),'domain fields missing');
  await evaluate(page.cdp,"document.querySelector('#atlas-breakthrough-lenses [data-atlas-lens=structure]')?.click(); true");await waitFor(page.cdp,"document.documentElement.dataset.atlasLens==='structure'",{timeout:3000,label:'Structure lens'});await evaluate(page.cdp,"document.querySelector('#atlas-breakthrough-lenses [data-atlas-lens=learning]')?.click(); true");await waitFor(page.cdp,"document.documentElement.dataset.atlasLens==='learning'",{timeout:3000,label:'Learning lens'});
  await evaluate(page.cdp,"document.querySelector('#atlas-experience-bar [data-domain-target=SCIENCE]')?.click(); true");await waitFor(page.cdp,"document.documentElement.dataset.atlasDomain==='SCIENCE'",{timeout:5000,label:'Science domain'});await waitFor(page.cdp,"Boolean(document.querySelector('.atlas-node-actions:not([hidden]) [data-action=focus]'))",{timeout:5000,label:'focus action'});await evaluate(page.cdp,"document.querySelector('.atlas-node-actions [data-action=focus]')?.click(); true");await waitFor(page.cdp,"document.documentElement.dataset.atlasFocusTunnel==='active'",{timeout:5000,label:'Focus Tunnel'});assert.equal(await evaluate(page.cdp,"document.querySelector('.atlas-node-actions [data-action=focus]')?.textContent==='LIMPAR FOCO'"),true);
  if(reducedMotion)assert.equal(await evaluate(page.cdp,"matchMedia('(prefers-reduced-motion: reduce)').matches"),true);assert.deepEqual(page.errors,[],`Breakthrough ${width}x${height}: ${page.errors.join(' | ')}`);
 }finally{await closePage(page)}
}

async function smokeMobile(debugPort,baseUrl){
 const page=await openPage(debugPort,{width:393,height:852});try{
  await navigate(page,`${baseUrl}/?experience=BREAKTHROUGH&renderer-v4=canvas-25d&renderer=legacy-canvas`);await waitFor(page.cdp,"globalThis.__ATLAS_RENDERER_RUNTIME?.graphRendererId==='canvas-25d'",{timeout:20000,label:'mobile Canvas 2.5D'});await waitFor(page.cdp,"Boolean(document.querySelector('#atlas-mobile-nav'))",{timeout:10000,label:'mobile navigation'});assert.equal(await evaluate(page.cdp,"document.documentElement.scrollWidth<=innerWidth"),true);const minTap=await evaluate(page.cdp,"Math.min(...[...document.querySelectorAll('#atlas-mobile-nav button')].map(e=>e.getBoundingClientRect().height))");assert.ok(minTap>=44,`mobile target ${minTap}px`);assert.deepEqual(page.errors,[]);
 }finally{await closePage(page)}
}

async function smokeMobileFallback(debugPort,baseUrl){const page=await openPage(debugPort,{width:390,height:844});try{await navigate(page,`${baseUrl}/?demo=1&experience=OPERATIONAL&renderer-v4=babylon-3d&renderer=three-canvas`);await waitFor(page.cdp,"globalThis.__ATLAS_RENDERER_RUNTIME?.graphRendererId==='canvas-2d'",{timeout:15000,label:'mobile fallback'});assert.equal(await evaluate(page.cdp,"document.documentElement.scrollWidth<=innerWidth"),true)}finally{await closePage(page)}}
async function stopBrowser(browser){if(browser.exitCode!==null||browser.signalCode!==null)return;let exited=false;const done=new Promise(resolve=>browser.once('exit',()=>{exited=true;resolve()}));browser.kill('SIGTERM');await Promise.race([done,delay(2500)]);if(!exited&&browser.exitCode===null){browser.kill('SIGKILL');await Promise.race([done,delay(1500)])}}
function cleanupProfile(profile){try{rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}catch(error){console.warn(`WARN Chrome profile cleanup skipped: ${error.code||error.message}`)}}

const chrome=findChrome();if(!chrome){console.error('No Chrome/Chromium binary found. Set CHROME_BIN.');process.exit(2)}
const {server,base}=await startStaticServer();const debugPort=await freePort();const profile=mkdtempSync(path.join(tmpdir(),'atlas-chrome-'));const browser=spawn(chrome,[`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','about:blank'],{stdio:['ignore','ignore','pipe']});let stderr='';browser.stderr.on('data',chunk=>stderr+=chunk.toString());
try{
 for(let i=0;i<120;i++){try{const j=await fetch(`http://127.0.0.1:${debugPort}/json/version`).then(r=>r.json());if(j.webSocketDebuggerUrl)break}catch{}if(i===119)throw new Error(`Chrome did not start: ${stderr.slice(-1000)}`);await delay(100)}
 for(const item of renderers){await smokeRenderer(debugPort,base,item);console.log(`PASS renderer ${item.id}`)}
 await smokeCanonical(debugPort,base);console.log('PASS canonical Science drill-down and ABRIR');
 await smokeAssociative(debugPort,base);console.log('PASS associative memory overlay');
 await smokeBreakthrough(debugPort,base);console.log('PASS Breakthrough Canvas 2.5D desktop');
 await smokeBreakthrough(debugPort,base,{width:393,height:852});console.log('PASS Breakthrough Canvas 2.5D mobile');
 await smokeBreakthrough(debugPort,base,{reducedMotion:true});console.log('PASS Breakthrough reduced motion');
 await smokeMobile(debugPort,base);console.log('PASS mobile 393x852 Atlas UX');
 await smokeMobileFallback(debugPort,base);console.log('PASS mobile heavy-renderer fallback');
 console.log('PASS Graph Lab browser smoke');
}finally{await stopBrowser(browser);await new Promise(resolve=>server.close(resolve));cleanupProfile(profile)}
