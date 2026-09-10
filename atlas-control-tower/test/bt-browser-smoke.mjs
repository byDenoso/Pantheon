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
const root=path.resolve(here,'../dist');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const MIME=new Map([['.html','text/html; charset=utf-8'],['.js','text/javascript; charset=utf-8'],['.css','text/css; charset=utf-8'],['.map','application/json; charset=utf-8']]);

const nodes=[
 {id:'system:NEXO',label:'NEXO',type:'SYSTEM',status:'ACTIVE'},
 {id:'lane:SCIENCE',label:'CIÊNCIA',type:'DOMAIN',domain:'SCIENCE',status:'ACTIVE'},
 {id:'program:EXPANSION',label:'EXPANSION',type:'CAMPAIGN',domain:'SCIENCE',status:'ACTIVE'},
 {id:'claim:H0',label:'Tensão de H0',type:'CLAIM',domain:'SCIENCE',status:'SUPPORTED'},
 {id:'lane:OLYMPUS',label:'OLYMPUS',type:'DOMAIN',domain:'OLYMPUS',status:'ACTIVE'},
 {id:'olympus:LITE',label:'Olympus Lite',type:'CAMPAIGN',domain:'OLYMPUS',status:'ACTIVE'},
 {id:'lane:ENGINEERING',label:'ENGENHARIA',type:'DOMAIN',domain:'ENGINEERING',status:'ACTIVE'},
 {id:'runtime:CAMB',label:'CAMB Runtime',type:'RUN',domain:'ENGINEERING',status:'SUPPORTED'},
 {id:'memory:NULL_FIRST',label:'Null-first',type:'MEMORY',domain:'LEARNING',status:'CANDIDATE'}
];
const edges=[
 ['system:NEXO','lane:SCIENCE'],['lane:SCIENCE','program:EXPANSION'],['program:EXPANSION','claim:H0'],
 ['system:NEXO','lane:OLYMPUS'],['lane:OLYMPUS','olympus:LITE'],
 ['system:NEXO','lane:ENGINEERING'],['lane:ENGINEERING','runtime:CAMB'],
 ['claim:H0','memory:NULL_FIRST']
].map(([source,target],i)=>({id:`e${i}`,source,target,type:i===7?'LEARNING_FILAMENT':'CONTAINS'}));

function json(res,value,status=200){const body=JSON.stringify(value);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(body)}
async function startServer(){
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return}
   if(url.pathname==='/api/graph'){
    json(res,{focus:url.searchParams.get('focus')||'system:NEXO',nodes,edges,total:nodes.length,depth:1,fingerprint:'bt-smoke-v1',sourceVersion:'bt-smoke-v1',source:'v1',freshness:'LIVE'});return;
   }
   if(url.pathname==='/api/state'){json(res,{fingerprint:'bt-smoke-v1',source:'v1',freshness:'LIVE'});return}
   if(url.pathname==='/api/health'){json(res,{ok:true,contract:'v1',dataSource:{effective:'v1',freshness:'LIVE',usedFallback:false}});return}
   if(url.pathname==='/api/entity'){
    const id=url.searchParams.get('id');json(res,{entity:nodes.find(node=>node.id===id)||{id,label:id}});return;
   }
   if(url.pathname==='/api/sync'){json(res,{ok:true,fingerprint:'bt-smoke-v1',source:'v1',freshness:'LIVE'});return}
   const requested=url.pathname==='/'?'bt.html':url.pathname.replace(/^\/+/, '');
   const file=path.resolve(root,requested);
   if(!file.startsWith(root+path.sep)&&file!==path.join(root,'bt.html'))throw new Error('path escape');
   const info=await stat(file);if(!info.isFile())throw new Error('not file');
   res.writeHead(200,{'content-type':MIME.get(path.extname(file))||'application/octet-stream','cache-control':'no-store'});res.end(await readFile(file));
  }catch{res.writeHead(404,{'content-type':'text/plain'});res.end('not found')}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 return{server,base:`http://127.0.0.1:${server.address().port}`};
}
function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port))})})}
function findChrome(){return[process.env.CHROME_BIN,process.env.GOOGLE_CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(existsSync)||null}
class Cdp{
 constructor(wsUrl){this.wsUrl=wsUrl;this.id=0;this.pending=new Map();this.events=new Map()}
 async connect(){this.socket=new WebSocket(this.wsUrl);await new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve,{once:true});this.socket.addEventListener('error',reject,{once:true})});this.socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const waiter=this.pending.get(msg.id);if(!waiter)return;this.pending.delete(msg.id);msg.error?waiter.reject(new Error(msg.error.message)):waiter.resolve(msg.result);return}for(const fn of this.events.get(msg.method)||[])fn(msg.params)})}
 send(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}))})}
 on(method,fn){const list=this.events.get(method)||[];list.push(fn);this.events.set(method,list)}
 close(){try{this.socket?.close()}catch{}}
}
async function openPage(debugPort,{width=1440,height=960,reducedMotion=false}={}){
 const target=await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
 const cdp=new Cdp(target.webSocketDebuggerUrl);await cdp.connect();
 await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Log.enable');
 await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=760});
 if(reducedMotion)await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 const errors=[];
 cdp.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails?.exception?.description||e.exceptionDetails?.text||'Runtime exception'));
 cdp.on('Log.entryAdded',e=>{if(e.entry?.level==='error'&&!/favicon/i.test(`${e.entry?.url||''} ${e.entry?.text||''}`))errors.push(e.entry?.text||'console error')});
 return{cdp,targetId:target.id,errors};
}
async function evaluate(cdp,expression){const result=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text||'evaluation failed');return result.result?.value}
async function waitFor(cdp,expression,{timeout=20000,label=expression}={}){const started=Date.now();let last;while(Date.now()-started<timeout){try{last=await evaluate(cdp,expression);if(last)return last}catch(error){last=error.message}await delay(120)}throw new Error(`Timed out waiting for ${label}; last=${String(last)}`)}
async function closePage(page){await page.cdp.send('Target.closeTarget',{targetId:page.targetId}).catch(()=>{});page.cdp.close()}

async function smokeBt(debugPort,base,options={}){
 const page=await openPage(debugPort,options);
 try{
  await page.cdp.send('Page.navigate',{url:`${base}/bt.html`});
  await waitFor(page.cdp,"document.readyState==='complete'",{label:'BT document'});
  await waitFor(page.cdp,"document.body.dataset.btStack==='react-css-svg-d3-three-gsap'",{label:'BT stack marker'});
  await waitFor(page.cdp,"document.documentElement.dataset.atlasVisual==='breakthrough-hybrid'",{label:'BT visual identity'});
  await waitFor(page.cdp,"document.querySelectorAll('.bt-node').length>=7",{label:'SVG/D3 nodes'});
  assert.ok(await evaluate(page.cdp,"document.querySelectorAll('.bt-domain-field').length>=3"),'domain fields missing');
  assert.equal(await evaluate(page.cdp,"Boolean(document.querySelector('.bt-graph-svg')&&document.querySelector('.bt-atmosphere-canvas'))"),true,'SVG/Three layers missing');
  assert.ok(['webgpu','webgl2'].includes(await evaluate(page.cdp,"document.querySelector('.bt-atmosphere')?.dataset.btAtmosphere")),'atmosphere backend missing');
  assert.equal(await evaluate(page.cdp,"getComputedStyle(document.querySelector('.bt-hybrid-stage')).perspective!=='none'"),true,'CSS perspective missing');
  await evaluate(page.cdp,"[...document.querySelectorAll('.bt-lens-bar button')].find(b=>b.textContent?.includes('Aprendizado'))?.click(); true");
  await waitFor(page.cdp,"document.querySelector('.bt-app')?.dataset.btLens==='learning'",{label:'Learning lens'});
  await evaluate(page.cdp,"document.querySelector('.bt-node')?.dispatchEvent(new MouseEvent('click',{bubbles:true})); true");
  await waitFor(page.cdp,"Boolean(document.querySelector('.bt-inspector'))",{label:'entity inspector'});
  assert.equal(await evaluate(page.cdp,"document.documentElement.scrollWidth<=innerWidth"),true,'horizontal overflow');
  if(options.reducedMotion)assert.equal(await evaluate(page.cdp,"matchMedia('(prefers-reduced-motion: reduce)').matches"),true);
  assert.deepEqual(page.errors,[],`BT browser errors: ${page.errors.join(' | ')}`);
 }finally{await closePage(page)}
}

if(!existsSync(path.join(root,'bt.html')))throw new Error('BT_DIST_MISSING: run npm run build first');
const chrome=findChrome();if(!chrome){console.error('No Chrome/Chromium binary found. Set CHROME_BIN.');process.exit(2)}
const {server,base}=await startServer();const debugPort=await freePort();const profile=mkdtempSync(path.join(tmpdir(),'bt-atlas-chrome-'));
const browser=spawn(chrome,[`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','about:blank'],{stdio:['ignore','ignore','pipe']});let stderr='';browser.stderr.on('data',chunk=>stderr+=chunk.toString());
try{
 for(let i=0;i<120;i++){try{const j=await fetch(`http://127.0.0.1:${debugPort}/json/version`).then(r=>r.json());if(j.webSocketDebuggerUrl)break}catch{}if(i===119)throw new Error(`Chrome did not start: ${stderr.slice(-1200)}`);await delay(100)}
 await smokeBt(debugPort,base);console.log('PASS BT hybrid desktop');
 await smokeBt(debugPort,base,{width:393,height:852});console.log('PASS BT hybrid mobile 393x852');
 await smokeBt(debugPort,base,{reducedMotion:true});console.log('PASS BT hybrid reduced motion');
 console.log('PASS BT browser smoke');
}finally{
 if(browser.exitCode===null)browser.kill('SIGTERM');
 await new Promise(resolve=>server.close(resolve));
 try{rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100})}catch{}
}
