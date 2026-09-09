import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,access} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {compile} from '../server/compiler/world-state.mjs';
import {item} from '../server/adapters/http.mjs';
import {pending,labels} from '../server/adapters/registry.mjs';
import {PROVIDERS} from '../src/contracts/validate.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const output='test-output';await mkdir(output,{recursive:true});
const now=Date.parse('2026-09-09T12:00:00Z');
const records=[item('github','fixture-1','Revisar contrato de integração','https://github.com/example/project/issues/1',now,{kind:'ISSUE',status:'BLOCKED',contextId:'ENGINEERING'}),item('calendar','fixture-2','Bloco de trabalho','https://calendar.google.com/calendar/u/0/r',now,{kind:'EVENT',status:'SCHEDULED',dueAt:'2026-09-09T12:30:00Z',endAt:'2026-09-09T13:00:00Z',contextId:'PERSONAL'}),item('drive','fixture-3','CAMB · referência de teste','https://drive.google.com/file/d/fixture/view',now,{kind:'FILE',contextId:'COSMOLOGY'})];
const results=PROVIDERS.map(id=>{const r=pending(id,now);return records.some(x=>x.source===id)?{items:records.filter(x=>x.source===id),provider:{...r.provider,status:'AVAILABLE',count:records.filter(x=>x.source===id).length,lastSuccessAt:new Date(now).toISOString(),revision:'fixture-v1',message:'FIXTURE · ONLY IN TEST'}}:r;});
const world=compile(results,{now});
const browser=await chromium.launch({headless:true});const reports=[];
try{
  for(const [name,width,height,theme] of [['desktop-dark',1440,1000,'dark'],['desktop-light',1440,1000,'light'],['mobile-dark',390,844,'dark'],['mobile-light',390,844,'light']]){
    const context=await browser.newContext({viewport:{width,height},timezoneId:'America/Sao_Paulo',locale:'pt-BR'}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.clock.install({time:now});
    await page.addInitScript(theme=>{localStorage.setItem('nexo-theme',theme);localStorage.setItem('nexo-tab','NOW');},theme);
    await page.route('**/api/session',r=>r.fulfill({json:{configured:false,authenticated:false}}));
    await page.route('**/api/world*',r=>r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify(world)+'\n'}));
    await page.route('**/api/recall*',r=>r.fulfill({json:{...world,items:records.filter(x=>x.source==='drive')}}));
    await page.goto(process.env.NEXO_BASE_URL||'http://127.0.0.1:4173');
    await page.getByRole('button',{name:/Revisar contrato de integração/}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Horizontal overflow');
    await page.screenshot({path:`${output}/${name}.png`,fullPage:true});
    await page.getByRole('button',{name:/Revisar contrato de integração/}).click();await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByRole('link',{name:/Abrir na fonte/}).getAttribute('href'),'https://github.com/example/project/issues/1');
    if(name==='mobile-dark')await page.screenshot({path:`${output}/focus-drawer-mobile.png`,fullPage:true});
    await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
    for(const tab of ['LOOPS','DAY','CONTEXT','RECALL']){await page.getByRole('navigation').getByRole('button',{name:new RegExp(tab)}).click();assert.equal(await page.getByRole('heading',{level:1}).count(),1);}
    await page.getByRole('textbox',{name:'Buscar nas fontes'}).fill('CAMB');await page.getByRole('button',{name:'Buscar ↗',exact:true}).click();await page.getByRole('button',{name:/CAMB · referência de teste/}).waitFor();
    await page.getByRole('textbox',{name:'Comando global'}).fill('Olympus');await page.getByRole('textbox',{name:'Comando global'}).press('Enter');assert.equal(await page.getByRole('heading',{name:'Olympus',exact:true}).count(),1);
    await page.getByRole('button',{name:/Ver fontes/}).click();await page.getByRole('dialog',{name:'CONEXÕES / FONTES'}).waitFor();if(name==='desktop-dark')await page.screenshot({path:`${output}/provider-degraded.png`,fullPage:true});await page.keyboard.press('Escape');
    await page.getByRole('button',{name:theme==='dark'?'Ativar tema claro':'Ativar tema escuro'}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),theme==='dark'?'light':'dark');
    assert.deepEqual(errors,[]);reports.push({name,status:'pass',overflow:false,runtimeErrors:errors});await context.close();
  }
}finally{await browser.close();}
await writeFile(`${output}/browser-report.json`,JSON.stringify({status:'pass',scenarios:reports,visualBaseline:'pending-initial-review'},null,2));
console.log(JSON.stringify(reports));
