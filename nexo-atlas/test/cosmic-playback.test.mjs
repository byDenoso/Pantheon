import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPlaybackClock, PLAYBACK_RATES, REPLAY_DURATION_MS} from '../src/tower-web/playback.ts';
import {buildTowerGraph} from '../src/tower-web/model.ts';
import {layoutCosmos} from '../src/tower-web/embed3d.ts';
import {buildScene, visibility, ALL_KINDS, styleOf, sampleEdges} from '../src/tower-web/scene.ts';
import {fitCamera} from '../src/tower-web/camera3d.ts';
import {createTowerLcdm} from '../src/tower-web/lcdm.ts';
import {drawFallback, drawOverlay} from '../src/tower-web/draw2d.ts';
import {buildFilaments, routeOf, AXIS} from '../src/tower-web/filaments.ts';

const min=Date.parse('2026-01-01T00:00:00Z'),max=Date.parse('2026-01-17T00:00:00Z');
function advance(clock,ms,start=0,step=20){clock.tick(start);for(let t=step;t<=ms;t+=step)clock.tick(start+t);}
test('all playback rates really scale elapsed time, independently of frame rate',()=>{
 for(const rate of PLAYBACK_RATES){
  for(const step of [10,20,40,100]){
   const clock=createPlaybackClock(min,max);clock.setRate(rate);clock.play();advance(clock,4000,0,step);
   assert.ok(Math.abs(clock.snapshot().cut-(min+(max-min)*4000*rate/REPLAY_DURATION_MS))<2);
  }
 }
});
test('pause holds the exact time; play resumes instead of restarting',()=>{
 const clock=createPlaybackClock(min,max);clock.setRate(1);clock.play();advance(clock,2000);
 const at=clock.snapshot().cut;clock.pause();clock.tick(60000);assert.equal(clock.snapshot().cut,at);
 clock.play();assert.equal(clock.snapshot().cut,at);clock.tick(61000);assert.equal(clock.snapshot().cut,at);
 clock.tick(61100);assert.ok(clock.snapshot().cut>at);assert.equal(clock.snapshot().playing,true);
});
test('seeking pauses, clamps to real bounds, and resumes from the sought timestamp',()=>{
 const clock=createPlaybackClock(min,max);clock.play();clock.seek((min+max)/2);
 assert.equal(clock.snapshot().playing,false);clock.play();advance(clock,200);
 assert.ok(clock.snapshot().cut>(min+max)/2);clock.seek(-1);assert.equal(clock.snapshot().cut,min);
 clock.seek(max+999);assert.equal(clock.snapshot().cut,max);clock.seek(null);assert.equal(clock.snapshot().cut,null);
});
test('changing rate during playback preserves position and changes subsequent speed',()=>{
 const clock=createPlaybackClock(min,max);clock.setRate(1);clock.play();advance(clock,1000);
 const at=clock.snapshot().cut;clock.setRate(0.25);assert.equal(clock.snapshot().cut,at);
 advance(clock,1000,1000);assert.equal(clock.snapshot().cut-at,(max-min)*1000*0.25/REPLAY_DURATION_MS);
 clock.setRate(4);assert.equal(clock.snapshot().rate,0.25);
});
test('hidden tabs, invalid timestamps and browser suspension never produce a catch-up jump',()=>{
 const clock=createPlaybackClock(min,max);clock.play();advance(clock,500);const at=clock.snapshot().cut;
 clock.tick(500000,true);clock.tick(600000,true);clock.tick(700000);assert.equal(clock.snapshot().cut,at);
 clock.tick(700020);assert.ok(clock.snapshot().cut>at);const beforeStall=clock.snapshot().cut;
 clock.tick(900000);assert.equal(clock.snapshot().cut,beforeStall);
 clock.tick(NaN);clock.tick(950000);assert.equal(clock.snapshot().cut,beforeStall);
});
test('completion stops at the last real date; explicit current view includes undated records',()=>{
 const clock=createPlaybackClock(min,max);clock.setRate(1);clock.play();advance(clock,REPLAY_DURATION_MS+100);
 assert.deepEqual(clock.snapshot(),{cut:max,playing:false,rate:1});clock.play();assert.equal(clock.snapshot().cut,min);
 clock.seek(null);assert.deepEqual(clock.snapshot(),{cut:null,playing:false,rate:1});
});
test('missing or identical published dates cannot play',()=>{
 for(const [a,b] of [[min,min],[Infinity,-Infinity],[NaN,max],[max,min]]){
  const clock=createPlaybackClock(a,b);clock.play();advance(clock,2000);assert.equal(clock.available,false);assert.equal(clock.snapshot().playing,false);assert.equal(clock.snapshot().cut,null);
 }
});

const records=[
 {id:'a',domain:'SCIENCE',createdAt:new Date(min).toISOString()},
 {id:'b',domain:'ENGINEERING',createdAt:new Date(max).toISOString(),parents:['a']},
 {id:'undated',domain:'SCIENCE',verdict:'UNVERIFIED'},
];
function fixture(){const graph=buildTowerGraph(records),layout=layoutCosmos(graph),scene=buildScene(graph,layout);return {graph,layout,scene};}
test('replay filters only canonical published dates, preserving graph, IDs, edges and undated records',()=>{
 const {graph,scene}=fixture();const before=JSON.stringify(graph);const xyz=scene.xyz.slice();
 const atStart=visibility(scene,{kinds:ALL_KINDS,minDegree:0,cut:min});
 assert.equal(atStart.node[scene.index.get('test:a')],1);assert.equal(atStart.node[scene.index.get('test:b')],0);assert.equal(atStart.node[scene.index.get('test:undated')],0);
 const atEnd=visibility(scene,{kinds:ALL_KINDS,minDegree:0,cut:max});assert.equal(atEnd.node[scene.index.get('test:b')],1);assert.equal(atEnd.node[scene.index.get('test:undated')],0);
 const current=visibility(scene,{kinds:ALL_KINDS,minDegree:0,cut:null});assert.equal(current.node[scene.index.get('test:undated')],1);
 assert.deepEqual(scene.xyz,xyz);assert.equal(JSON.stringify(graph),before);
});
function canvasRecorder(){
 const calls=[];const ctx=new Proxy({createRadialGradient:(...args)=>{calls.push(['gradient',...args]);return {addColorStop:(...s)=>calls.push(['stop',...s])};}}, {get(target,key){return target[key]??((...args)=>calls.push([key,...args]));},set(target,key,value){target[key]=value;return true;}});
 return {ctx,calls};
}
test('current Canvas renderer draws only visible scene content in both themes without decorative halos',()=>{
 const {graph,scene,layout}=fixture();const before=JSON.stringify(graph),xyz=scene.xyz.slice();
 const cam=fitCamera(layout.extent,900,600,layout.center);
 const visible=visibility(scene,{kinds:ALL_KINDS,minDegree:0,cut:null});const sample=sampleEdges(scene,visible.node,4000);const style=styleOf(scene,visible.node,sample.edge,null);
 for(const theme of ['dark','light'])for(const quality of ['low','high']){
  const frame={cam,w:900,h:600,dpr:1,theme,style,selected:null,hover:null,births:new Map(),labels:false,box:false,labelLevel:0};
  const first=canvasRecorder();drawFallback(first.ctx,scene,frame,buildFilaments(scene,quality));
  assert.equal(first.calls.filter(c=>c[0]==='arc').length,visible.visible);
  assert.ok(first.calls.some(c=>c[0]==='stroke'));
  assert.equal(first.calls.filter(c=>c[0]==='ellipse').length,0);
  assert.equal(first.calls.filter(c=>c[0]==='gradient').length,0);
  const next=canvasRecorder();drawFallback(next.ctx,scene,frame,buildFilaments(scene,quality));assert.deepEqual(next.calls,first.calls);
  const overlay=canvasRecorder();assert.equal(drawOverlay(overlay.ctx,scene,frame,false),false);
  assert.equal(overlay.calls.filter(c=>['arc','ellipse','stroke','fill','gradient'].includes(c[0])).length,0);
  const noNodes=canvasRecorder();drawFallback(noNodes.ctx,scene,{...frame,style:{node:new Float32Array(scene.nodes.length),edge:new Float32Array(scene.edges.length)}},buildFilaments(scene,quality));
  assert.equal(noNodes.calls.filter(c=>['arc','stroke','ellipse','gradient'].includes(c[0])).length,0);
 }
 assert.deepEqual(scene.xyz,xyz);assert.equal(JSON.stringify(graph),before);
});
test('filament routes and Canvas geometry map one-to-one to real graph edges',async()=>{
 const {graph,scene}=fixture();const before=JSON.stringify(graph),xyz=scene.xyz.slice();assert.ok(scene.edges.length>0);
 const oldIllustration=await import('../src/tower-web/cosmicIllustration.ts');assert.deepEqual(Object.keys(oldIllustration),[]);
 const filaments=buildFilaments(scene,'low');assert.equal(filaments.range.length,scene.edges.length*2);assert.equal(filaments.axis.length,scene.edges.length*(AXIS+1)*3);
 for(let i=0;i<scene.edges.length;i++){
  const edge=scene.edges[i],route=routeOf(scene,edge),start=3*i*(AXIS+1),end=start+3*AXIS;
  assert.equal(route[0],edge.a);assert.equal(route.at(-1),edge.b);assert.ok(filaments.range[2*i+1]>0);
  for(let c=0;c<3;c++){assert.ok(Math.abs(filaments.axis[start+c]-scene.xyz[3*edge.a+c])<1e-4);assert.ok(Math.abs(filaments.axis[end+c]-scene.xyz[3*edge.b+c])<1e-4);}
 }
 assert.deepEqual(scene.xyz,xyz);assert.equal(JSON.stringify(graph),before);
});
test('existing display expansion is bounded, paused, reduced-motion and hidden gated',()=>{
 const {scene,layout}=fixture();const xyz=scene.xyz.slice();const layoutBefore=JSON.stringify([...layout.pos]);
 const motion=createTowerLcdm({nodes:scene.xyz,dust:new Float32Array(0),containers:new Map(),anchors:layout.domainIds.map(id=>layout.pos.get(id)),center:layout.center,extent:layout.extent});
 for(const gate of [{paused:true},{hidden:true},{reducedMotion:true}])for(let i=0;i<100;i++)assert.equal(motion.step(0.05,gate),false);
 assert.deepEqual(scene.xyz,xyz);const startScale=motion.state.scaleFactor;for(let i=0;i<300;i++)motion.step(0.05);assert.ok(motion.state.expansion>=1&&motion.state.expansion<=1.24);assert.ok(motion.state.scaleFactor>startScale);assert.notDeepEqual(scene.xyz,xyz);
 assert.equal(JSON.stringify([...layout.pos]),layoutBefore);const paused=scene.xyz.slice();motion.step(100,{hidden:true});assert.deepEqual(scene.xyz,paused);
});
test('UI provides native seek, rate, pause/resume controls and tears down visibility listeners',()=>{
 const ui=readFileSync(new URL('../src/tower-web/TowerCosmos.tsx',import.meta.url),'utf8');
 const copy=readFileSync(new URL('../src/tower-web/tower-copy.ts',import.meta.url),'utf8');
 const hook=readFileSync(new URL('../src/tower-web/useTowerPlayback.ts',import.meta.url),'utf8');
 assert.match(ui,/aria-valuetext=/);assert.match(ui,/m\.continueReplay/);assert.match(copy,/Continuar replay/);assert.match(ui,/PLAYBACK_RATES\.map/);assert.match(ui,/aria-pressed=\{rate\s*===\s*value\}/);assert.match(copy,/Pausar movimento/);
 assert.doesNotMatch(ui,/setCut\(|setPlaying\(/);assert.match(ui,/prefers-reduced-motion: reduce/);
 assert.match(hook,/document\.removeEventListener\('visibilitychange', visibility\)/);assert.match(hook,/cancelAnimationFrame/);assert.match(hook,/clock\.resetFrame\(\)/);
});
