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

test('WebGL graph route remains explicit and rolls back to Canvas 2.5D',()=>{
 // Rollback target swapped from GraphExplorer (Pixi) to Canvas25DGraph (plain
 // Canvas2D) per an explicit user request to replace the default map render.
 const renderer=read('src/graph-engine/GraphRenderer.tsx');const scene=read('src/graph-engine/GraphScene3D.tsx');
 assert.match(renderer,/renderer'\)===['"]webgl['"]/);assert.match(renderer,/switchRenderer\('canvas'\)/);assert.match(renderer,/Canvas25DGraph/);assert.match(renderer,/GraphScene3D/);assert.match(scene,/AtlasCanvas/);
});

test('target visual grammar includes glow nodes, curved filaments, stars and orbital guides',()=>{
 const nodes=read('src/scene/InstancedNodes.tsx');const filaments=read('src/scene/InstancedFilaments.tsx');const canvas=read('src/scene/AtlasCanvas.tsx');
 assert.match(nodes,/createNodeAuraMaterial/);assert.match(nodes,/selectedId/);assert.match(filaments,/edges\.filter/);assert.match(canvas,/StarField/);assert.match(canvas,/OrbitalGuides/);assert.match(canvas,/torusGeometry/);
});

test('3D graph never starts (or offers) automatic camera motion -- orbit is always manual',()=>{
 // An earlier phase intentionally defaulted to auto-orbiting motion; the locked map
 // contract (repeated explicitly by the user) forbids auto-rotation outright, so this
 // now asserts the opposite of what it used to: no autoOrbit state/toggle anywhere in
 // the 3D scene, and the real camera rig sets autoRotate=false unconditionally.
 const scene=read('src/graph-engine/GraphScene3D.tsx');
 const canvas=read('src/scene/AtlasCanvas.tsx');
 assert.doesNotMatch(scene,/autoOrbit/);
 assert.doesNotMatch(scene,/Pausar movimento|Mover grafo/);
 assert.match(canvas,/autoRotate\s*=\s*false/);
});

test('the 3D scene mounts the same shell inspector as the 2D map, not a duplicate',()=>{
 // GraphScene3D used to mount its own GraphInspector; SpatialInspector is already
 // rendered as a sibling of GraphRenderer in graphs-page.tsx and reads the same
 // selection state, so a second inspector inside the 3D scene was the exact
 // disconnected-product duplication the shell work set out to remove.
 const scene=read('src/graph-engine/GraphScene3D.tsx');
 assert.doesNotMatch(scene,/<GraphInspector|import\s*\{[^}]*GraphInspector/);
 assert.doesNotMatch(scene,/<GraphControlDock|import\s*\{[^}]*GraphControlDock/);
 assert.doesNotMatch(scene,/atlas:camera-command/);
});