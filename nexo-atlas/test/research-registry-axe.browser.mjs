// Accessibility audit of the actual local build and reviewed public snapshot.
// It does not attest a particular physical device or full WCAG conformance.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const origin=process.env.NEXO_BASE_URL ?? 'http://127.0.0.1:4195';
const axePath=process.env.AXE_JS ?? resolve('node_modules/axe-core/axe.min.js');
if(!existsSync(axePath))throw new Error('axe-core JS indisponível; instale as dependências do pacote.');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-gpu']});
const checks=[];
try {
  for(const theme of ['light','dark']) for(const width of [390,1440]) for(const path of ['/','/claims/','/pesquisa/energia-escura-faixas-supernovas']) {
    // axe is injected only inside this test context; the deployed CSP is unchanged.
    const page=await browser.newPage({viewport:{width,height:900},colorScheme:theme,reducedMotion:'reduce',bypassCSP:true});
    await page.addInitScript(theme=>localStorage.setItem('atlas.theme',theme),theme);
    await page.goto(origin+path,{waitUntil:'domcontentloaded'});
    if(path==='/')await page.locator('.nexo-research-hub').waitFor();
    if(path==='/claims/')await page.locator('.nexo-claim-list').waitFor();
    if(path.startsWith('/pesquisa/'))await page.locator('.nexo-record').waitFor();
    await page.addScriptTag({path:axePath});
    const violations=await page.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}})).violations.map(({id,impact,nodes})=>({id,impact,count:nodes.length}))); // Runtime injected by axe-core.
    checks.push({path,width,theme,violations});
    await page.close();
  }
  // A failed optional hub chunk must leave the rest of the page usable and
  // expose a recovery action instead of a blank catalog or a broken shell.
  const page=await browser.newPage({reducedMotion:'reduce'});
  let blockedHub=false;
  await page.route(/\/assets\/PublicResearchHub-[^/]+\.js(?:\?.*)?$/,route=>{blockedHub=true;return route.abort('failed');});
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await page.getByRole('alert').filter({hasText:'Não foi possível carregar o catálogo de pesquisa.'}).waitFor();
  assert.ok(blockedHub,'the catalog chunk request was intercepted');
  assert.ok(await page.locator('#public-title').isVisible(),'the landing page remains visible');
  assert.ok(await page.getByRole('button',{name:'Recarregar a página'}).isVisible(),'a recovery action is visible');
  await page.close();
  const study=await browser.newPage({reducedMotion:'no-preference'});
  const studyRequests=[];
  study.on('request',request=>studyRequests.push(request.url()));
  await study.goto(origin+'/pesquisa/energia-escura-faixas-supernovas',{waitUntil:'networkidle'});
  await study.locator('.nexo-record').waitFor();
  const staticCatalog=studyRequests.filter(url=>new URL(url).pathname==='/atlas-public.json');
  if(staticCatalog.length){
    assert.equal(staticCatalog.length,1,'the preloaded snapshot is reused rather than fetched twice');
    assert.equal(await study.locator('link[rel="preload"][href="/atlas-public.json"][as="fetch"]').count(),1,'the static snapshot starts loading from the document');
  }
  assert.ok(!studyRequests.some(url=>/\/assets\/gsap-[^/]+\.js/.test(url)),'study pages do not download unused cinematic animation');
  await study.close();
  const home=await browser.newPage({reducedMotion:'no-preference'});
  const animation=home.waitForRequest(request=>/\/assets\/gsap-[^/]+\.js/.test(request.url()));
  await home.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await animation;
  await home.locator('.nexo-research-hub').waitFor();
  const returnLink=home.locator('.nexo-map-open').first();
  await returnLink.scrollIntoViewIfNeeded();
  await returnLink.focus();
  const before=await home.evaluate(()=>({y:window.scrollY,href:document.activeElement?.getAttribute('href')}));
  assert.ok(before.href && before.y>0,'a visible catalog link can be saved for return navigation');
  let releaseHub,startedHub;
  const hubGate=new Promise(resolve=>{releaseHub=resolve;});
  const hubRequest=new Promise(resolve=>{startedHub=resolve;});
  await home.route(/\/assets\/PublicResearchHub-[^/]+\.js(?:\?.*)?$/,async route=>{startedHub();await hubGate;await route.continue();});
  let requestTimer;
  try {
    await home.goto(origin+'/?retorno=1#/',{waitUntil:'domcontentloaded'});
    await Promise.race([hubRequest,new Promise((_,reject)=>{requestTimer=setTimeout(()=>reject(new Error('catalog request did not start')),10000);})]);
    assert.equal(await home.locator('.nexo-research-hub').count(),0,'catalog chunk is still delayed');
    releaseHub();
    await home.locator('.nexo-research-hub').waitFor();
    await home.waitForFunction(({y,href})=>Math.abs(window.scrollY-y)<6&&document.activeElement?.getAttribute('href')===href,before);
  } finally {clearTimeout(requestTimer);releaseHub();}
  await home.close();
  // A visitor may search from the hero before the lazily loaded hub exists.
  const queued=await browser.newPage({reducedMotion:'reduce'});
  let releaseSearch,startedSearch;
  const searchGate=new Promise(resolve=>{releaseSearch=resolve;});
  const searchRequest=new Promise(resolve=>{startedSearch=resolve;});
  await queued.route(/\/assets\/PublicResearchHub-[^/]+\.js(?:\?.*)?$/,async route=>{startedSearch();await searchGate;await route.continue();});
  let searchTimer;
  try {
    await queued.goto(origin+'/',{waitUntil:'domcontentloaded'});
    await Promise.race([searchRequest,new Promise((_,reject)=>{searchTimer=setTimeout(()=>reject(new Error('catalog request did not start')),10000);})]);
    await queued.getByRole('searchbox',{name:'Buscar uma pergunta'}).fill('energia escura');
    await queued.getByRole('button',{name:'Buscar',exact:true}).click();
    releaseSearch();
    await queued.locator('.nexo-research-hub').waitFor();
    await queued.waitForFunction(()=>document.querySelector('.nexo-research-map input[type=search]')?.value==='energia escura',null,{timeout:3000});
    await queued.getByRole('tab',{name:'Figuras e gráficos'}).click();
    await queued.getByRole('searchbox',{name:'Buscar uma pergunta'}).fill('supernovas');
    await queued.getByRole('button',{name:'Buscar',exact:true}).click();
    await queued.waitForFunction(()=>document.querySelector('.nexo-research-map input[type=search]')?.value==='supernovas',null,{timeout:3000});
    await queued.getByRole('searchbox',{name:'Buscar uma pergunta'}).fill('energia escura');
    await queued.getByRole('button',{name:'Buscar',exact:true}).click();
    await queued.waitForFunction(()=>document.querySelector('.nexo-research-map input[type=search]')?.value==='energia escura',null,{timeout:3000});
    const select=queued.locator('.nexo-orbit-node').nth(1);
    await select.click();
    const selectedTitle=await queued.locator('.nexo-map-selected h4').textContent();
    const selectedLink=queued.locator('.nexo-map-open');
    const selectedHref=await selectedLink.getAttribute('href');
    await selectedLink.click();
    await queued.locator('.nexo-record').waitFor();
    await queued.locator('.nexo-study-breadcrumb a').click();
    await queued.locator('.nexo-research-hub').waitFor();
    assert.equal(await queued.getByRole('searchbox',{name:'Buscar pergunta',exact:true}).inputValue(),'energia escura','search survives returning from study');
    assert.equal(await queued.locator('.nexo-map-selected h4').textContent(),selectedTitle,'selected question survives returning from study');
    await queued.waitForFunction(href=>document.activeElement?.getAttribute('href')===href,selectedHref);
  } finally {clearTimeout(searchTimer);releaseSearch();await queued.close();}
} finally {await browser.close();}
console.log(JSON.stringify({tool:'axe-core',notice:'Automated checks only; not a conformance audit.',checks},null,2));
assert.equal(checks.flatMap(x=>x.violations).length,0,'axe-core reported WCAG failures');
