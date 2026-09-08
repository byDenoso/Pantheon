import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const modulePath=rel=>path.join(lab,rel);
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
  {id:'system:NEXO',type:'SYSTEM'},
  {id:'system:SCIENCE',type:'SYSTEM',parentId:'system:NEXO'},
  {id:'domain:COSMOLOGY',type:'DOMAIN',parentId:'system:SCIENCE'},
  {id:'campaign:H0',type:'CAMPAIGN',parentId:'domain:COSMOLOGY'}
 ];
 const a=layoutNodes(nodes,'system:NEXO');
 const b=layoutNodes(nodes,'system:NEXO');
 assert.deepEqual([...a.entries()],[...b.entries()]);
 assert.deepEqual(a.get('system:NEXO'),[0,0,0]);
 assert.notDeepEqual(a.get('domain:COSMOLOGY'),[0,0,0]);
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

test('lab exposes original-style presets and a renderer with one animation loop',async()=>{
 const {PRESETS}=await importLab('graph/palette.mjs');
 const {GraphLabRenderer}=await importLab('graph/renderer.mjs');
 assert.equal(typeof GraphLabRenderer,'function');
 assert.ok(PRESETS.ORIGINAL&&PRESETS.CLEAN&&PRESETS.DEEP_SPACE&&PRESETS.HIGH_CONTRAST&&PRESETS.DENSE_GRAPH&&PRESETS.MOBILE);
 const renderer=fs.readFileSync(modulePath('graph/renderer.mjs'),'utf8');
 assert.match(renderer,/requestAnimationFrame/);
 assert.match(renderer,/createRadialGradient/);
 assert.match(renderer,/quadraticCurveTo/);
 assert.doesNotMatch(renderer,/setInterval|setTimeout\s*\(/);
});

test('palette A uses the approved Observatory Premium colors',async()=>{
 const {SYSTEM_COLORS,STATUS_COLORS,PRESETS}=await importLab('graph/palette.mjs');
 assert.equal(SYSTEM_COLORS['system:NEXO'],'#E8C982');
 assert.equal(SYSTEM_COLORS['system:SCIENCE'],'#8FB7D6');
 assert.equal(SYSTEM_COLORS['system:LEARNING'],'#A8A0B8');
 assert.equal(SYSTEM_COLORS['system:ENGINEERING'],'#8195A8');
 assert.equal(SYSTEM_COLORS['system:OLYMPUS'],'#8FB5A7');
 assert.equal(SYSTEM_COLORS['system:BLACK_BOX'],'#777382');
 assert.equal(PRESETS.ORIGINAL.background,'#030507');
 assert.equal(PRESETS.ORIGINAL.edge,'#556676');
 assert.equal(PRESETS.ORIGINAL.derived,'#6D6877');
 assert.equal(STATUS_COLORS.active,'#9AB9D4');
 assert.equal(STATUS_COLORS.blocked,'#8E6F6F');
});

test('lab shell is standalone, synthetic-only and mobile-aware',()=>{
 for(const rel of ['index.html','styles.css','app.mjs']) assert.ok(fs.existsSync(modulePath(rel)),`missing ${rel}`);
 const html=fs.readFileSync(modulePath('index.html'),'utf8');
 const app=fs.readFileSync(modulePath('app.mjs'),'utf8');
 const css=fs.readFileSync(modulePath('styles.css'),'utf8');
 assert.match(html,/ATLAS GRAPH LAB/);
 assert.match(html,/id="graph-lab-canvas"/);
 assert.match(html,/id="preset"/);
 assert.match(html,/id="dataset-size"/);
 assert.match(html,/FPS/);
 assert.match(css,/@media\s*\(max-width:\s*760px\)/);
 assert.match(app,/createSyntheticGraph/);
 assert.doesNotMatch(app,/\/api\//);
 assert.doesNotMatch(app,/science_v1|learning_v1|nexo_ops|runner/i);
});

test('Babylon graph lab is isolated, visibly identified and reuses the comparison contract',()=>{
 const babylon=path.resolve(here,'../graph-lab-babylon');
 for(const rel of ['index.html','styles.css','app.mjs','scene.mjs']) assert.ok(fs.existsSync(path.join(babylon,rel)),`missing Babylon lab file: ${rel}`);
 const html=fs.readFileSync(path.join(babylon,'index.html'),'utf8');
 const app=fs.readFileSync(path.join(babylon,'app.mjs'),'utf8');
 const scene=fs.readFileSync(path.join(babylon,'scene.mjs'),'utf8');
 assert.match(html,/BABYLON\.JS/);
 assert.match(html,/cdn\.babylonjs\.com\/babylon\.js/);
 assert.match(app,/\.\.\/graph-lab\/data\/synthetic-graph\.mjs/);
 assert.match(app,/\.\.\/graph-lab\/graph\/palette\.mjs/);
 assert.match(scene,/ArcRotateCamera/);
 assert.match(scene,/MeshBuilder\.CreateSphere/);
 assert.match(scene,/MeshBuilder\.CreateTube/);
 assert.match(scene,/GlowLayer/);
 assert.match(scene,/Vector3\.Project/);
 assert.doesNotMatch(app,/\/api\//);
 assert.doesNotMatch(scene,/\/api\//);
});

test('Babylon pseudo-3D lab compresses depth and constrains the camera',()=>{
 const pseudo=path.resolve(here,'../graph-lab-babylon-pseudo3d');
 for(const rel of ['index.html','styles.css','app.mjs','scene.mjs']) assert.ok(fs.existsSync(path.join(pseudo,rel)),`missing pseudo-3D lab file: ${rel}`);
 const html=fs.readFileSync(path.join(pseudo,'index.html'),'utf8');
 const app=fs.readFileSync(path.join(pseudo,'app.mjs'),'utf8');
 const scene=fs.readFileSync(path.join(pseudo,'scene.mjs'),'utf8');
 assert.match(html,/BABYLON\.JS · PSEUDO-3D/i);
 assert.match(html,/PSEUDO-3D ORBITAL/i);
 assert.match(app,/\.\.\/graph-lab\/data\/synthetic-graph\.mjs/);
 assert.match(scene,/depthScale/);
 assert.match(scene,/ORTHOGRAPHIC_CAMERA|fov\s*=\s*0\.[23]/);
 assert.match(scene,/lowerBetaLimit/);
 assert.match(scene,/upperBetaLimit/);
 assert.match(scene,/MeshBuilder\.CreateSphere/);
 assert.match(scene,/MeshBuilder\.CreateTube/);
 assert.match(scene,/GlowLayer/);
 assert.match(scene,/Vector3\.Project/);
 assert.doesNotMatch(app,/\/api\//);
 assert.doesNotMatch(scene,/\/api\//);
});
