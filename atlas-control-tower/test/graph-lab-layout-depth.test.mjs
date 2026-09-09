import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {layoutNodes} from '../graph-lab/graph/layout.mjs';
import {loadSsotSnapshot} from '../graph-lab/data/ssot.mjs';
const graph=await loadSsotSnapshot({fetchRef:async url=>({ok:true,json:async()=>JSON.parse(await fs.readFile(new URL(url),'utf8'))})});
const options={baseRadius:250,ringGap:132,depthScale:150};
const positions=layoutNodes(graph.nodes,graph.rootId,options);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const delta=(a,b)=>a.map((v,i)=>v-b[i]);

test('expanded SSOT occupies at least 45 percent depth relative to XY',()=>{
 const extents=[0,1,2].map(i=>{const a=[...positions.values()].map(p=>p[i]);return Math.max(...a)-Math.min(...a)});
 const ratio=extents[2]/Math.max(extents[0],extents[1]);
 assert.ok(ratio>=.45,`depth ratio ${ratio}`);
 console.log('SSOT depth/XY:',ratio.toFixed(3));
});
test('local frames are orthonormal and child orbital planes are perpendicular at both levels',()=>{
 for(const [id,f] of positions.frames){
  for(const v of Object.values(f))assert.ok(Math.abs(Math.hypot(...v)-1)<1e-12,id);
  assert.ok(Math.abs(dot(f.radial,f.tangent))<1e-12,id);
  const children=graph.nodes.filter(n=>n.parentId===id);
  if(id===graph.rootId||!children.length)continue;
  let outside=0;
  for(const child of children){
   const d=delta(positions.get(child.id),positions.get(id));
   if(Math.abs(dot(d,f.binormal))/Math.hypot(...d)>.35)outside++;
   assert.ok(Math.abs(dot(d,f.tangent))<1e-10,'child stays in perpendicular plane');
   assert.ok(Math.abs(dot(f.binormal,positions.frames.get(child.id).binormal))<1e-12);
  }
  assert.ok(outside>=children.length/2,`${id}: ${outside}/${children.length}`);
 }
});
test('expanding and collapsing every branch preserves all existing positions',()=>{
 for(const parent of graph.nodes){
  const descendants=new Set([parent.id]);
  for(let changed=true;changed;){changed=false;for(const n of graph.nodes)if(descendants.has(n.parentId)&&!descendants.has(n.id)){descendants.add(n.id);changed=true}}
  const collapsed=graph.nodes.filter(n=>n.id===parent.id||!descendants.has(n.id));
  const before=layoutNodes(collapsed,graph.rootId,options);
  for(const [id,p] of before)assert.deepEqual(p,positions.get(id));
 }
});
test('2D layout is planar and reversible without changing volume coordinates',()=>{
 const flat=layoutNodes(graph.nodes,graph.rootId,{...options,flat:true});
 assert.ok([...flat.values()].every(p=>p[2]===0));
 assert.deepEqual([...layoutNodes(graph.nodes,graph.rootId,options)],[...positions]);
});
test('single-child petals emerge off-plane and arbitrary focus remains at origin',()=>{
 const nodes=[{id:'root'},{id:'domain',parentId:'root'},{id:'program',parentId:'domain'},{id:'campaign',parentId:'program'}];
 const p=layoutNodes(nodes,'root');
 for(const [a,b] of [['domain','program'],['program','campaign']]){
  const d=delta(p.get(b),p.get(a));
  assert.ok(Math.abs(dot(d,p.frames.get(a).binormal))/Math.hypot(...d)>.35);
 }
 assert.deepEqual(layoutNodes(nodes,'program').get('program'),[0,0,0]);
});

test('portrait 375x812 and desktop framing contain initial and expanded nodes in 3D and 2D',async()=>{
 const THREE=await import('../graph-lab/vendor/three.module.min.js');
 const {GraphLabRenderer}=await import('../graph-lab/graph/renderer.mjs');
 for(const [width,height] of [[375,812],[1440,900]])for(const flat of [false,true])for(const nodes of [graph.nodes.filter(n=>['root','domain'].includes(n.hierarchyLevel)),graph.nodes]){
  const p=layoutNodes(nodes,graph.rootId,{...options,flat});
  const camera=new THREE.PerspectiveCamera(46,width/height,1,9000);
  const reach=Math.max(240,...[...p.values()].map(v=>Math.hypot(...v)));
  const distance=GraphLabRenderer.prototype.distanceFor.call({camera},reach);
  const yaw=flat?0:.42,pitch=flat?.0001:.34;
  camera.position.set(Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance);
  camera.lookAt(0,0,0);camera.updateMatrixWorld();
  for(const [id,v] of p){const q=new THREE.Vector3(...v).project(camera);assert.ok(Math.abs(q.x)<.95&&Math.abs(q.y)<.95&&Math.abs(q.z)<1,`${width} ${flat} ${id}`)}
 }
});
test('3D and flat filaments remain finite and attach to their exact endpoints',async()=>{
 const {GraphLabRenderer}=await import('../graph-lab/graph/renderer.mjs');
 for(const flat of [false,true]){
  const p=layoutNodes(graph.nodes,graph.rootId,{...options,flat});
  const stub={flat,targetPositions:p,options:{filamentCurve:.15}};
  for(const e of graph.edges){
   const a=p.get(e.source),b=p.get(e.target);if(!a||!b)continue;
   const c=GraphLabRenderer.prototype.curveFor.call(stub,a,b,e.source);
   assert.deepEqual(c.getPoint(0).toArray(),a);assert.deepEqual(c.getPoint(1).toArray(),b);
   assert.ok(c.getPoints(25).every(v=>v.toArray().every(Number.isFinite)));
  }
 }
});
