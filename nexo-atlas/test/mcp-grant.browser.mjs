// Synthetic UI server and cloud Chromium. No real PIN, grant, identity or corpus.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {makePrivateRuntimeFixture} from './helpers/private-runtime.fixture.mjs';
import {memoryFixture} from './helpers/memory.fixture.mjs';
import {memoryRoute} from '../worker/memory.mjs';
const runtime=makePrivateRuntimeFixture().data,tower=memoryFixture();
let approved=false,active=false,expired=false,postCount=0,revokeCount=0,statusCount=0,statusFailure=false,delay=0;
const state=()=>({active,expiresAt:active?new Date(Date.now()+30*86400000).toISOString():null,approvalEnabled:approved,role:'LEARNER',scope:'tower-scientific-current-readonly-v13'});
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');const json=(value,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(`<html lang="pt-BR"><body style="margin:0"><iframe id="private" style="width:100vw;height:100vh;border:0" src="/api/atlas-private-ui#/teia/memoria"></iframe><script>window.addEventListener('message',e=>{const f=document.getElementById('private');if(!f||e.source!==f.contentWindow||e.origin!==location.origin)return;if(e.data?.type==='READY')f.contentWindow.postMessage({channel:'atlas-private-host',type:'RUNTIME',data:${JSON.stringify(runtime)}},location.origin);if(e.data?.type==='SESSION_ACTION'){window.loggedOut=true;f.remove()}})</script></body></html>`);return;}
 if(url.pathname==='/api/atlas-mcp/grant'){
  if(expired)return json({error:'AUTH_REQUIRED'},401);
  if(req.method==='GET'){statusCount++;if(statusFailure)return json({error:'UNAVAILABLE'},503);return json(state());}
  if(req.method==='POST'){postCount++;const parts=[];for await(const c of req)parts.push(c);assert.deepEqual(JSON.parse(Buffer.concat(parts)),{confirm:'owner-pin-readonly-30d-v1',days:30});if(!approved)return json({error:'MCP_GRANT_APPROVAL_REQUIRED'},403);if(delay)await new Promise(r=>setTimeout(r,delay));active=true;return json(state(),201);}
  if(req.method==='DELETE'){revokeCount++;active=false;return json({active:false});}
 }
 if(url.pathname.startsWith('/api/atlas-memory/')){const parts=[];for await(const c of req)parts.push(c);const result=await memoryRoute(url.pathname,JSON.parse(Buffer.concat(parts)||'{}'),async()=>tower);return json(result.body,result.status);}
 if(url.pathname.startsWith('/api/')){
  const path=url.pathname==='/api/atlas-private-ui'?'index.html':url.pathname.replace(/^\/api\/atlas-private-assets\//,'');
  if(/^(index\.html|assets\/[A-Za-z0-9_.-]+)$/.test(path))try{const bytes=await readFile(resolve('server/private-ui',path));res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(bytes);return;}catch{}
 }
 json({error:'NOT_FOUND'},404);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const out='/workspace/scratch/06c5da47ac10/retrieval-reconcile-evidence/mcp-ui';await mkdir(out,{recursive:true});
try{
 await page.goto(origin);const f=page.frameLocator('#private');const panel=f.getByRole('region',{name:'Acesso MCP somente leitura'});
 await panel.getByText('Nenhuma autorização ativa.',{exact:true}).waitFor();assert.equal(postCount,0);assert.equal(revokeCount,0);assert.equal(statusCount,1);
 const checkbox=panel.getByRole('checkbox'),create=panel.getByRole('button',{name:'Autorizar por 30 dias',exact:true}),refresh=panel.getByRole('button',{name:'Atualizar estado da autorização',exact:true});
 assert.equal(await checkbox.isDisabled(),true);assert.equal(await create.isDisabled(),true);
 await page.screenshot({path:out+'/pending-desktop.png'});
 approved=true;await refresh.click();await checkbox.waitFor();await page.waitForTimeout(50);assert.equal(await checkbox.isEnabled(),true);assert.equal(await create.isDisabled(),true);
 await checkbox.check();assert.equal(await create.isEnabled(),true);delay=120;await create.click();await create.click({force:true}).catch(()=>{});
 await panel.getByRole('button',{name:'Revogar acesso MCP',exact:true}).waitFor();assert.equal(postCount,1);assert.equal(await panel.locator('time').count(),1);
 await panel.getByRole('button',{name:'Revogar acesso MCP',exact:true}).click();await panel.getByText('Nenhuma autorização ativa.',{exact:true}).waitFor();assert.equal(revokeCount,1);assert.equal(await checkbox.isChecked(),false);
 await checkbox.check();statusFailure=true;await create.click();await panel.getByRole('alert').waitFor();assert.equal(postCount,2);assert.equal(await panel.getByRole('button',{name:'Autorizar por 30 dias',exact:true}).count(),0);
 statusFailure=false;await refresh.click();await panel.getByRole('button',{name:'Revogar acesso MCP',exact:true}).waitFor();assert.equal(postCount,2);
 // Navigation cancels stale UI work. Returning reloads actual server state.
 await f.getByRole('link',{name:'Testes',exact:true}).click();await f.getByRole('link',{name:'Memória',exact:true}).click();await panel.getByRole('button',{name:'Revogar acesso MCP',exact:true}).waitFor();assert.equal(postCount,2);
 await page.setViewportSize({width:390,height:844});const child=page.frames().find(x=>x.url().includes('atlas-private-ui'));
 assert.ok(await child.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await panel.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/active-mobile.png'});
 expired=true;await refresh.click();await page.waitForFunction(()=>window.loggedOut===true);assert.equal(await page.locator('iframe').count(),0);
 assert.deepEqual(errors,[]);const receipt={result:'PASS',flows:['approval-disabled','explicit consent','single create on repeated click','expiry displayed','revoke','uncertain action status recovery','private navigation','390px no overflow','session-expiry teardown'],postCount,revokeCount,statusCount,real_grants_created:false,production_changed:false};
 await writeFile(out+'/receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{await browser.close();await new Promise(r=>server.close(r));}
