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

function findChrome(){
 const candidates=[process.env.CHROME_BIN,process.env.GOOGLE_CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
 return candidates.find(existsSync)||null;
}

class Cdp{
 constructor(wsUrl){this.wsUrl=wsUrl;this.id=0;this.pending=new Map();this.events=new Map();this.socket=null}
 async connect(){this.socket=new WebSocket(this.wsUrl);await new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve,{once:true});this.socket.addEventListener('error',reject,{once:true})});this.socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const waiter=this.pending.get(msg.id);if(!waiter)return;this.pending.delete(msg.id);msg.error?waiter.reject(new Error(msg.error.message)):waiter.resolve(msg.result);return}for(const fn of this.events.get(msg.method)||[])fn(msg.params)})}
 send(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}))})}
 on(method,fn){const list=this.events.get(method)||[];list.push(fn);this.events.set(method,list)}
 close(){try{this.socket?.close()}catch{}}
}

async function openPage(debugPort,{width=1440,height=1000}={}){
 const created=await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
 const cdp=new Cdp(created.webSocketDebuggerUrl);await cdp.connect();
 await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Log.enable');
 await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=760});
 const errors=[];cdp.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails?.text||event.exceptionDetails?.exception?.description||'Runtime exception'));
 cdp.on('Log.entryAdded',event=>{if(['error'].includes(event.entry?.level)&&!/favicon/i.test(event.entry?.text||''))errors.push(`${event.entry.level}: ${event.entry.text}`)});
 return{cdp,errors,targetId:created.id};
}

async function evaluate(cdp,expression){const result=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text||'evaluation failed');return result.result?.value}
async function waitFor(cdp,expression,{timeout=15000,label=expression}={}){const started=Date.now();let last;while(Date.now()-started<timeout){try{last=await evaluate(cdp,expression);if(last)return last}catch(error){last=error.message}await delay(120)}throw new Error(`Timed out waiting for ${label}; last=${String(last)}`)}

async function navigate(page,url){await page.cdp.send('Page.navigate',{url});await waitFor(page.cdp,"document.readyState==='complete'",{timeout:15000,label:'document complete'})}

const cases=[
 {id:'canvas-2d',base:'legacy-canvas',selector:'#graph-lab-canvas:not([hidden])'},
 {id:'pixi-2d',base:'legacy-canvas',selector:'.atlas-pixi-canvas'},
 {id:'three-25d',base:'three-canvas',selector:'.graph-gl'},
 {id:'babylon-25d',base:'three-canvas',selector:'.atlas-babylon-canvas'}
];

async function smokeRenderer(debugPort,baseUrl,testCase){
 const page=await openPage(debugPort,{width:1440,height:1000});
 const url=`${baseUrl}/?demo=1&experience=OPERATIONAL&renderer-v4=${encodeURIComponent(testCase.id)}&renderer=${encodeURIComponent(testCase.base)}`;
 await navigate(page,url);
 await waitFor(page.cdp,`globalThis.__ATLAS_RENDERER_RUNTIME?.graphRendererId===${JSON.stringify(testCase.id)}`,{timeout:20000,label:`runtime ${testCase.id}`});
 await waitFor(page.cdp,`Boolean(document.querySelector(${JSON.stringify(testCase.selector)}))`,{timeout:20000,label:`surface ${testCase.id}`});
 await waitFor(page.cdp,"Number(document.querySelector('#hud-nodes')?.textContent||0)>0",{timeout:20000,label:`nodes ${testCase.id}`});
 const initial=await evaluate(page.cdp,"Number(document.querySelector('#hud-nodes')?.textContent||0)");
 await evaluate(page.cdp,"document.querySelector('[data-domain-target=SCIENCE]')?.click(); true");
 await waitFor(page.cdp,`Number(document.querySelector('#hud-nodes')?.textContent||0)>${initial}`,{timeout:10000,label:`science expansion ${testCase.id}`});
 const actual=await evaluate(page.cdp,"document.documentElement.dataset.atlasRenderer");
 assert.equal(actual,testCase.id,`${testCase.id} runtime drifted to ${actual}`);
 assert.deepEqual(page.errors,[],`${testCase.id} emitted browser errors: ${page.errors.join(' | ')}`);
 await page.cdp.send('Target.closeTarget',{targetId:page.targetId}).catch(()=>{});page.cdp.close();
}

async function smokeMobileFallback(debugPort,baseUrl){
 const page=await openPage(debugPort,{width:390,height:844});
 const url=`${baseUrl}/?demo=1&experience=OPERATIONAL&renderer-v4=babylon-3d&renderer=three-canvas`;
 await navigate(page,url);
 await waitFor(page.cdp,"globalThis.__ATLAS_RENDERER_RUNTIME?.graphRendererId==='canvas-2d'",{timeout:15000,label:'mobile Canvas fallback'});
 assert.equal(await evaluate(page.cdp,"document.documentElement.scrollWidth<=innerWidth"),true,'mobile page overflows horizontally');
 assert.deepEqual(page.errors,[],`mobile fallback emitted browser errors: ${page.errors.join(' | ')}`);
 await page.cdp.send('Target.closeTarget',{targetId:page.targetId}).catch(()=>{});page.cdp.close();
}

const chrome=findChrome();
if(!chrome){console.error('No Chrome/Chromium binary found. Set CHROME_BIN.');process.exit(2)}
const {server,base}=await startStaticServer();const debugPort=await freePort();const profile=mkdtempSync(path.join(tmpdir(),'atlas-chrome-'));
const browser=spawn(chrome,[`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','about:blank'],{stdio:['ignore','ignore','pipe']});
let stderr='';browser.stderr.on('data',chunk=>stderr+=chunk.toString());
try{
 await waitFor({send:async(method)=>{if(method!=='Runtime.evaluate')return{};try{const json=await fetch(`http://127.0.0.1:${debugPort}/json/version`).then(r=>r.json());return{result:{value:Boolean(json.webSocketDebuggerUrl)}}}catch{return{result:{value:false}}}}},'true',{timeout:12000,label:'Chrome DevTools endpoint'}).catch(async()=>{for(let i=0;i<100;i++){try{const json=await fetch(`http://127.0.0.1:${debugPort}/json/version`).then(r=>r.json());if(json.webSocketDebuggerUrl)return}catch{}await delay(100)}throw new Error(`Chrome did not start: ${stderr.slice(-1200)}`)});
 for(const item of cases){await smokeRenderer(debugPort,base,item);console.log(`PASS ${item.id}`)}
 await smokeMobileFallback(debugPort,base);console.log('PASS mobile heavy-renderer fallback');
 console.log('PASS Graph Lab browser smoke');
}finally{
 try{browser.kill('SIGTERM')}catch{};await new Promise(resolve=>server.close(resolve));rmSync(profile,{recursive:true,force:true});
}
