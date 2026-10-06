import {makePrivateTowerFixture} from './helpers/private-tower.fixture.mjs';
import {compilePrivateTowerRuntime} from '../server/atlas/private-tower.mjs';
// Synthetic end-to-end integration: actual built UI + actual backend handler.
// Only Redis/private-source transports are in-memory fixtures. Local HTTP Origin
// is mapped to the configured HTTPS test origin; production TLS/CDN is not tested.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {scryptSync} from 'node:crypto';
import {chromium} from 'playwright';
import handler from '../server/handler.mjs';
const pin='synthetic-integration-passphrase',salt='c'.repeat(32),store=new Map();
Object.assign(process.env,{NEXO_ATLAS_ORIGIN:'https://atlas.example',NEXO_ATLAS_PIN_HASH:`scrypt$${salt}$${scryptSync(pin,salt,64).toString('hex')}`,NEXO_ATLAS_REDIS_URL:'https://fixture-store.example',NEXO_ATLAS_REDIS_TOKEN:'synthetic',NEXO_ATLAS_PRIVATE_SOURCE_URL:'https://fixture-source.example',NEXO_ATLAS_PRIVATE_SOURCE_TOKEN:'synthetic'});
let failDelete=false;const requests=[];
globalThis.fetch=async(url,options={})=>{
  if(String(url)==='https://fixture-source.example/')return Response.json(compilePrivateTowerRuntime(makePrivateTowerFixture()));
  if(String(url)!=='https://fixture-store.example')throw Error('Unexpected upstream');
  const [command,key,...args]=JSON.parse(options.body);let result;
  if(command==='GET')result=store.get(key)||null;
  else if(command==='SET'){store.set(key,args[0]);result='OK';}
  else if(command==='DEL'){if(failDelete)throw Error('synthetic outage');result=Number(store.delete(key));}
  else if(command==='EVAL'){const k=args[1],n=(store.get(k)||0)+1;store.set(k,n);result=n;}
  else throw Error('Unexpected storage command');
  return Response.json({result});
};
let base;const root=path.resolve('dist');
const server=http.createServer(async(req,res)=>{
  requests.push(`${req.method} ${req.url}`);
  if(req.url.startsWith('/api/')){if(req.headers.origin===base)req.headers.origin=process.env.NEXO_ATLAS_ORIGIN;return handler(req,res);}
  try{let pathname=new URL(req.url,'http://local').pathname;if(pathname.endsWith('/'))pathname+='index.html';const file=path.resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+path.sep))throw Error('path');res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://localhost:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
const context=await browser.newContext({locale:'en-US'});await context.route('https://**/*',route=>route.abort());
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
  await page.goto(base);
  await page.waitForSelector('[data-area="public"]');
  assert.ok(!requests.some(r=>r.includes('/api/atlas-private')));
  await page.getByRole('button',{name:'EN',exact:true}).click();await page.reload();await page.waitForSelector('html[lang="en"]');
  await page.goto(base+'/#/privado');await page.locator('#atlas-pin').waitFor();
  await page.locator('#atlas-pin').fill(pin);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.frameLocator('iframe.atlas-private-frame').locator('.cockpit[data-access=PRIVATE]').waitFor();
  const second=await context.newPage();await second.goto(base+'/#/privado');await second.frameLocator('iframe.atlas-private-frame').locator('.cockpit[data-access=PRIVATE]').waitFor();
  const cookie=(await context.cookies()).find(c=>c.name==='__Host-atlas_session');assert.ok(cookie?.httpOnly&&cookie.secure&&cookie.sameSite==='Strict');
  failDelete=true;await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByText(/server did not confirm/).waitFor();await page.waitForTimeout(300);
  assert.equal(await page.locator('iframe.atlas-private-frame').count(),0);
  assert.equal(await second.locator('iframe.atlas-private-frame').count(),0);
  await second.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.waitForTimeout(200);
  assert.equal(await second.locator('iframe.atlas-private-frame').count(),0);
  failDelete=false;await page.getByRole('button',{name:'Try to end it again',exact:true}).click();
  await page.waitForFunction(()=>document.body.innerText.includes('confirmed')&&!document.body.innerText.includes('not confirm'));
  const denied=await context.request.get(base+'/api/atlas-private');assert.equal(denied.status(),401);
  for(const route of ['/system.json','/tower-projection/publication.json','/world-public.ndjson'])assert.equal((await context.request.get(base+route)).status(),404);
  assert.deepEqual(errors,[]);
  await page.goto(base);await page.screenshot({path:'/tmp/atlas-integrated-public.png',fullPage:true});
  console.log(JSON.stringify({status:'PASS',verified:['built UI + real backend','manual locale persistence','opaque secure cookie','private-source authenticated read','cross-tab failed logout remains wiped','pageshow race remains wiped','retry server revocation','anonymous private denial','static data absent'],limits:['synthetic upstreams','local Origin mapping','no production TLS/CDN','pageshow event is synthetic, not proven native bfcache restore']}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
