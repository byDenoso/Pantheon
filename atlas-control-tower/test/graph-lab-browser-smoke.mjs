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

async function freePort(){return await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port))})})}
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
 const {port}=server.address();return{server,base:`http://127.0.0.1:${port}`};
}

function findChrome(){const candidates=[process.env.CHROME_BIN,process.env.GOOGLE_CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);return candidates.find(existsSync)||null}
class Cdp{
 constructor(wsUrl){this.wsUrl=wsUrl;this.id=0;this.pending=new Map();this.events=new Map();this.socket=null}
 async connect(){this.socket=new WebSocket(this.wsUrl);await new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve,{once:true});this.socket.addEventListener('error',reject,{once:true})});this.socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const waiter=this.pending.get(msg.id);if(!waiter)return;this.pending.delete(msg.id);msg.error?waiter.reject(new Error(msg.error.message)):waiter.resolve(msg.result);return}for(const fn of this.events.get(msg.method)||[])fn(msg.params)})}
 send(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}))})}
 on(method,fn){const list=this.events.get(method)||[];list.push(fn);this.events.set(method,list)}
 close(){try{this.socket?.close()}catch{}}
}
async function openPage(debugPort,{width=1440,height=1000}={}){
 const created=await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());const cdp=new Cdp(created.webSocketDebuggerUrl);await cdp.connect();
 await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Log.enable');await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=760});
 const errors=[];cdp.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails?.text||event.exceptionDetails?.exception?.description||'Runtime exception'));cdp.on('Log.entryAdded',event=>{if(event.entry?.level==='error'&&!/favicon/i.test(`${event.entry?.url||''} ${event.entry?.text||''}`))errors.push(`error: ${event.entry?.url||event.entry?.text}`)});
 return{cdp,errors,targetId:created.id};
}
async function evaluate(cdp,expression){const result=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text||'evaluation failed');return result.result?.value}
async function waitFor(cdp,expression,{timeout=15000,label=expression}={}){const started=Date.now();let last;while(Date.now()-started<timeout){try{last=await evaluate(cdp,expression);if(last)return last}catch(error){last=error.message}await delay(120)}throw new Error(`Timed out waiting for ${label}; last=${String(last)}`)}
async function navigate(page,url){await page.cdp.send('Page.navigate',{url});await waitFor(page.cdp,"document.readyState==='complete'",{timeout:15000,label:'document complete'})}
async function closePage(page){await page.cdp.send('Target.closeTarget',{targetId:page.targetId}).catch(()=>{});page.cdp.close()}

const cases=[
 {id:'canvas-2d',base:'legacy-canvas',selector:'#graph-lab-canvas:not([hidden])'},
 {id:'pixi-2d',base:'legacy-canvas',selector:'.atlas-pixi-canvas'},
 {id:'three-25d',base:'three-canvas',selector:'.graph-gl'},
 {id:'babylon-25d',base:'three-canvas',selector:'.atlas-babylon-canvas'}
];
async function smokeRenderer(debugPort,baseUrl,testCase){
 const page=await openPage(debugPort,{width:1440,height:1000});try{
  const url=`${baseUrl}/?demo=1&experience=OPERATIONAL&renderer-v4=${encodeURIComponent(testCase.id)}&renderer=${encodeURIComponent(testCase.base)}`;await navigate(page,url);
  await waitFor(page.cdp,`globalThis.__ATLAS_RENDERER_RUNTIME?.graphRendererId===${JSON.stringify(testCase.id)}`,{timeout:20000,label:`runtime ${testCase.id}`});await waitFor(page.cdp,`Boolean(document.querySelector(${JSON.stringify(testCase.selector)}))`,{timeout:20000,label:`surface ${testCase.id}`});await waitFor(page.cdp,"Number(document.querySelector('#hud-nodes')?.textContent||0)>0",{timeout:20000,label:`nodes ${testCase.id}`});
  const initial=await evaluate(page.cdp,"Number(document.querySelector('#hud-nodes')?.textContent||0)");await evaluate(page.cdp,"document.querySelector('#expand-all')?.click(); true");await waitFor(page.cdp,`Number(document.querySelector('#hud-nodes')?.textContent||0)>${initial}`,{timeout:10000,label:`renderer refresh ${testCase.id}`});
  const actual=await evaluate(page.cdp,"document.documentElement.dataset.atlasRenderer");assert.equal(actual,testCase.id,`${testCase.id} runtime drifted to ${actual}`);assert.deepEqual(page.errors,[],`${testCase.id} emitted browser errors: ${page.errors.join(' | ')}`);
 }finally{await closePage(page)}
}

async function smokeCanonicalHierarchy(debugPort,baseUrl){
 const page=await openPage(debugPort,{width:1440,height:1000});try{
  const url=`${baseUrl}/?experience=OPERATIONAL&renderer-v4=canvas-2d&renderer=legacy-canvas`;await navigate(page,url);await waitFor(page.cdp,"globalThis.__ATLAS_RENDERER_RUNTIME?.graphRendererId==='canvas-2d'",{timeout:15000,label:'canonical Canvas runtime'});await waitFor(page.cdp,"Number(document.querySelector('#hud-nodes')?.textContent||0)>=4",{timeout:25000,label:'canonical macro hierarchy'});
  const initial=await evaluate(page.cdp,"Number(document.querySelector('#hud-nodes')?.textContent||0)");assert.equal(await evaluate(page.cdp,"Boolean(document.querySelector('#atlas-experience-bar [data-domain-target=SCIENCE]'))"),true,'Science macro navigation is missing');await evaluate(page.cdp,"document.querySelector('#atlas-experience-bar [data-domain-target=SCIENCE]')?.click(); true");await waitFor(page.cdp,`Number(document.querySelector('#hud-nodes')?.textContent||0)>${initial}`,{timeout:12000,label:'Science canonical expansion'});await waitFor(page.cdp,"Boolean(document.querySelector('.atlas-node-actions:not([hidden]) [data-action=open]:not([hidden])'))",{timeout:5000,label:'explicit graph open affordance'});assert.deepEqual(page.errors,[],`canonical hierarchy emitted browser errors: ${page.errors.join(' | ')}`);
 }finally{await closePage(page)}
}

async function smokeAssociativeMemory(debugPort,baseUrl){
 const page=await openPage(debugPort,{width:1440,height:1000});try{
  const url=`${baseUrl}/?experience=OPERATIONAL&renderer-v4=canvas-2d&renderer=legacy-canvas`;await navigate(page,url);await waitFor(page.cdp,"String(document.querySelector('#stage-source')?.textContent||'').includes('FIL')",{timeout:30000,label:'associative memory live or snapshot projection'});
  const before=await evaluate(page.cdp,"Number(document.querySelector('#hud-nodes')?.textContent||0)");assert.equal(await evaluate(page.cdp,"document.querySelectorAll('#atlas-experience-bar [data-domain-target]').length"),4,'associative memory must not create a fourth macro lane');await evaluate(page.cdp,"document.querySelector('.atlas-filaments-toggle')?.click(); true");await waitFor(page.cdp,`Number(document.querySelector('#hud-nodes')?.textContent||0)>${before}`,{timeout:10000,label:'associative nodes after FILAMENTOS'});
  await evaluate(page.cdp,"(()=>{const input=document.querySelector('#hierarchy-search');input.value='SEM-CROSS-NULL-AUDIT-001';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()");await waitFor(page.cdp,"Boolean(document.querySelector('#search-results button'))",{timeout:5000,label:'semantic memory search result'});await evaluate(page.cdp,"document.querySelector('#search-results button')?.click(); true");
  await waitFor(page.cdp,"String(document.querySelector('.cockpit-summary')?.textContent||'').includes('hipóteses rivais')",{timeout:5000,label:'semantic memory cockpit meaning'});await waitFor(page.cdp,"String(document.querySelector('#cockpit-body')?.textContent||'').includes('peso 0.90')",{timeout:5000,label:'filament weight in cockpit'});await waitFor(page.cdp,"String(document.querySelector('#cockpit-body')?.textContent||'').includes('Próximo discriminante')",{timeout:5000,label:'next discriminant in overview'});
  await evaluate(page.cdp,"document.querySelector('.cockpit-tabs [data-tab=atividade]')?.click(); true");await waitFor(page.cdp,"String(document.querySelector('#cockpit-body')?.textContent||'').includes('Suporte declarado')&&String(document.querySelector('#cockpit-body')?.textContent||'').includes('Renilde')",{timeout:5000,label:'associative evidence in Activity tab'});await evaluate(page.cdp,"document.querySelector('.cockpit-tabs [data-tab=integridade]')?.click(); true");await waitFor(page.cdp,"String(document.querySelector('#cockpit-body')?.textContent||'').includes('DERIVED_NOT_TRUTH')&&String(document.querySelector('#cockpit-body')?.textContent||'').includes('Confiança publicada')",{timeout:5000,label:'associative authority and confidence in Integrity tab'});assert.deepEqual(page.errors,[],`associative memory emitted browser errors: ${page.errors.join(' | ')}`);
 }finally{await closePage(page)}
}

function mobileLayoutExpression(){return `(()=>{const r=s=>{const e=document.querySelector(s);if(!e)return null;const x=e.getBoundingClientRect(),c=getComputedStyle(e);if(c.display==='none'||c.visibility==='hidden')return null;return{left:x.left,right:x.right,top:x.top,bottom:x.bottom,width:x.width,height:x.height}};const overlap=(a,b)=>Boolean(a&&b&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top);const nav=r('#atlas-mobile-nav'),actions=r('.atlas-node-actions:not([hidden])'),status=r('.atlas-status-summary'),tools=r('.atlas-mobile-tools'),live=r('.nexo-live:not(.is-open)');const taps=[...document.querySelectorAll('#atlas-mobile-nav button,.atlas-mobile-tools>button,.atlas-mobile-tools>details>summary')].map(e=>e.getBoundingClientRect().height);return{overflow:document.documentElement.scrollWidth>innerWidth,nav,actions,status,tools,live,navActionsOverlap:overlap(nav,actions),statusActionsOverlap:overlap(status,actions),liveToolsOverlap:overlap(live,tools),minTap:Math.min(...taps)}})()`}

async function smokeMobileUx(debugPort,baseUrl,{width,height,rendererId='canvas-2d',full=false}){
 const page=await openPage(debugPort,{width,height});try{
  const baseRenderer=rendererId==='pixi-2d'?'legacy-canvas':'legacy-canvas';const url=full?`${baseUrl}/?experience=OPERATIONAL&renderer-v4=${rendererId}&renderer=${baseRenderer}`:`${baseUrl}/?demo=1&experience=MOBILE_CLEAN&renderer-v4=${rendererId}&renderer=${baseRenderer}`;
  await navigate(page,url);await waitFor(page.cdp,`globalThis.__ATLAS_RENDERER_RUNTIME?.graphRendererId===${JSON.stringify(rendererId)}`,{timeout:20000,label:`mobile runtime ${rendererId}`});await waitFor(page.cdp,"Boolean(globalThis.__ATLAS_MOBILE_UX_V6&&document.querySelector('#atlas-mobile-nav'))",{timeout:10000,label:'mobile UX controller'});await waitFor(page.cdp,"getComputedStyle(document.querySelector('#atlas-mobile-nav')).display==='grid'",{timeout:10000,label:'mobile bottom navigation'});
  const initialLayout=await evaluate(page.cdp,mobileLayoutExpression());assert.equal(initialLayout.overflow,false,`${width}x${height} has horizontal overflow`);assert.ok(initialLayout.minTap>=44,`${width}x${height} has ${initialLayout.minTap}px primary target`);assert.equal(initialLayout.liveToolsOverlap,false,`${width}x${height} NEXO Live overlaps map tools`);
  if(full){
   await waitFor(page.cdp,"String(document.querySelector('#stage-source')?.textContent||'').includes('FIL')",{timeout:30000,label:'mobile associative projection'});await waitFor(page.cdp,"Boolean(document.querySelector('#atlas-experience-bar [data-domain-target=SCIENCE]'))",{timeout:5000,label:'canonical Science proxy'});
   const initial=await evaluate(page.cdp,"Number(document.querySelector('#hud-nodes')?.textContent||0)");await evaluate(page.cdp,"document.querySelector('#atlas-mobile-nav [data-domain-target=SCIENCE]')?.click(); true");await waitFor(page.cdp,"document.documentElement.dataset.atlasDomain==='SCIENCE'",{timeout:5000,label:'mobile Science domain'});await waitFor(page.cdp,`Number(document.querySelector('#hud-nodes')?.textContent||0)>${initial}`,{timeout:10000,label:'mobile Science expansion'});await waitFor(page.cdp,"Boolean(document.querySelector('.atlas-node-actions:not([hidden])'))",{timeout:5000,label:'mobile explicit action'});
   const openedLayout=await evaluate(page.cdp,mobileLayoutExpression());assert.equal(openedLayout.navActionsOverlap,false,'mobile graph action overlaps bottom navigation');assert.equal(openedLayout.statusActionsOverlap,false,'mobile graph action overlaps status strip');
   await evaluate(page.cdp,"document.querySelector('#atlas-mobile-nav .atlas-mobile-filaments')?.click(); true");await waitFor(page.cdp,"document.querySelector('#atlas-mobile-nav .atlas-mobile-filaments')?.getAttribute('aria-pressed')==='true'",{timeout:5000,label:'mobile Filamentos ON'});
   await evaluate(page.cdp,"(()=>{const input=document.querySelector('#hierarchy-search');input.value='SEM-CROSS-NULL-AUDIT-001';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()");await waitFor(page.cdp,"Boolean(document.querySelector('#search-results button'))",{timeout:5000,label:'mobile semantic search'});await evaluate(page.cdp,"document.querySelector('#search-results button')?.click(); true");await waitFor(page.cdp,"document.querySelector('#cockpit')?.dataset.sheetState==='compact'",{timeout:5000,label:'compact mobile cockpit'});await waitFor(page.cdp,"String(document.querySelector('.cockpit-memory-strip')?.textContent||'').includes('0.90')",{timeout:5000,label:'compact memory weight'});
   await evaluate(page.cdp,"document.querySelector('#cockpit-sheet-toggle')?.click(); true");await waitFor(page.cdp,"document.querySelector('#cockpit')?.dataset.sheetState==='expanded'",{timeout:5000,label:'expanded mobile cockpit'});assert.equal(await evaluate(page.cdp,"globalThis.__ATLAS_GRAPH_RENDERER?.running===false"),true,'expanded cockpit did not suspend renderer');
   await evaluate(page.cdp,"document.querySelector('.cockpit-tabs [data-tab=atividade]')?.click(); true");await waitFor(page.cdp,"String(document.querySelector('#cockpit-body')?.textContent||'').includes('Suporte declarado')",{timeout:5000,label:'mobile associative evidence'});await evaluate(page.cdp,"document.querySelector('#cockpit-close')?.click(); true");await waitFor(page.cdp,"document.querySelector('#cockpit')?.dataset.sheetState==='closed'",{timeout:5000,label:'closed mobile cockpit'});assert.equal(await evaluate(page.cdp,"globalThis.__ATLAS_GRAPH_RENDERER?.running===true"),true,'renderer did not resume after cockpit close');
   await evaluate(page.cdp,"document.querySelector('#atlas-mobile-nav .atlas-mobile-filaments')?.click(); true");await waitFor(page.cdp,"document.querySelector('#atlas-mobile-nav .atlas-mobile-filaments')?.getAttribute('aria-pressed')==='false'",{timeout:5000,label:'mobile Filamentos OFF'});
  }
  assert.deepEqual(page.errors,[],`${width}x${height} mobile UX emitted browser errors: ${page.errors.join(' | ')}`);
 }finally{await closePage(page)}
}

async function smokeMobileFallback(debugPort,baseUrl){
 const page=await openPage(debugPort,{width:390,height:844});try{const url=`${baseUrl}/?demo=1&experience=OPERATIONAL&renderer-v4=babylon-3d&renderer=three-canvas`;await navigate(page,url);await waitFor(page.cdp,"globalThis.__ATLAS_RENDERER_RUNTIME?.graphRendererId==='canvas-2d'",{timeout:15000,label:'mobile Canvas fallback'});assert.equal(await evaluate(page.cdp,"document.documentElement.scrollWidth<=innerWidth"),true,'mobile page overflows horizontally');assert.deepEqual(page.errors,[],`mobile fallback emitted browser errors: ${page.errors.join(' | ')}`)}finally{await closePage(page)}
}

async function stopBrowser(browser){if(browser.exitCode!==null||browser.signalCode!==null)return;let exited=false;const exitPromise=new Promise(resolve=>browser.once('exit',()=>{exited=true;resolve()}));try{browser.kill('SIGTERM')}catch{}await Promise.race([exitPromise,delay(2500)]);if(!exited&&browser.exitCode===null){try{browser.kill('SIGKILL')}catch{};await Promise.race([exitPromise,delay(1500)])}}
function cleanupProfile(profile){try{rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}catch(error){console.warn(`WARN Chrome profile cleanup skipped: ${error.code||error.message}`)}}

const chrome=findChrome();if(!chrome){console.error('No Chrome/Chromium binary found. Set CHROME_BIN.');process.exit(2)}
const {server,base}=await startStaticServer();const debugPort=await freePort();const profile=mkdtempSync(path.join(tmpdir(),'atlas-chrome-'));const browser=spawn(chrome,[`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','about:blank'],{stdio:['ignore','ignore','pipe']});let stderr='';browser.stderr.on('data',chunk=>stderr+=chunk.toString());
try{
 await waitFor({send:async(method)=>{if(method!=='Runtime.evaluate')return{};try{const json=await fetch(`http://127.0.0.1:${debugPort}/json/version`).then(r=>r.json());return{result:{value:Boolean(json.webSocketDebuggerUrl)}}}catch{return{result:{value:false}}}}},'true',{timeout:12000,label:'Chrome DevTools endpoint'}).catch(async()=>{for(let i=0;i<100;i++){try{const json=await fetch(`http://127.0.0.1:${debugPort}/json/version`).then(r=>r.json());if(json.webSocketDebuggerUrl)return}catch{}await delay(100)}throw new Error(`Chrome did not start: ${stderr.slice(-1200)}`)});
 for(const item of cases){await smokeRenderer(debugPort,base,item);console.log(`PASS renderer ${item.id}`)}
 await smokeCanonicalHierarchy(debugPort,base);console.log('PASS canonical Science drill-down and ABRIR affordance');
 await smokeAssociativeMemory(debugPort,base);console.log('PASS associative memory overlay and cockpit');
 await smokeMobileUx(debugPort,base,{width:375,height:812,rendererId:'canvas-2d',full:true});console.log('PASS mobile 375x812 Canvas UX');
 await smokeMobileUx(debugPort,base,{width:393,height:852,rendererId:'pixi-2d',full:false});console.log('PASS mobile 393x852 Pixi UX');
 await smokeMobileFallback(debugPort,base);console.log('PASS mobile heavy-renderer fallback');
 console.log('PASS Graph Lab browser smoke');
}finally{await stopBrowser(browser);await new Promise(resolve=>server.close(resolve));cleanupProfile(profile)}
