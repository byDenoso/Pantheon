// Local public-only UI regression. No private source, identity or credentials.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {publicAtlasProjection} from '../worker/public-tests.mjs';
import {publicEditorialProjection} from '../worker/public-editorial.mjs';
import {visualPublicProjection} from '../worker/public-visuals.mjs';
import {campaignPublicProjection} from '../worker/public-campaigns.mjs';
import {cosmologyPublicProjection} from '../worker/public-cosmology.mjs';
import {plotCsv} from '../src/atlas/publicVisuals.ts';

const output='/tmp/nexo-mobile-figure-fix';
const pub=cosmologyPublicProjection(visualPublicProjection(publicEditorialProjection(campaignPublicProjection(publicAtlasProjection()))));
const source=pub.visuals.find(v=>v.id==='summary-b23ed913238c1ec20f39-1');
assert.deepEqual(source.plot.series[0].points,[{x:1,y:91}]);
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 const json=v=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));};
 if(u.pathname==='/api/atlas-access')return json({signedIn:false,owner:false,setupRequired:false});
 if(u.pathname==='/api/atlas-public')return json(pub);
 if(u.pathname==='/api/atlas-locale')return json({contract:'ATLAS_LOCALE_V1',locale:u.searchParams.get('lang')||'pt-BR',source:'preference',supported:['pt-BR','en']});
 const p=u.pathname==='/'?'index.html':u.pathname.slice(1);
 if(!/^(index\.html|assets\/[A-Za-z0-9_.-]+)$/.test(p)){res.statusCode=404;return res.end();}
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'})[extname(p)]||'application/octet-stream');res.end(await readFile(resolve('dist/client',p)));}catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const errors=[],report=[];
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
 await mkdir(output,{recursive:true});
 for(const locale of ['pt-BR','en'])for(const width of [360,390,400,430,1280]){
  const context=await browser.newContext({viewport:{width,height:950},isMobile:width<720,hasTouch:width<720,reducedMotion:'reduce',colorScheme:'light'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('atlas.theme','dark');sessionStorage.setItem('nexo.public.explorer.v1.tab','"figures"');sessionStorage.setItem('nexo.public.explorer.v1.figures.page','1');});
  await page.goto(`${origin}/?lang=${locale}`);
  const gallery=page.locator('.nexo-visual-gallery').first();
  await gallery.locator('.nexo-gallery-count').filter({hasText:'7–12 / 37'}).waitFor();
  const card=gallery.locator('.nexo-visual-card').first(),summary=card.locator('.nexo-technical-plot>summary');
  assert.match(await card.locator('.nexo-stat-number').textContent(),/91/);
  await summary.focus();await page.keyboard.press('Enter');
  const chart=card.locator('.nexo-plot-svg'),frame=card.locator('.nexo-plot-frame'),zoom=card.locator('.nexo-plot-controls select'),pan=card.getByRole('slider');
  await chart.waitFor();
  const fit=async()=>{
   await page.waitForFunction(()=>{const svg=document.querySelector('.nexo-technical-plot[open] .nexo-plot-svg');return svg&&Math.abs(svg.viewBox.baseVal.width-Math.min(800,Math.max(160,svg.clientWidth)))<1;});
   const dimensions=await frame.evaluate(el=>{const s=el.querySelector('svg'),f=el.getBoundingClientRect(),r=s.getBoundingClientRect();return {frame:f.width,svg:r.width,scroll:el.scrollWidth,client:el.clientWidth,pointBounds:[...s.querySelectorAll('.nexo-plot-point')].map(p=>{const b=p.getBoundingClientRect();return {left:b.left-f.left,right:b.right-f.left,top:b.top-f.top,bottom:b.bottom-f.top};}),height:f.height};});
   assert.ok(dimensions.svg<=dimensions.frame+.5,JSON.stringify({locale,width,...dimensions}));
   assert.ok(dimensions.scroll<=dimensions.client,JSON.stringify(dimensions));
   assert.equal(dimensions.pointBounds.length,1);
   const readability=await chart.evaluate(svg=>{const scale=svg.getScreenCTM().a;return {font:parseFloat(getComputedStyle(svg.querySelector('.nexo-plot-axis text')).fontSize)*scale,marker:Number(svg.querySelector('.nexo-plot-point').getAttribute('r'))*2*scale,hit:Number(svg.querySelector('.nexo-plot-hit').getAttribute('r'))*2*scale};});
   assert.ok(readability.font>=10,JSON.stringify(readability));assert.ok(readability.marker>=7.9,JSON.stringify(readability));assert.ok(readability.hit>=43.9,JSON.stringify(readability));
   assert.ok(dimensions.pointBounds.every(p=>p.left>=0&&p.right<=dimensions.frame&&p.top>=0&&p.bottom<=dimensions.height),JSON.stringify(dimensions));
   assert.equal(await zoom.inputValue(),'1');assert.equal(await pan.isDisabled(),true);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   return dimensions;
  };
  const dimensions=await fit();
  assert.equal(await frame.getAttribute('role'),'region');await frame.focus();assert.equal(await frame.evaluate(el=>el===document.activeElement),true);
  // Domain zoom and keyboard pan remain available without forcing an oversized SVG.
  await zoom.selectOption('4');assert.equal(await pan.isDisabled(),false);
  const initialX=Number(await chart.locator('.nexo-plot-point').getAttribute('cx'));
  await pan.focus();await page.keyboard.press('End');assert.equal(await pan.inputValue(),'100');
  assert.ok(Number(await chart.locator('.nexo-plot-point').getAttribute('cx'))<initialX);
  await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');assert.equal(await pan.inputValue(),'1');
  await card.getByRole('button',{name:locale==='en'?'Reset view':'Restaurar visão',exact:true}).click();await fit();
  const legend=card.locator('.nexo-plot-legend button');await legend.focus();await page.keyboard.press('Enter');assert.equal(await chart.locator('.nexo-plot-point').count(),0);await page.keyboard.press('Enter');await fit();
  const circle=chart.locator('.nexo-plot-point'),point=await circle.boundingBox();await page.mouse.move(point.x+point.width/2,point.y+point.height/2);
  assert.match(await card.locator('.nexo-plot-readout').textContent(),/91/);
  const tableSummary=card.locator('.nexo-data-table>summary');await tableSummary.focus();await page.keyboard.press('Enter');
  assert.deepEqual(await card.locator('tbody tr td').allTextContents(),['1','91','—','—']);
  const csvEvent=page.waitForEvent('download');await card.getByRole('button',{name:locale==='en'?'Download data (CSV)':'Baixar dados (CSV)',exact:true}).click();
  const csv=await csvEvent,csvPath=`${output}/${locale}-${width}.csv`;await csv.saveAs(csvPath);assert.equal(await readFile(csvPath,'utf8'),plotCsv(source.plot,locale));
  const svgEvent=page.waitForEvent('download');await card.getByRole('button',{name:locale==='en'?'Download plot (SVG)':'Baixar gráfico (SVG)',exact:true}).click();
  const svg=await svgEvent,svgPath=`${output}/${locale}-${width}.svg`;await svg.saveAs(svgPath);
  const exported=await readFile(svgPath,'utf8');assert.ok(exported.includes(`viewBox="${await chart.getAttribute('viewBox')}"`));assert.ok(exported.includes(`cx="${await chart.locator('.nexo-plot-point').getAttribute('cx')}"`));assert.doesNotMatch(exported,/nexo-plot-hit/);assert.doesNotMatch(exported,/NaN|Infinity/);
  await tableSummary.click();await summary.click();assert.equal(await card.locator('.nexo-technical-plot').getAttribute('open'),null);await summary.click();await fit();
  if(width===400){await frame.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/fit-${locale}-${width}.png`});await page.setViewportSize({width:1280,height:950});await fit();await page.setViewportSize({width,height:950});await fit();}
  report.push({locale,width,...dimensions,zoomPan:true,keyboard:true,exactCsv:true,svg:true,reopen:true});
  await context.close();
 }
 // Observe the very first DOM-mounted artwork, with API responses held pending.
 // Saved preferences must win even when the OS preference is the opposite.
 for(const route of ['/?lang=en','/?lang=en&pergunta=loading-regression','/?lang=en#/privado'])for(const pref of ['light','dark']){
  const context=await browser.newContext({viewport:{width:400,height:850},colorScheme:pref==='dark'?'light':'dark',reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(pref=>{
   localStorage.setItem('atlas.theme',pref);window.__themeSnapshots=[];
   const sample=()=>{const art=document.querySelector('.nexo-cosmic-backdrop');if(art)window.__themeSnapshots.push({theme:document.documentElement.dataset.theme,illustration:art.dataset.illustration});};
   new MutationObserver(sample).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-theme','data-illustration']});
  },pref);
  let release;const held=new Promise(r=>release=r);
  await page.route('**/api/atlas-public',async r=>{await held;await r.fulfill({json:pub});});
  await page.route('**/api/atlas-access',async r=>{await held;await r.fulfill({json:{signedIn:false,owner:false,setupRequired:false}});});
  await page.goto(origin+route);await page.locator('.nexo-cosmic-backdrop').waitFor();
  const snapshots=await page.evaluate(()=>window.__themeSnapshots);assert.ok(snapshots.length>0);
  assert.ok(snapshots.every(s=>s.theme===pref&&s.illustration===(pref==='light'?'cmb':'cosmic-expansion')),JSON.stringify({route,pref,snapshots}));
  assert.ok(await page.getByText(/Loading|Checking your account/).count()>0);
  release();await page.waitForLoadState('networkidle');
  // Switch appearance and follow the system, including an OS-theme change.
  await page.getByRole('button',{name:/^(Menu|Options)$/}).click();
  const themes=page.getByRole('group',{name:'Theme'});
  await themes.getByRole('button',{name:pref==='dark'?'Light':'Dark',exact:true}).click();
  await page.waitForFunction(expected=>document.documentElement.dataset.theme===expected&&document.querySelector('.nexo-cosmic-backdrop')?.dataset.illustration===(expected==='light'?'cmb':'cosmic-expansion'),pref==='dark'?'light':'dark');
  await themes.getByRole('button',{name:'System',exact:true}).click();await page.emulateMedia({colorScheme:pref});
  await page.waitForFunction(expected=>document.documentElement.dataset.theme===expected&&document.querySelector('.nexo-cosmic-backdrop')?.dataset.illustration===(expected==='light'?'cmb':'cosmic-expansion'),pref);
  report.push({route,pref,initialTheme:true,pendingApi:true,themeSwitch:true,systemChange:true});await context.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile(output+'/report.json',JSON.stringify(report,null,2));
 console.log('PASS: 91% figure fits at 1× in PT/EN at 360/390/400/430/1280px; zoom, keyboard pan, reset, series, exact CSV/SVG, reopen and resizing. First-mount theme matches saved preference on public, study and private-loading routes; switching/system changes work.');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
