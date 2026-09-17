import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const baseUrl=process.env.NEXO_BASE_URL||'http://127.0.0.1:4173';
const modes=['general','operations','truth','capabilities','learning','nexo'];
const browser=await chromium.launch({headless:true});

async function verify(width,height){
  const context=await browser.newContext({viewport:{width,height},locale:'pt-BR'}),page=await context.newPage();
  await page.route('**/api/session',route=>route.fulfill({json:{configured:false,authenticated:false,access:'PUBLIC'}}));
  await page.goto(`${baseUrl}/#atlas/general`);
  await page.getByRole('heading',{name:'Atlas.'}).waitFor();
  const selector=page.getByRole('combobox',{name:'Modo do grafo'});
  assert.equal(await selector.count(),1,'seletor dos grafos deve existir');
  assert.equal((await selector.locator('option').all()).length,6,'seis modos de grafo');
  for(const mode of modes){
    await selector.selectOption(mode);
    await page.waitForFunction(expected=>location.hash===`#atlas/${expected}`,mode);
    assert.equal(await page.locator('.atlas-layout').getAttribute('data-graph-mode'),mode,`modo ${mode}`);
    assert.equal(await page.locator('.atlas-stage').count(),1,`stage ${mode}`);
  }
  const overflow=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth}));
  assert.ok(overflow.scrollWidth<=overflow.innerWidth+1,`overflow ${width}px: ${overflow.scrollWidth}>${overflow.innerWidth}`);
  await context.close();
}

try{await verify(1440,1000);await verify(390,844);}finally{await browser.close();}
console.log('GRAPH_BROWSER: PASS');
