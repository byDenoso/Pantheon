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
async function open(data,{theme='light',width=390,fakeClock=false}={}){
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.addInitScript(value=>localStorage.setItem('nexo.cockpit.theme',value),theme);
  const control={data,mode:'ok',reads:0};
  if(fakeClock)await page.clock.install();
  await page.route('**/api/atlas-session',route=>route.fulfill({status:200,json:route.request().method()==='DELETE'?{authenticated:false}:{configured:true,authenticated:true}}));
  await page.route('**/api/atlas-public-selection',route=>route.fulfill({status:200,json:{contract:'ATLAS_PUBLIC_SELECTION_V1',mode:'UNSET'}}));
  await page.route('**/api/atlas-cockpit',route=>{
    control.reads++;
    return control.mode==='network'?route.abort('failed'):control.mode==='unauth'?route.fulfill({status:401,json:{error:'AUTH_REQUIRED'}}):route.fulfill({status:200,json:control.data});
  });
  await page.goto(origin+'/cockpit.html',{waitUntil:'domcontentloaded'});
  await page.locator('.ck-hero').waitFor();
  return {context,page,control};
}

async function verifyMotion(){
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
  try {
    const page=await context.newPage();
    const session=Promise.withResolvers(), logout=Promise.withResolvers(), plot=Promise.withResolvers();
    const firstRead=Promise.withResolvers(), refresh=Promise.withResolvers(), lateRead=Promise.withResolvers();
    let reads=0, plotRequests=0, holdPlot=false;
    const result=(hours,titulo)=>({data:new Date(Date.now()-hours*3_600_000).toISOString(),task:'Synthetic',item:'TEST',titulo,resultado:'Amostra sintética.',numeros:'',limites:'',link_dados:''});
    const sample=snapshot();
    sample.shadow.resultados=[result(1,'Registro sintético'),result(12,'Registro sintético')];
    sample.shadow.counts.resultados=2;
    const next=structuredClone(sample);
    next.shadow.resultados.unshift(result(1/6,'Novo registro sintético'));
    next.shadow.counts.resultados=3;
    await page.route('**/api/atlas-session',async route=>route.fulfill({json:await (route.request().method()==='DELETE'?logout.promise:session.promise)}));
    await page.route('**/api/atlas-public-selection',route=>route.fulfill({json:{contract:'ATLAS_PUBLIC_SELECTION_V1',mode:'UNSET'}}));
    await page.route('**/api/atlas-cockpit',async route=>{
      const read=reads++;
      await [firstRead,refresh,lateRead][read].promise;
      await route.fulfill({json:read===0?sample:next});
    });
    await page.route('**/*',async route=>{
      if(holdPlot&&route.request().resourceType()==='script'){
        plotRequests++;
        await plot.promise;
      }
      await route.fallback();
    });
    await page.goto(origin+'/cockpit.html',{waitUntil:'domcontentloaded'});
    await page.getByText('Verificando a sessão…',{exact:true}).waitFor({timeout:5000});
    assert.equal(reads,0,'checking the session does not request the private snapshot');
    assert.equal(await page.locator('.ck-loading').count(),0,'the dashboard placeholder follows an authorized read');

    session.resolve({configured:true,authenticated:true});
    await page.getByText('Carregando dados do cockpit…',{exact:true}).waitFor({timeout:5000});
    assert.equal(await page.locator('.ck-loading [aria-hidden=true] .ck-skeleton-line').count()>0,true,'pending data has non-interactive placeholders');
    assert.equal(await page.locator('.ck-kpi dd').count(),0,'a pending read cannot look like a valid empty snapshot');
    holdPlot=true;
    const plotRequested=page.waitForRequest(request=>request.resourceType()==='script',{timeout:5000});
    firstRead.resolve();
    await page.locator('.ck-hero').waitFor();
    assert.equal(await page.locator('.ck-loading').count(),0);

    const chart=page.getByRole('region',{name:'Atividade registrada'});
    await chart.getByText('Carregando gráfico…',{exact:true}).waitFor({timeout:5000});
    assert.equal(await chart.getByRole('img').count(),0,'the pending chart has no chart semantics');
    await plotRequested;
    plot.resolve();
    await chart.getByRole('img',{name:'2 registros em 24 h'}).waitFor({timeout:5000});
    holdPlot=false;
    assert.ok(plotRequests>0,'the chart stays pending while its script loads');
    assert.equal(await page.locator('.ck-feed-item[data-fresh]').count(),0,'the initial snapshot does not mark the feed as a delta');
    const plotAnimationAfter=async action=>{
      const previous=await chart.locator('.nx-chart-canvas svg').elementHandle();
      assert.ok(previous);
      await action();
      const animation=await page.waitForFunction(oldPlot=>{
        const plot=document.querySelector('.nx-activity-chart .nx-chart-canvas svg');
        return plot && plot!==oldPlot ? getComputedStyle(plot).animationName : '';
      },previous);
      await previous.dispose();
      return animation.jsonValue();
    };
    const windowButton=chart.getByRole('button',{name:'6 h',exact:true});
    const windowAnimation=await plotAnimationAfter(()=>windowButton.press('Enter'));
    assert.equal(await windowButton.getAttribute('aria-pressed'),'true');
    await chart.getByRole('img',{name:'1 registros em 6 h'}).waitFor();
    assert.equal(windowAnimation,'ck-chart-enter','changing the time window animates the chart');

    const filter=page.getByRole('group',{name:'Filtrar linha do tempo'}).getByRole('button',{name:'Tudo',exact:true});
    await filter.press('Enter');
    assert.equal(await filter.evaluate(node=>getComputedStyle(node).outlineOffset),'-3px','keyboard focus stays visible inside the segmented control');
    const history=page.locator('#publico').getByRole('button',{name:/Histórico/});
    await history.press('Enter');
    await page.getByText('Nenhuma publicação ainda.',{exact:true}).waitFor();
    assert.equal(await history.getAttribute('aria-pressed'),'true');
    assert.notEqual(await page.locator('#ck-publication-content').evaluate(node=>getComputedStyle(node).animationName),'none');

    const summary=page.getByText('Cobertura e proveniência',{exact:true});
    await summary.press('Enter');
    assert.equal(await summary.evaluate(node=>node.parentElement.open),true);
    const detail=summary.locator('..').getByText(/A data de modificação é informada/);
    await detail.waitFor();
    assert.notEqual(await detail.evaluate(node=>getComputedStyle(node).animationName),'none','native disclosure animates its visible content');

    await page.getByRole('button',{name:'Pausar animações'}).click();
    assert.equal(await detail.evaluate(node=>getComputedStyle(node).animationName),'none');
    assert.equal(await detail.evaluate(node=>getComputedStyle(node).opacity),'1');
    const pausedAnimation=await plotAnimationAfter(()=>chart.getByRole('button',{name:'24 h',exact:true}).click());
    assert.equal(pausedAnimation,'none','manual pause also covers chart changes');
    await page.getByRole('button',{name:'Animar',exact:true}).click();
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.getByRole('button',{name:'Movimento reduzido'}).waitFor();
    await summary.press('Enter');
    await summary.press('Enter');
    assert.equal(await detail.evaluate(node=>getComputedStyle(node).animationName),'none','system reduced motion covers disclosures');

    await page.getByRole('button',{name:'Atualizar leitura'}).click();
    await page.getByText('Atualizando leitura…',{exact:true}).waitFor({state:'attached',timeout:5000});
    await chart.getByRole('img',{name:'2 registros em 24 h'}).waitFor();
    assert.equal(await page.locator('.ck-loading').count(),0,'refresh preserves the verified snapshot');
    refresh.resolve();
    await page.getByRole('button',{name:'Atualizar leitura'}).waitFor();
    assert.equal(reads,2);
    await chart.getByRole('img',{name:'3 registros em 24 h'}).waitFor();
    assert.equal(await page.locator('.ck-feed-item[data-fresh]').count(),1,'only the newly observed record is marked');

    await Promise.all([
      page.waitForRequest('**/api/atlas-cockpit'),
      page.getByRole('button',{name:'Atualizar leitura'}).click()
    ]);
    await page.getByRole('button',{name:'Sair',exact:true}).click();
    await page.getByText('Encerrando a sessão…',{exact:true}).waitFor();
    assert.equal(await page.locator('.ck-loading, .ck-dashboard').count(),0,'sign-out takes priority over a pending read');
    lateRead.resolve();
    logout.resolve({authenticated:false});
    await page.getByLabel('Código de acesso').waitFor();
    assert.equal(await page.locator('.ck-dashboard').count(),0);
  } finally {await context.close();}
}

try {
  await verifyMotion();
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
  const limited=snapshot();limited.shadow={available:false,reason:'SHADOW_CONNECT_RATE_LIMITED'};
  view=await open(limited,{fakeClock:true});
  await view.page.getByText('Atualização automática pausada pelo limite da conexão.').waitFor();
  await view.page.getByLabel('Atualizar a cada 5 minutos').check();
  await view.page.clock.fastForward(301000);
  assert.equal(view.control.reads,1,'no automatic reads during rate limiting');
  view.control.data=snapshot();
  await view.page.getByRole('button',{name:'Atualizar leitura'}).click();
  await view.page.getByText('SHADOW consultada',{exact:true}).waitFor();
  assert.equal(view.control.reads,2,'manual read restores the connected view');
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
    // Identity shared with nexoresearch.org: paper and deep-space grounds, one blue, ruled panels without a fill.
    assert.equal(styles.accent,theme==='light'?'#0033a0':'#9bb9ff');
    assert.equal(styles.background,theme==='light'?'rgb(247, 246, 242)':'rgb(2, 5, 11)');
    assert.equal(styles.panel,'rgba(0, 0, 0, 0)');
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
  console.log('PASS synthetic cockpit: deferred reads and plot, motion, keyboard, refresh and sign-out; source coverage, network failure and revoked session.');
} finally {await browser.close();}
