import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const label=process.env.PERF_LABEL||'baseline';
const out='output/runtime-performance'; await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
// Bound each browser/GPU run to three minutes and close its owned browser on timeout.
const deadline=setTimeout(()=>{console.error('Runtime benchmark exceeded 180 seconds');void browser.close();},180000);
const runs=[];
try {
 const page=await browser.newPage({viewport:{width:1440,height:960}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  window.__runtime={frames:0,cpu:0,long:[],gaps:[],last:0};
  const raf=requestAnimationFrame.bind(window);
  window.requestAnimationFrame=fn=>raf(now=>{const t=performance.now();fn(now);window.__runtime.cpu+=performance.now()-t;window.__runtime.frames++;});
  const tick=now=>{if(window.__runtime.last)window.__runtime.gaps.push(now-window.__runtime.last);window.__runtime.last=now;raf(tick);};raf(tick);
  new PerformanceObserver(list=>{for(const e of list.getEntries())window.__runtime.long.push(e.duration);}).observe({type:'longtask',buffered:true});
 });
 await page.goto((process.env.NEXO_BASE_URL||'http://127.0.0.1:4185')+'/#/agora');
 await page.locator('svg[data-tower-svg-surface][data-ready="true"]').waitFor();
 await page.waitForTimeout(5000);
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 const snapshot=async()=>({p:await page.evaluate(()=>({...window.__runtime,now:performance.now(),scene:{...document.querySelector('.obs-scene').dataset},surface:{...document.querySelector('[data-tower-svg-host]').dataset}})),m:Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]))});
 for(const phase of ['idle','orbit','scroll']){
  if(phase==='orbit')await page.getByRole('button',{name:'Explorar a teia',exact:true}).click();
  for(let i=0;i<3;i++){
   await page.waitForTimeout(800);const a=await snapshot();
   if(phase==='orbit'){await page.mouse.move(930,440);await page.mouse.down();for(let n=0;n<24;n++){await page.mouse.move(930+n*3,440+Math.sin(n*.2)*20);await page.waitForTimeout(16);}await page.mouse.up();}
   else if(phase==='scroll'){for(let n=0;n<6;n++){await page.mouse.wheel(0,n<3?180:-180);await page.waitForTimeout(120);}}
   else await page.waitForTimeout(1400);
   const b=await snapshot(),seconds=(b.p.now-a.p.now)/1000,gaps=b.p.gaps.slice(a.p.gaps.length).sort((x,y)=>x-y);
   if(errors.length)throw new Error('Scene errors: '+errors.join('; '));
   if(phase!=='scroll'&&Number(b.p.scene.renderCount)<=Number(a.p.scene.renderCount))throw new Error('Scene stopped rendering during '+phase);
   runs.push({phase,cpuMsPerSecond:(b.p.cpu-a.p.cpu)/seconds,taskMsPerSecond:(b.m.TaskDuration-a.m.TaskDuration)*1000/seconds,layoutMsPerSecond:(b.m.LayoutDuration-a.m.LayoutDuration)*1000/seconds,styleMsPerSecond:(b.m.RecalcStyleDuration-a.m.RecalcStyleDuration)*1000/seconds,gapP95:gaps[Math.floor(gaps.length*.95)],gapMax:gaps.at(-1),longTasks:b.p.long.slice(a.p.long.length),repaints:Number(b.p.surface.repaintCount)-Number(a.p.surface.repaintCount),surface:b.p.surface});
  }
  if(phase==='orbit')await page.getByRole('button',{name:'Voltar ao painel',exact:true}).click();
 }
 await page.screenshot({path:`${out}/${label}.png`});
 await writeFile(`${out}/${label}.json`,JSON.stringify({label,scope:'Edge headless synthetic workload; same public snapshot; RAF gaps are not display FPS',runs},null,2));
 console.log(JSON.stringify(runs.map(({surface,...r})=>r),null,2));
}finally{clearTimeout(deadline);await browser.close();}

