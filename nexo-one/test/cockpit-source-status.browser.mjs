// Private UI behavior using synthetic same-origin responses only; no Tower or credentials.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';

const origin=process.env.COCKPIT_QA_URL ?? 'http://127.0.0.1:4198';
const availability={roadmap:'available',mural:'available',resumo:'available',resultados:'available',equipe:'available'};
const snapshot=()=>({contract:'NEXO_COCKPIT_V1',generatedAt:'2026-11-01T21:00:00Z',
  shadow:{available:true,modifiedAt:'2026-11-01T20:00:00Z',counts:{roadmap:0,mural:0,resumo:0,resultados:0,equipe:0},availability:{...availability},roadmap:[],mural:[],resumo:[],resultados:[],equipe:[]},
  catalog:{available:true,url:'https://catalog.example/atlas-public.json',rows:[]},candidates:{tower:[],campaigns:[]},
  selection:{available:true,value:null},drift:[],audit:[]});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});
async function open(data,{theme='light',width=390}={}){
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.addInitScript(value=>localStorage.setItem('nexo.cockpit.theme',value),theme);
  const control={data,mode:'ok'};
  await page.route('**/api/atlas-session',route=>route.fulfill({status:200,json:route.request().method()==='DELETE'?{authenticated:false}:{configured:true,authenticated:true}}));
  await page.route('**/api/atlas-public-selection',route=>route.fulfill({status:200,json:{contract:'ATLAS_PUBLIC_SELECTION_V1',mode:'UNSET'}}));
  await page.route('**/api/atlas-cockpit',route=>control.mode==='network'?route.abort('failed'):control.mode==='unauth'?route.fulfill({status:401,json:{error:'AUTH_REQUIRED'}}):route.fulfill({status:200,json:control.data}));
  await page.goto(origin+'/cockpit.html',{waitUntil:'domcontentloaded'});
  await page.locator('.ck-hero').waitFor();
  return {context,page,control};
}
try {
  const partial=snapshot();partial.shadow.availability.resultados='unavailable';partial.shadow.availability.resumo='unavailable';partial.shadow.equipe=[{papel:'Synthetic',estado:'inativa',cadencia:'1h minuto 06',frentes:''}];
  let view=await open(partial);
  assert.match(await view.page.locator('.ck-stamp').innerText(),/SHADOW: leitura parcial/i);
  assert.match(await view.page.locator('.ck-main').innerText(),/Fonte SHADOW · recorte limitado/);
  await view.page.getByText('Cobertura e proveniência',{exact:true}).click();
  assert.match(await view.page.locator('.ck-main').innerText(),/até 100 linhas recentes[\s\S]*até 60/);
  assert.match(await view.page.locator('.ck-main').innerText(),/snapshot JSON da outra área privada é uma leitura distinta/);
  assert.match(await view.page.locator('#resultados').innerText(),/Aba RESULTADOS indisponível/);
  assert.equal((await view.page.locator('.ck-kpi').first().locator('dd').innerText()).trim(),'—');
  assert.equal(await view.page.locator('.nx-activity-chart').count(),0,'partial data is not plotted as zero');
  assert.equal(await view.page.locator('.ck-crew-pulse').count(),0,'partial activity has no zero-filled hourly chart');
  view.control.mode='network';
  await view.page.locator('.ck-stamp button').click();
  await view.page.getByRole('alert').filter({hasText:'A última atualização falhou'}).waitFor();
  await view.context.close();

  view=await open(snapshot());
  assert.match(await view.page.locator('.ck-stamp').innerText(),/SHADOW consultada/i);
  assert.equal((await view.page.locator('.ck-kpi').first().locator('dd').innerText()).trim(),'0');
  assert.match(await view.page.locator('#resultados').innerText(),/Nenhum resultado disponível corresponde/);
  view.control.mode='unauth';
  await view.page.locator('.ck-stamp button').click();
  await view.page.locator('.ck-login h1').waitFor();
  assert.equal(await view.page.locator('.ck-hero').count(),0,'authorization loss clears the private view');
  await view.context.close();

  const unknown=snapshot();delete unknown.shadow.availability;
  view=await open(unknown);
  assert.match(await view.page.locator('.ck-stamp').innerText(),/SHADOW: leitura parcial/i);
  assert.equal((await view.page.locator('.ck-kpi').first().locator('dd').innerText()).trim(),'—');
  await view.context.close();

  const disabled=snapshot();disabled.shadow={available:false,reason:'SHADOW_SOURCE_DISABLED'};
  view=await open(disabled);
  assert.match(await view.page.locator('.ck-main').innerText(),/Fonte SHADOW indisponível nesta leitura/);
  assert.equal((await view.page.locator('.ck-kpi').first().locator('dd').innerText()).trim(),'—');
  await view.context.close();
  if(process.env.COCKPIT_QA_DIR)await mkdir(process.env.COCKPIT_QA_DIR,{recursive:true});
  for(const theme of ['light','dark'])for(const width of [390,1440]){
    const sample=snapshot(),row={data:'2026-11-01T20:00:00Z',task:'Synthetic',item:'TEST',titulo:'Resultado sintético',resultado:'Texto sintético para verificar a leitura.',numeros:'',limites:'Limite sintético.',link_dados:''};
    sample.shadow.resultados=[row];sample.shadow.counts.resultados=1;
    sample.shadow.resumo=[{data_hora:'2026-11-01T19:00:00Z',nivel:'N1',item:'TEST',o_que_mudou:'Resumo sintético para leitura.',impacto:'Sem dados reais.',link:''}];
    sample.candidates.tower=[{id:'r-synthetic',digest:'sha256:'+ '0'.repeat(64),source:row,draft:{question:{'pt-BR':'Questão sintética?',en:''},answers:{'pt-BR':'Limite sintético.',en:''},method:{'pt-BR':'',en:''},result:{'pt-BR':'Texto sintético.',en:''}}}];
    view=await open(sample,{theme,width});
    const styles=await view.page.evaluate(()=>{const style=selector=>getComputedStyle(document.querySelector(selector)),size=selector=>parseFloat(style(selector).fontSize),line=selector=>parseFloat(style(selector).lineHeight)/size(selector);return {accent:getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim(),background:getComputedStyle(document.body).backgroundColor,panel:style('.ck-panel').backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth,resultText:size('#resultados .ck-item-row p'),feedText:size('.ck-feed-item p:not(.ck-feed-head)'),resultLine:line('#resultados .ck-item-row p'),feedLine:line('.ck-feed-item p:not(.ck-feed-head)'),metadata:size('#resultados .ck-meta'),summaryMetadata:size('.ck-activity-list summary .ck-meta'),summaryText:size('.ck-activity-list summary .ck-line-clamp'),heading:size('#resultados .ck-item-row h3')};});
    assert.equal(styles.accent,theme==='light'?'#003087':'#a9c5ff');
    assert.equal(styles.background,theme==='light'?'rgb(255, 255, 255)':'rgb(0, 0, 0)');
    assert.equal(styles.panel,theme==='light'?'rgb(245, 247, 250)':'rgb(17, 21, 27)');
    assert.equal(styles.overflow,false,`${theme}/${width} horizontal overflow`);
    assert.ok(styles.resultText>=16&&styles.feedText>=16,`${theme}/${width} reading text is at least 16px`);
    assert.ok(styles.resultLine>=1.55&&styles.feedLine>=1.55,`${theme}/${width} reading line height`);
    assert.ok(styles.metadata>=13&&styles.summaryMetadata>=13&&styles.summaryText>=16&&styles.heading>=22,`${theme}/${width} metadata, summary and heading size`);
    assert.equal(await view.page.locator('.ck-web').count(),0,'decorative WebGL does not run behind text');
    if(width===390){
      await view.page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
      const visible=await view.page.evaluate(()=>{const bottom=document.querySelector('#publico').getBoundingClientRect().bottom,bar=document.querySelector('.ck-savebar').getBoundingClientRect().top;return bottom<=bar+1;});
      assert.ok(visible,'the final content can scroll above the fixed publication bar');
      await view.page.evaluate(()=>scrollTo(0,0));
    }
    if(process.env.COCKPIT_QA_DIR)await view.page.screenshot({path:join(process.env.COCKPIT_QA_DIR,`${theme}-${width}.png`),fullPage:false});
    if(process.env.COCKPIT_QA_DIR&&theme==='light'&&width===1440){
      await view.page.locator('.ck-overview').evaluate(node=>node.scrollIntoView({block:'start'}));
      await view.page.screenshot({path:join(process.env.COCKPIT_QA_DIR,'light-1440-atividade.png'),fullPage:false});
    }
    await view.context.close();
  }
  console.log('PASS synthetic cockpit: partial, valid-empty, unknown and disabled source; network failure and revoked session.');
} finally {await browser.close();}
