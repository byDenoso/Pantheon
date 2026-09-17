import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');

const baseUrl=process.env.NEXO_BASE_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900},locale:'pt-BR'});
const page=await context.newPage();

const bridgeHtml=`<!doctype html><meta charset="utf-8"><script>
(()=>{
  const q=new URLSearchParams(location.search);
  const parentOrigin=q.get('parentOrigin');
  const nonce=q.get('bridgeNonce');
  const send=value=>window.top.postMessage({source:'NEXO_AUTH_BRIDGE',version:1,...value},parentOrigin);
  addEventListener('message',event=>{
    if(event.origin!==parentOrigin||event.source!==window.top)return;
    const data=event.data||{};
    if(data.source!=='NEXO_PARENT'||data.version!==1||!data.requestId)return;
    if(data.type==='SESSION_GET'){
      const authenticated=data.payload&&data.payload.token==='mock-token';
      send({requestId:data.requestId,ok:true,status:200,state:{configured:true,authenticated,access:authenticated?'PRIVATE':'PUBLIC',mode:authenticated?'PRIVATE':'PUBLIC_READ_ONLY'}});
    }else if(data.type==='SESSION_LOGIN'){
      if(data.payload&&data.payload.pin==='123456')send({requestId:data.requestId,ok:true,status:200,token:'mock-token',state:{configured:true,authenticated:true,access:'PRIVATE',mode:'PRIVATE'}});
      else send({requestId:data.requestId,ok:false,status:401,error:'AUTH_REQUIRED',state:{configured:true,authenticated:false,access:'PUBLIC',mode:'PUBLIC_READ_ONLY'}});
    }else if(data.type==='SESSION_LOGOUT'){
      send({requestId:data.requestId,ok:true,status:200,state:{configured:true,authenticated:false,access:'PUBLIC',mode:'PUBLIC_READ_ONLY'}});
    }
  });
  send({type:'BRIDGE_READY',nonce});
})();
<\/script>`;

try{
  await page.route('https://mock.googleusercontent.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:bridgeHtml}));
  await page.goto(baseUrl);
  await page.getByRole('heading',{level:1}).waitFor();

  await page.getByRole('button',{name:'Acessar sessão privada'}).click();
  await page.getByRole('dialog',{name:'ACESSO PRIVADO'}).waitFor();
  await page.getByLabel('PIN').fill('0000');
  await page.getByRole('button',{name:/Entrar/}).click();
  await page.getByText('PIN inválido.').waitFor();

  await page.getByLabel('PIN').fill('123456');
  await page.getByRole('button',{name:/Entrar/}).click();
  await page.locator('.private-session-badge').waitFor();
  assert.equal(await page.locator('.private-session-badge').innerText(),'PRIVATE');
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('nexo.appsScript.sessionToken')),'mock-token');
  assert.equal(await page.evaluate(()=>localStorage.getItem('nexo.appsScript.sessionToken')),null);

  await page.reload();
  await page.locator('.private-session-badge').waitFor();
  assert.equal(await page.locator('.private-session-badge').innerText(),'PRIVATE');

  await page.getByRole('button',{name:'Sair da sessão privada'}).click();
  await page.locator('.private-session-badge').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('nexo.appsScript.sessionToken')),null);
  console.log('apps-script-auth-browser: pass');
}finally{
  await context.close();
  await browser.close();
}
