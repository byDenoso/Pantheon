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
  for(const width of [390,1440]) for(const path of ['/','/claims/','/pesquisa/energia-escura-faixas-supernovas']) {
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
    await page.goto(origin+path,{waitUntil:'domcontentloaded'});
    if(path==='/claims/')await page.locator('.nexo-claim-list').waitFor();
    if(path.startsWith('/pesquisa/'))await page.locator('.nexo-record').waitFor();
    await page.addScriptTag({path:axePath});
    const violations=await page.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}})).violations.map(({id,impact,nodes})=>({id,impact,count:nodes.length}))); // Runtime injected by axe-core.
    checks.push({path,width,violations});
    await page.close();
  }
} finally {await browser.close();}
console.log(JSON.stringify({tool:'axe-core',notice:'Automated checks only; not a conformance audit.',checks},null,2));
assert.equal(checks.flatMap(x=>x.violations).length,0,'axe-core reported WCAG failures');
