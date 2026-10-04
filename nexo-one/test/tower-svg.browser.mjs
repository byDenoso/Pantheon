import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const output=process.env.TOWER_SVG_OUTPUT||'output/galaxy-performance';
await mkdir(output,{recursive:true});
const baseUrl = (process.env.NEXO_BASE_URL || 'http://127.0.0.1:4185').replace(/\/$/, '');
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
const deadline=setTimeout(()=>{console.error('SVG matrix exceeded six minutes');void browser.close();},360000);
const report=[];
try{
 for(const [profile,width,height] of [['desktop',1440,960],['tablet',1080,1130],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${baseUrl}/#/agora`);
  await page.getByRole('button',{name:'Explorar a teia',exact:true}).waitFor();
  await page.locator('svg[data-tower-svg-native="observatory"][data-ready="true"]').waitFor();
  await page.locator('svg[data-tower-svg-surface][data-ready="true"]').waitFor();
  assert.equal(await page.locator('[data-tower-svg-host]').count(),1,'whole visible Tower uses one vector surface');
  assert.equal(await page.evaluate(()=>document.body.classList.contains('tower-svg-active')),true);
  for(const theme of ['dark','light']){
   const actual=await page.locator('html').getAttribute('data-theme');
   if(actual!==theme)await page.getByRole('button',{name:theme==='light'?'Ativar tema claro':'Ativar tema escuro',exact:true}).click();
   for(const route of ['agora','universo','ciclo','roadmaps','evidencia','saude','atlas?view=galaxy','atlas?view=2d','atlas?view=3d']){
    console.log(profile,theme,route);
    await page.goto(`${baseUrl}/?svgMirror=1#/${route}`);
    await page.locator('svg[data-tower-svg-surface][data-ready="true"]').waitFor();
    const native=route.startsWith('atlas')?route.endsWith('galaxy')?'galaxy':route.endsWith('2d')?'metro2d':'metro3d':'observatory';
    await page.locator(`svg[data-tower-svg-native="${native}"][data-ready="true"]`).waitFor();
    await page.waitForTimeout(1400);
    const metrics=await page.evaluate(()=>({
     theme:document.documentElement.dataset.theme,
     svg:document.querySelectorAll('svg').length,
     foreignObjects:document.querySelectorAll('foreignObject').length,
     visibleCanvases:[...document.querySelectorAll('canvas')].filter(e=>e.getBoundingClientRect().width>0&&getComputedStyle(e).display!=='none').length,
     horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2,
     bodyText:document.body.innerText.slice(0,200),
    }));
    assert.ok(metrics.svg>0,`${route} SVG missing`);
    assert.equal(metrics.foreignObjects,0,`${route} must render vector primitives`);
    assert.equal(metrics.visibleCanvases,0,`${route} still renders a bitmap surface`);
    assert.equal(metrics.horizontalOverflow,false,`${route} overflows the viewport`);
    if(route==='agora'||route==='atlas?view=galaxy')await page.screenshot({path:`${output}/svg-${profile}-${theme}-${route.split('?')[0]}.png`});
    report.push({profile,route,...metrics});
   }
  }
  assert.deepEqual(errors,[],`${profile} unhandled errors`);
  await context.close();
 }
 console.log(`Tower SVG: ${report.length} route/theme/viewport checks passed`);
}finally{
 clearTimeout(deadline);
 await writeFile(`${output}/tower-svg-browser.json`,JSON.stringify(report,null,2));
 await browser.close();
}
