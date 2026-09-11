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

test('3D graph route remains available beside Pixi rollback',()=>{
 const renderer=read('src/graph-engine/GraphRenderer.tsx');const scene=read('src/graph-engine/GraphScene3D.tsx');
 assert.match(renderer,/mode==='3d'/);assert.match(renderer,/mode==='2d'/);assert.match(renderer,/GraphExplorer/);assert.match(renderer,/GraphScene3D/);assert.match(scene,/AtlasCanvas/);
});

test('target visual grammar includes glow nodes, curved filaments, stars and orbital guides',()=>{
 const nodes=read('src/scene/InstancedNodes.tsx');const filaments=read('src/scene/InstancedFilaments.tsx');const canvas=read('src/scene/AtlasCanvas.tsx');
 assert.match(nodes,/AdditiveBlending/);assert.match(nodes,/highlight/);assert.match(filaments,/SEGMENTS=7/);assert.match(filaments,/quadraticPoint/);assert.match(canvas,/StarField/);assert.match(canvas,/OrbitalGuides/);
});
