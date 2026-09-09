import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const modulePath=rel=>path.join(lab,rel);
const quotedAttr=(name,value)=>new RegExp(`${name}=['\"]${value}['\"]`);
async function importLab(rel){
 const file=modulePath(rel);
 assert.ok(fs.existsSync(file),`graph lab module missing: ${rel}`);
 return import(pathToFileURL(file));
}

test('projection makes nearer positive-depth bodies appear larger',async()=>{
 const {projectPoint,defaultCamera}=await importLab('graph/projection.mjs');
 const camera=defaultCamera(); camera.yaw=0; camera.pitch=0;
 const far=projectPoint([0,0,-120],camera,1000,700,{focalLength:760});
 const near=projectPoint([0,0,120],camera,1000,700,{focalLength:760});
 assert.ok(near.scale>far.scale);
 assert.equal(projectPoint([0,0,0],camera,1000,700).x,500);
});

test('semantic orbital layout is deterministic and keeps focus at origin',async()=>{
 const {layoutNodes}=await importLab('graph/layout.mjs');
 const nodes=[
  {id:'system:NEXO',type:'SYSTEM',hierarchyLevel:'root'},
  {id:'domain:COSMOLOGY',type:'DOMAIN',hierarchyLevel:'domain',parentId:'system:NEXO'},
  {id:'record:PROG-1',type:'PROGRAM',hierarchyLevel:'program',parentId:'domain:COSMOLOGY'},
  {id:'record:CAMP-H0',type:'CAMPAIGN',hierarchyLevel:'campaign',parentId:'record:PROG-1'}
 ];
 const a=layoutNodes(nodes,'system:NEXO');
 const b=layoutNodes(nodes,'system:NEXO');
 assert.deepEqual([...a.entries()],[...b.entries()]);
 assert.deepEqual(a.get('system:NEXO'),[0,0,0]);
 assert.notDeepEqual(a.get('domain:COSMOLOGY'),[0,0,0]);
});

test('sub-orbits hang off their parent instead of forming another global ring',async()=>{
 const {layoutNodes}=await importLab('graph/layout.mjs');
 const nodes=[
  {id:'root',hierarchyLevel:'root'},
  {id:'domain:A',hierarchyLevel:'domain',parentId:'root'},
  {id:'domain:B',hierarchyLevel:'domain',parentId:'root'},
  {id:'program:A1',hierarchyLevel:'program',parentId:'domain:A'},
  {id:'program:A2',hierarchyLevel:'program',parentId:'domain:A'}
 ];
 const positions=layoutNodes(nodes,'root',{baseRadius:250,ringGap:130});
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
 const domainA=positions.get('domain:A');
 for(const id of ['program:A1','program:A2']){
  assert.ok(distance(positions.get(id),domainA)<distance(positions.get(id),[0,0,0]));
 }
 assert.notDeepEqual(positions.get('program:A1'),positions.get('program:A2'));
});

test('quadratic filament interpolation lands exactly on both endpoints',async()=>{
 const {filamentControl,quadraticBezierPoint}=await importLab('graph/filaments.mjs');
 const a={x:10,y:20},b={x:210,y:120};
 const cp=filamentControl(a,b,.2,1);
 assert.deepEqual(quadraticBezierPoint(a,cp,b,0),a);
 assert.deepEqual(quadraticBezierPoint(a,cp,b,1),b);
 const mid=quadraticBezierPoint(a,cp,b,.5);
 assert.ok(Number.isFinite(mid.x)&&Number.isFinite(mid.y));
 assert.notEqual(mid.y,(a.y+b.y)/2);
});

test('picking chooses the visually front-most overlapping body',async()=>{
 const {pickNode}=await importLab('graph/picking.mjs');
 const points=[
  {node:{id:'back'},x:100,y:100,r:30,z:-40},
  {node:{id:'front'},x:100,y:100,r:18,z:80}
 ];
 assert.equal(pickNode(points,100,100)?.node.id,'front');
 assert.equal(pickNode(points,300,300),null);
});

test('orbital drift is deterministic, bounded and non-zero',async()=>{
 const {orbitalDrift}=await importLab('graph/motion.mjs');
 const a=orbitalDrift('node:A',12345,4);
 const b=orbitalDrift('node:A',12345,4);
 assert.deepEqual(a,b);
 assert.ok(a.some(v=>Math.abs(v)>.01));
 assert.ok(a.every(v=>Math.abs(v)<=4.001));
});

test('synthetic graph honors requested scale without dangling edges',async()=>{
 const {createSyntheticGraph}=await importLab('data/synthetic-graph.mjs');
 for(const count of [50,100,250]){
  const graph=createSyntheticGraph(count);
  assert.equal(graph.nodes.length,count);
  assert.equal(graph.rootId,'system:NEXO');
  const ids=new Set(graph.nodes.map(n=>n.id));
  assert.ok(graph.edges.length>=count-1);
  assert.ok(graph.edges.every(e=>ids.has(e.source)&&ids.has(e.target)));
  assert.ok(['SCIENCE','LEARNING','ENGINEERING','OLYMPUS','BLACK_BOX'].every(name=>ids.has(`system:${name}`)));
 }
});

test('label placement prioritizes focus and rejects overlapping boxes',async()=>{
 const {placeLabels}=await importLab('graph/labels.mjs');
 const points=[
  {node:{id:'focus',label:'NEXO',type:'SYSTEM'},x:200,y:160,r:24,z:40},
  {node:{id:'other',label:'Other',type:'TEST'},x:206,y:164,r:10,z:20}
 ];
 const labels=placeLabels(points,{width:400,height:320,focusId:'focus',maxLabels:1,reserved:[]});
 assert.equal(labels.length,1);
 assert.equal(labels[0].id,'focus');
});

test('what a click just revealed gets labelled before the rest of the map',async()=>{
 const {placeLabels}=await importLab('graph/labels.mjs');
 const points=[
  {node:{id:'child',label:'Program A',type:'PROGRAM',parentId:'domain'},x:120,y:120,r:9,z:10},
  {node:{id:'far',label:'Other domain',type:'DOMAIN'},x:320,y:260,r:14,z:5}
 ];
 const labels=placeLabels(points,{width:600,height:400,selectedId:'domain',maxLabels:1,reserved:[]});
 assert.equal(labels[0].id,'child');
});

test('the graph renders on Three.js over a canvas overlay, from a vendored build',async()=>{
 const {PRESETS}=await importLab('graph/palette.mjs');
 assert.ok(PRESETS.ORIGINAL&&PRESETS.CLEAN&&PRESETS.DEEP_SPACE&&PRESETS.HIGH_CONTRAST&&PRESETS.DENSE_GRAPH&&PRESETS.MOBILE);
 assert.equal(PRESETS.ORIGINAL.renderer,'three-canvas');
 assert.ok(fs.existsSync(modulePath('vendor/three.module.min.js')),'three must be vendored, not fetched at runtime');
 const renderer=fs.readFileSync(modulePath('graph/renderer.mjs'),'utf8');
 assert.match(renderer,/from '\.\.\/vendor\/three\.module\.min\.js'/);
 assert.doesNotMatch(renderer,/https?:\/\/[^'"]*three/i,'three must not come from a CDN');
 assert.match(renderer,/new THREE\.WebGLRenderer/);
 assert.match(renderer,/QuadraticBezierCurve3/);
 assert.match(renderer,/createRadialGradient/);
 assert.match(renderer,/getContext\('2d'\)/);
 assert.equal(renderer.match(/requestAnimationFrame\(/g).length,1);
 assert.doesNotMatch(renderer,/setInterval|setTimeout\s*\(/);
});

test('the renderer exposes the camera and selection controls the cockpit drives',async()=>{
 const {GraphLabRenderer}=await importLab('graph/renderer.mjs');
 assert.equal(typeof GraphLabRenderer,'function');
 for(const method of ['setGraph','setSelected','focusNode','toggleFlat','fit','zoom','centerSelected','ensureInFrame','distanceFor'])
  assert.equal(typeof GraphLabRenderer.prototype[method],'function',`renderer must expose ${method}`);
});

test('camera framing accounts for the narrow axis so a phone shows the whole system',async()=>{
 const {GraphLabRenderer}=await importLab('graph/renderer.mjs');
 const stub={camera:{fov:46,aspect:1.8}};
 const wide=GraphLabRenderer.prototype.distanceFor.call(stub,400);
 stub.camera.aspect=0.46;
 const tall=GraphLabRenderer.prototype.distanceFor.call(stub,400);
 assert.ok(tall>wide,'a portrait viewport must pull the camera further back');
});

test('palette A uses the approved Obsidian Observatory colors',async()=>{
 const {SYSTEM_COLORS,STATUS_COLORS,PRESETS}=await importLab('graph/palette.mjs');
 assert.equal(SYSTEM_COLORS['system:NEXO'],'#FFBE5C');
 assert.equal(SYSTEM_COLORS['system:SCIENCE'],'#66D6FF');
 assert.equal(SYSTEM_COLORS['system:LEARNING'],'#AF8DFF');
 assert.equal(SYSTEM_COLORS['system:ENGINEERING'],'#5EA8FF');
 assert.equal(SYSTEM_COLORS['system:OLYMPUS'],'#64E1CB');
 assert.equal(SYSTEM_COLORS['system:BLACK_BOX'],'#7A8495');
 assert.equal(PRESETS.ORIGINAL.background,'#02050A');
 assert.equal(PRESETS.ORIGINAL.edge,'#4B6A89');
 assert.equal(PRESETS.ORIGINAL.derived,'#7562A7');
 assert.equal(STATUS_COLORS.active,'#2EC9FF');
 assert.equal(STATUS_COLORS.blocked,'#C96A7C');
});

test('hierarchy level sets visual weight, from the core out to the leaves',async()=>{
 const {LEVEL_STYLE,levelStyle}=await importLab('graph/palette.mjs');
 assert.ok(LEVEL_STYLE.root.radius>LEVEL_STYLE.domain.radius);
 assert.ok(LEVEL_STYLE.domain.radius>LEVEL_STYLE.program.radius);
 assert.ok(LEVEL_STYLE.program.radius>LEVEL_STYLE.campaign.radius);
 assert.equal(levelStyle({hierarchyLevel:'domain'}),LEVEL_STYLE.domain);
});

test('Atlas shell is a map with one cockpit and a secondary renderer drawer',()=>{
 for(const rel of ['index.html','styles.css','app.mjs','cockpit.mjs']) assert.ok(fs.existsSync(modulePath(rel)),`missing ${rel}`);
 const html=fs.readFileSync(modulePath('index.html'),'utf8');
 const app=fs.readFileSync(modulePath('app.mjs'),'utf8');
 const css=fs.readFileSync(modulePath('styles.css'),'utf8');
 assert.match(html,/NEXO ATLAS/);
 assert.match(html,quotedAttr('id','graph-lab-canvas'));
 assert.match(html,quotedAttr('id','preset'));
 assert.match(html,quotedAttr('id','dataset-size'));
 assert.match(html,/FPS/);
 const panelMatch=html.match(/id=['"]lab-panel['"]/);
 assert.ok(panelMatch,'renderer drawer must exist');
 const drawer=html.slice(panelMatch.index);
 for(const id of ['preset','dataset-size','node-radius'])assert.match(drawer,quotedAttr('id',id));
 assert.ok(drawer.includes('FPS'),'FPS must sit inside the renderer drawer');
 assert.match(css,/@media\s*\(max-width:\s*760px\)/);
 assert.match(app,/createSyntheticGraph/);
 assert.doesNotMatch(app,/\/api\//);
 assert.doesNotMatch(app,/science_v1|learning_v1|nexo_ops|runner/i);
});

test('a WebGL failure falls back to the legacy canvas instead of leaving a blank stage',()=>{
 const app=fs.readFileSync(modulePath('app.mjs'),'utf8');
 assert.match(app,/renderer\.ready\?\.catch/);
 assert.match(app,/legacy-canvas/);
 assert.match(app,/location\.replace/);
});