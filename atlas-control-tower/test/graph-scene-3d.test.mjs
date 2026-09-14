import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildOrbitalNodes} from '../src/scene/types.ts';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('3D orbital layout is deterministic, centers focus and uses real depth',()=>{
 const source=[{id:'root',type:'ROOT'},{id:'a',type:'DOMAIN',parentId:'root'},{id:'b',type:'DOMAIN',parentId:'root'},{id:'a1',type:'TEST',parentId:'a'}];
 const first=buildOrbitalNodes(source,'root');const second=buildOrbitalNodes(source,'root');
 assert.deepEqual(first,second);assert.deepEqual(first.find(n=>n.id==='root').position,[0,0,0]);assert.ok(first.some(n=>n.id!=='root'&&Math.abs(n.position[2])>.01));
});

test('legacy 3D scene is isolated and unreachable from the active Spatial Canvas gateway',()=>{
 const renderer=read('src/graph-engine/GraphRenderer.tsx');const scene=read('src/graph-engine/GraphScene3D.tsx');
 assert.match(renderer,/Canvas25DGraph/);
 assert.doesNotMatch(renderer,/GraphScene3D|requested===['"]webgl['"]|switchRenderer|localStorage|URLSearchParams/);
 assert.match(scene,/Dormant 3D compatibility scene/);
 assert.match(scene,/AtlasCanvas/);
});

test('target visual grammar includes glow nodes, curved filaments, stars and orbital guides',()=>{
 const nodes=read('src/scene/InstancedNodes.tsx');const filaments=read('src/scene/InstancedFilaments.tsx');const canvas=read('src/scene/AtlasCanvas.tsx');
 assert.match(nodes,/createNodeAuraMaterial/);assert.match(nodes,/selectedId/);assert.match(filaments,/edges\.filter/);assert.match(canvas,/StarField/);assert.match(canvas,/OrbitalGuides/);assert.match(canvas,/torusGeometry/);
});

test('3D graph never starts (or offers) automatic camera motion -- orbit is always manual',()=>{
 const scene=read('src/graph-engine/GraphScene3D.tsx');
 const canvas=read('src/scene/AtlasCanvas.tsx');
 assert.doesNotMatch(scene,/autoOrbit/);
 assert.doesNotMatch(scene,/Pausar movimento|Mover grafo/);
 assert.match(canvas,/autoRotate\s*=\s*false/);
});

test('the dormant 3D scene mounts no duplicate shell inspector or camera dock',()=>{
 const scene=read('src/graph-engine/GraphScene3D.tsx');
 assert.doesNotMatch(scene,/<GraphInspector|import\s*\{[^}]*GraphInspector/);
 assert.doesNotMatch(scene,/<GraphControlDock|import\s*\{[^}]*GraphControlDock/);
 assert.doesNotMatch(scene,/atlas:camera-command/);
});
