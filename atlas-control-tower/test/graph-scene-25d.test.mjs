import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const urlFor=path=>new URL(`../${path}`,import.meta.url);
const read=path=>fs.readFileSync(urlFor(path),'utf8');

test('2.5D layout is deterministic, semantic and depth-aware',async()=>{
 const moduleUrl=urlFor('src/graph-engine/layout25d.ts');
 assert.equal(fs.existsSync(moduleUrl),true,'layout25d.ts must exist');
 const {buildLayout25D}=await import(moduleUrl.href);
 const projection={id:'demo',version:'1',level:'atlas',focusId:'root',nodes:[
  {id:'root',label:'Ciência',type:'ROOT'},
  {id:'domain-a',label:'Micro',type:'DOMAIN',parentId:'root'},
  {id:'domain-b',label:'Growth',type:'DOMAIN',parentId:'root'},
  {id:'sub-a',label:'Sub',type:'SUBGRAPH',parentId:'domain-a'},
  {id:'test-a',label:'Test',type:'TEST',parentId:'sub-a'},
 ],edges:[
  {id:'e1',source:'root',target:'domain-a',type:'STRUCTURE',declared:true},
  {id:'e2',source:'root',target:'domain-b',type:'STRUCTURE',declared:true},
  {id:'e3',source:'domain-a',target:'sub-a',type:'STRUCTURE',declared:true},
  {id:'e4',source:'sub-a',target:'test-a',type:'EVIDENCE',declared:true},
 ],breadcrumbs:[],capabilities:{drillDown:true,learning:true,provenance:true,search:true}};
 const first=buildLayout25D(projection);const second=buildLayout25D(projection);
 assert.deepEqual(first,second);
 const root=first.nodes.find(node=>node.id==='root');const domain=first.nodes.find(node=>node.id==='domain-a');const testNode=first.nodes.find(node=>node.id==='test-a');
 assert.equal(root.x,50);assert.equal(root.y,50);assert.ok(root.z>=80);assert.ok(root.size>domain.size);assert.ok(domain.size>testNode.size);
 assert.ok(first.nodes.some(node=>node.z>0));assert.ok(first.nodes.some(node=>node.z<0));
 assert.ok(first.nodes.every(node=>node.x>=5&&node.x<=95&&node.y>=8&&node.y<=92));
 assert.ok(first.orbits.length>=2);assert.ok(first.clusters.length>=2);
});

test('2.5D scene keeps the approved visual grammar',()=>{
 const files=['src/graph-engine/GraphScene25D.tsx','src/graph-engine/GraphNode25D.tsx','src/graph-engine/GraphEdges25D.tsx','src/graph-engine/GraphLabel25D.tsx','src/graph-engine/GraphCluster25D.tsx','src/graph-engine/GraphOrbit25D.tsx','src/graph-engine/graph25d.css'];
 for(const path of files)assert.equal(fs.existsSync(urlFor(path)),true,`${path} must exist`);
 const scene=read(files[0]);const node=read(files[1]);const edges=read(files[2]);const css=read(files[6]);
 assert.match(scene,/prefers-reduced-motion/);assert.match(scene,/graph-25d-starfield/);assert.match(scene,/graph-25d-fog/);assert.match(scene,/rotateX/);assert.match(scene,/rotateY/);assert.match(scene,/autoOrbit/);
 assert.match(node,/--node-z/);assert.match(node,/graph-25d-sphere/);assert.match(node,/graph-25d-halo/);
 assert.match(edges,/quadratic/);assert.match(edges,/LEARNING/);
 assert.match(css,/perspective:/);assert.match(css,/transform-style:\s*preserve-3d/);assert.match(css,/radial-gradient/);assert.match(css,/translateZ/);assert.match(css,/prefers-reduced-motion/);
});

test('2.5D interaction keeps selection, zoom bounds and explicit legacy renderers',()=>{
 const scene=read('src/graph-engine/GraphScene25D.tsx');const renderer=read('src/graph-engine/GraphRenderer.tsx');
 assert.match(scene,/onSelect/);assert.match(scene,/selectedId/);assert.match(scene,/Math\.min\(1\.45/);assert.match(scene,/Math\.max\(\.72/);assert.match(scene,/onPointerDown/);
 assert.match(renderer,/mode==='3d'/);assert.match(renderer,/mode==='2d'/);assert.match(renderer,/GraphScene25D/);
});

test('2.5D navigation supports real 3D camera motion and fly-to focus',()=>{
 const scene=read('src/graph-engine/GraphScene25D.tsx');
 assert.match(scene,/camera25d/);
 assert.match(scene,/panX/);
 assert.match(scene,/panY/);
 assert.match(scene,/dolly/);
 assert.match(scene,/shiftKey/);
 assert.match(scene,/onDoubleClick/);
 assert.match(scene,/flyToNode/);
 assert.match(scene,/yaw/);
 assert.match(scene,/pitch/);
});
