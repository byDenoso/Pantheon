import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const label = process.env.PERF_LABEL || 'baseline';
const output = 'output/galaxy-performance';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
 const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Performance.enable');
 await page.addInitScript(() => {
  window.__perf = { callbacks: 0, cpuMs: 0, draws: 0, canvases: 0 };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => raf(now => {
   const start = performance.now(); callback(now);
   window.__perf.callbacks++; window.__perf.cpuMs += performance.now() - start;
  });
  for (const type of [WebGLRenderingContext, WebGL2RenderingContext]) {
   for (const method of ['drawArrays', 'drawElements']) {
    const original = type.prototype[method];
    type.prototype[method] = function(...args) { window.__perf.draws++; return original.apply(this, args); };
   }
  }
  const create = document.createElement.bind(document);
  document.createElement = function(name, ...args) {
   if(name === 'canvas') window.__perf.canvases++;
   return create(name, ...args);
  };
 });
 await page.goto((process.env.NEXO_BASE_URL || 'http://127.0.0.1:4185') + (process.env.PERF_ROUTE || '/#/atlas?view=galaxy'));
 await page.locator(process.env.PERF_SELECTOR || '.galaxy-three-canvas').waitFor();
 await page.waitForTimeout(3500);
 await page.screenshot({ path: `${output}/${label}.png` });
 const runs = [];
 const snapshot = async () => {
  const counters=await page.evaluate(() => ({ ...window.__perf, now: performance.now() }));
  const metrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  return {...counters,taskMs:metrics.TaskDuration*1000,layoutMs:metrics.LayoutDuration*1000,styleMs:metrics.RecalcStyleDuration*1000};
 };
 for(let run=0;run<3;run++) {
  await page.waitForTimeout(2500);
  const before = await snapshot(); await page.waitForTimeout(1500); const after = await snapshot();
  const duration = (after.now-before.now)/1000;
  runs.push({ phase:'idle', cpuMsPerSecond:(after.cpuMs-before.cpuMs)/duration,taskMsPerSecond:(after.taskMs-before.taskMs)/duration,layoutMsPerSecond:(after.layoutMs-before.layoutMs)/duration,styleMsPerSecond:(after.styleMs-before.styleMs)/duration, drawsPerSecond:(after.draws-before.draws)/duration });
  await page.mouse.move(650,480); await page.mouse.down(); const movingBefore=await snapshot();
  for(let i=0;i<40;i++) { await page.mouse.move(650+i*3,480+Math.sin(i*.15)*35); await page.waitForTimeout(16); }
  await page.mouse.up(); const movingAfter=await snapshot(); const movingDuration=(movingAfter.now-movingBefore.now)/1000;
  runs.push({ phase:'orbit',cpuMsPerSecond:(movingAfter.cpuMs-movingBefore.cpuMs)/movingDuration,taskMsPerSecond:(movingAfter.taskMs-movingBefore.taskMs)/movingDuration,layoutMsPerSecond:(movingAfter.layoutMs-movingBefore.layoutMs)/movingDuration,styleMsPerSecond:(movingAfter.styleMs-movingBefore.styleMs)/movingDuration, drawsPerSecond:(movingAfter.draws-movingBefore.draws)/movingDuration });
 }
 const controls=(await page.locator('button').allTextContents()).slice(0,40);
 const report={label,viewport:'1440x960',scope:'RAF callback CPU submission time and WebGL draw calls; Edge headless, development server; not GPU frame time',runs,controls};
 await writeFile(`${output}/${label}.json`,JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
