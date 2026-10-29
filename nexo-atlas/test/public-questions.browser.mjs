// Public-only local UI verification. No real private source or identity is served.
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
const output = process.env.PUBLIC_QUESTION_QA_DIR || '/tmp/nexo-public-question-qa';
const server=createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  const json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
  if(u.pathname==='/api/atlas-access')return json({signedIn:false,owner:false,setupRequired:false});
  if(u.pathname==='/api/atlas-public')return json(publicAtlasProjection());
  if(u.pathname==='/api/atlas-locale')return json({contract:'ATLAS_LOCALE_V1',locale:u.searchParams.get('lang')||'pt-BR',source:'preference',supported:['pt-BR','en']});
  const path=u.pathname==='/'?'index.html':u.pathname.slice(1);
  if(!/^(index\.html|assets\/[A-Za-z0-9_.-]+)$/.test(path)){res.statusCode=404;return res.end();}
  try {res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.woff2':'font/woff2','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(await readFile(resolve('dist/client',path)));}catch {res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']}), errors=[],report=[];
await mkdir(output,{recursive:true});
try {
  for (const width of [360,390,1280]) {
    const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,isMobile:width<720,hasTouch:width<720,reducedMotion:'reduce'});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);await page.locator('.atlas-test-list').waitFor();
    await page.locator('#s-works').scrollIntoViewIfNeeded();
    assert.equal(await page.getByRole('status').textContent(),'36 perguntas investigadas · 215 testes associados');
    assert.equal(await page.locator('.atlas-question-group').count(),8);
    assert.equal(await page.locator('.atlas-public-test:visible').count(),0);
    assert.equal(await page.locator('.atlas-campaign-reading').count(),8);
    const titles=await page.locator('.atlas-question-group>h3').allTextContents();assert.equal(new Set(titles).size,8);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
    await page.screenshot({path:`${output}/questions-${width}.png`,fullPage:false});
    const redshift=page.locator('.atlas-question-group').filter({has:page.locator('h3',{hasText:'depende de uma faixa de redshift'})});
    const disclosure=redshift.locator('.atlas-question-details>summary');
    await disclosure.focus();await page.keyboard.press('Enter');
    assert.equal(await redshift.locator('.atlas-question-details').getAttribute('open'),'');
    assert.match(await disclosure.textContent(),/Ocultar 51 testes/);
    await redshift.locator('.atlas-test-variant>summary').first().click();
    assert.equal(await redshift.locator('.atlas-public-test:visible dt').count(),4);
    assert.match(await redshift.locator('.atlas-public-test:visible').textContent(),/Resultado/);
    await redshift.locator('.atlas-campaign-conditions>summary').click();
    assert.ok(await redshift.locator('.atlas-campaign-conditions dl>div').count()>0);
    assert.match(await redshift.locator('.atlas-campaign-repeats').textContent(),/3 registros associados/);
    await redshift.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/expanded-${width}.png`,fullPage:false});
    await disclosure.click();assert.equal(await redshift.locator('.atlas-public-test:visible').count(),0);
    await disclosure.click();await disclosure.click();assert.equal(await redshift.locator('.atlas-public-test:visible').count(),0);
    let accessibleTests=await page.locator('.atlas-public-test').count(), questionCount=8;
    for(let n=1;n<5;n++) {await page.getByRole('button',{name:'Próxima',exact:true}).click();accessibleTests+=await page.locator('.atlas-public-test').count();questionCount+=await page.locator('.atlas-question-group').count();}
    assert.equal(accessibleTests,215);assert.equal(questionCount,36);
    assert.ok(await page.getByRole('button',{name:'Próxima',exact:true}).isDisabled());
    await page.getByRole('searchbox').fill('mínimo de 30 casos');
    assert.equal(await page.getByRole('status').textContent(),'1 pergunta investigada · 1 teste associado nesta busca');
    assert.match(await page.locator('.atlas-question-details>summary').textContent(),/de 3 nesta pergunta/);
    await page.locator('.atlas-test-variant>summary').click();
    assert.match(await page.locator('.atlas-public-test:visible .atlas-original-question').textContent(),/mínimo de 30 casos/);
    assert.equal(await page.locator('.atlas-public-test:visible dt').count(),4);
    assert.match(await page.locator('.atlas-campaign-reading').textContent(),/três mínimos/);
    assert.match(await page.locator('.atlas-campaign-search-note').textContent(),/investigação completa/);
    await page.getByRole('searchbox').fill('minimo de 40 casos');assert.equal(await page.locator('.atlas-public-test').count(),1);
    await page.getByRole('searchbox').fill('Repetindo o mesmo desenho');assert.equal(await page.locator('.atlas-public-test').count(),3);assert.equal(await page.locator('.atlas-question-group').count(),1);
    assert.equal(await page.locator('.atlas-variant-label').filter({hasText:'Reexecução do mesmo desenho'}).count(),3);
    await page.getByRole('searchbox').fill('redshift efetivo 0,919');assert.equal(await page.locator('.atlas-public-test').count(),2);
    await page.getByRole('searchbox').fill('this-search-has-no-results');assert.equal(await page.locator('.atlas-public-test').count(),0);
    await page.getByRole('searchbox').fill('');assert.equal(await page.locator('.atlas-question-group').count(),8);assert.match(await page.locator('.atlas-test-pagination').textContent(),/Página 1/);
    assert.equal(await page.locator('.atlas-public-test:visible').count(),0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    report.push({width,questions:36,records:215,visibleOverview:8,preservedFourFields:true,searchThresholds:true,repeats:3,paginationReset:true,keyboardDisclosure:true,overflow:false});
    await context.close();
  }
  assert.deepEqual(errors,[]);await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
  console.log('PASS grouped public questions: 360/390/1280, 36 overviews / all 215 tests, four fields, honest counts, nested parameter/result search, three reruns, paging/reset, keyboard disclosures, empty state, no overflow or browser errors.');
} finally {await browser.close();await new Promise(r=>server.close(r));}
