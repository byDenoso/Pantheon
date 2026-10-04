import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {scryptSync} from 'node:crypto';
import {chromium} from 'playwright';
import {sessionRoute} from '../server/auth/session-route.mjs';
import {googleDriveConsentRoute,googleDriveConsentReturn} from '../server/auth/google-drive-consent.mjs';

// Entirely synthetic loopback integration. No Google/Vercel request is made.
const salt='5'.repeat(32),password='synthetic-browser-password';
const env={NEXO_SESSION_SECRET:'synthetic-browser-session-secret-at-least-32-bytes',
  NEXO_PASSWORD_HASH:`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`,
  GOOGLE_CONNECTOR:'google/alizarin-saddle',GOOGLE_CONNECT_SUBJECT_ID:'owner',VERCEL_ENV:'production',VERCEL_OIDC_TOKEN:'synthetic-project-oidc'};
let callbackUrl='',starts=0,verifies=0,startMode='ok';
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  const path=new URL(req.url,'http://local').pathname;
  if(path==='/__synthetic_return'&&process.env.NEXO_CONSENT_FIXTURE_SERVER==='1'){
    res.statusCode=303;res.setHeader('Location','/api/google-drive-return'+new URL(callbackUrl).search);res.end();return;
  }
  if(path.startsWith('/api/')){
    let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};
    let decision;
    if(path==='/api/session')decision=sessionRoute(req,env,Date.now(),body);
    else{
      const syntheticReq={...req,method:req.method,url:req.url,headers:{...req.headers,host:'nexo-one-two.vercel.app',
        ...(req.headers.origin===baseUrl?{origin:'https://nexo-one-two.vercel.app'}:{})}};
      decision=path==='/api/google-drive-return'?googleDriveConsentReturn(syntheticReq,env):await googleDriveConsentRoute(syntheticReq,env,Date.now(),{
        body,startTimeoutMs:20,
        startAuthorizationImpl:async(connector,params,options)=>{
          starts++;assert.equal(connector,env.GOOGLE_CONNECTOR);assert.deepEqual(params.subject,{type:'user',id:'owner'});
          assert.ok(JSON.stringify(params.scopes)==='["https://www.googleapis.com/auth/drive.readonly"]'||JSON.stringify(params.scopes)==='["https://www.googleapis.com/auth/drive.readonly","https://www.googleapis.com/auth/spreadsheets"]');
          callbackUrl=options.callbackUrl;
          if(startMode==='uncertain')return new Promise(()=>{});
          return {url:'https://connect.vercel.com/authorize/sca_synthetic',verifier:'synthetic-private-verifier'};
        },tokenImpl:async(_env,signal,params)=>{verifies++;assert.ok(signal instanceof AbortSignal);assert.ok(JSON.stringify(params.scopes)==='["https://www.googleapis.com/auth/drive.readonly"]'||JSON.stringify(params.scopes)==='["https://www.googleapis.com/auth/drive.readonly","https://www.googleapis.com/auth/spreadsheets"]');return 'synthetic-only-token';},
        readTowerImpl:async()=>({readback:'PASS',authority:'TOWER_V06@GOOGLE_DRIVE_PRIVATE',revision:'sha256:'+'c'.repeat(64)}),
        readSpoolHeaderImpl:async()=>({spreadsheetId:'1M2maKkuEjxumZRa145dzei7dEPFi2yKsKlUf7_scC-E',title:'Spool'})
      });
    }
    if(decision.setCookie)res.setHeader('Set-Cookie',decision.setCookie);
    if(decision.location)res.setHeader('Location',decision.location);
    res.setHeader('Content-Type','application/json');res.statusCode=decision.status;res.end(JSON.stringify(decision.body));return;
  }
  if(['/google-drive-connect.html','/google-drive-connect.js','/google-drive-connect.css'].includes(path)){
    res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');
    res.end(await readFile(new URL('../public'+path,import.meta.url)));return;
  }
  res.statusCode=404;res.end('not found');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const baseUrl='http://127.0.0.1:'+server.address().port;
if(process.env.NEXO_CONSENT_FIXTURE_SERVER==='1'){
  console.log('synthetic consent fixture server: '+baseUrl+'/google-drive-connect.html');
  await new Promise(resolve=>process.once('SIGTERM',resolve));
  await new Promise(resolve=>server.close(resolve));
}else{
const browser=await chromium.launch({headless:true,...(process.env.NEXO_CHROMIUM_PATH?{executablePath:process.env.NEXO_CHROMIUM_PATH}:{})});
await mkdir('test-output/google-drive-consent',{recursive:true});
const syntheticConsentReturn=route=>{
  assert.equal(route.request().url(),'https://connect.vercel.com/authorize/sca_synthetic');
  const callback=new URL(callbackUrl);
  return route.fulfill({status:302,headers:{Location:baseUrl+'/api/google-drive-return'+callback.search},body:''});
};
try{
  for(const [label,width,height] of [['desktop',1280,900],['mobile',390,844]]){
    const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://connect.vercel.com/**',syntheticConsentReturn);
    await page.goto(baseUrl+'/google-drive-connect.html');
    await page.getByRole('button',{name:'Entrar na sessão privada'}).waitFor();
    const initialStarts=starts;
    await page.getByLabel('Senha do NEXO').fill('wrong');await page.getByRole('button',{name:'Entrar na sessão privada'}).click();
    await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('Senha do NEXO').inputValue(),'');
    await page.getByLabel('Senha do NEXO').fill(password);await page.getByRole('button',{name:'Entrar na sessão privada'}).click();
    await page.getByRole('button',{name:'Preparar confirmação do Google'}).waitFor();
    assert.equal(starts,initialStarts,'login never begins consent');
    const before=starts;assert.equal(await page.getByRole('link',{name:'Abrir confirmação do Google'}).isVisible(),false);
    await page.getByRole('button',{name:'Preparar confirmação do Google'}).click();assert.equal(starts,before,'unchecked consent never reaches start');
    await page.getByLabel('Autorizo esta conexão persistente somente de leitura do Google Drive').check();
    await page.getByRole('button',{name:'Preparar confirmação do Google'}).click();
    await page.getByRole('link',{name:'Abrir confirmação do Google'}).waitFor();assert.equal(starts,before+1);
    assert.equal(await page.getByRole('button',{name:'Preparar confirmação do Google'}).isDisabled(),true);
    assert.equal(await page.getByRole('button',{name:'Conferir leitura da Tower'}).isDisabled(),true);
    await page.screenshot({path:`test-output/google-drive-consent/${label}-consent.png`,fullPage:true});
    await page.getByRole('link',{name:'Abrir confirmação do Google'}).click();
    await page.getByRole('button',{name:'Conferir leitura da Tower'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Conferir leitura da Tower'}).isEnabled(),true);
    await page.getByRole('button',{name:'Conferir leitura da Tower'}).click();
    await page.getByText(/Leitura da Tower verificada/).waitFor();
    assert.match(await page.getByRole('status').innerText(),/piloto de soma ainda requer execução/);
    await page.screenshot({path:`test-output/google-drive-consent/${label}-readback.png`,fullPage:true});
    const overflow=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth,
      offenders:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1)
        .slice(0,8).map(el=>`${el.tagName.toLowerCase()}#${el.id}.${typeof el.className==='string'?el.className:''}`.slice(0,120))}));
    assert.ok(overflow.scrollWidth<=overflow.innerWidth+1,
      `${label} consent page overflows after readback: ${JSON.stringify(overflow)}`);
    assert.deepEqual(errors,[]);await context.close();
  }
  {
    const context=await browser.newContext(),page=await context.newPage();
    await page.route('https://connect.vercel.com/**',syntheticConsentReturn);
    await page.goto(baseUrl+'/google-drive-connect.html');await page.getByLabel('Senha do NEXO').fill(password);
    await page.getByRole('button',{name:'Entrar na sessão privada'}).click();
    await page.getByText(/não fica limitado a uma planilha específica/).waitFor();
    assert.equal(await page.getByRole('button',{name:'Preparar confirmação de Drive + Sheets'}).isEnabled(),true);
    const before=starts;
    await page.getByRole('button',{name:'Preparar confirmação de Drive + Sheets'}).click();assert.equal(starts,before,'unchecked Sheets consent never reaches start');
    await page.getByLabel(/Autorizo o acesso persistente de leitura ao Drive/).check();
    await page.getByRole('button',{name:'Preparar confirmação de Drive + Sheets'}).click();
    await page.getByRole('link',{name:'Abrir confirmação de Drive + Sheets'}).waitFor();assert.equal(starts,before+1);
    await page.getByRole('link',{name:'Abrir confirmação de Drive + Sheets'}).click();
    await page.getByRole('button',{name:'Conferir Tower e leitura do spool'}).waitFor();
    await page.getByRole('button',{name:'Conferir Tower e leitura do spool'}).click();
    await page.getByText('Leituras da Tower e do spool verificadas. Nenhuma gravação foi executada; o acesso de escrita não foi testado.').waitFor();
    await context.close();
  }
  startMode='uncertain';
  const context=await browser.newContext(),page=await context.newPage();
  await page.route('https://connect.vercel.com/**',syntheticConsentReturn);
  await page.goto(baseUrl+'/google-drive-connect.html');await page.getByLabel('Senha do NEXO').fill(password);
  await page.getByRole('button',{name:'Entrar na sessão privada'}).click();
  await page.getByLabel('Autorizo esta conexão persistente somente de leitura do Google Drive').check();
  const before=starts;await page.getByRole('button',{name:'Preparar confirmação do Google'}).click();
  await page.getByText(/A resposta da Vercel Connect ficou incerta/).waitFor();
  assert.equal(starts,before+1);assert.equal(await page.getByRole('button',{name:'Preparar confirmação do Google'}).isDisabled(),true);
  await page.reload();await page.getByText(/A resposta da Vercel Connect ficou incerta/).waitFor();
  assert.equal(await page.getByRole('button',{name:'Preparar confirmação do Google'}).isDisabled(),true);assert.equal(starts,before+1);
  await context.close();
  console.log('google-drive-consent-browser: PASS desktop/mobile login, explicit consent, return, canonical readback, uncertain-start no retry');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
