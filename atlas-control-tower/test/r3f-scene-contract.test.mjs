import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('R3F scene uses instancing instead of one mesh per graph node',()=>{
 const canvas=read('src/scene/AtlasCanvas.tsx');
 const nodes=read('src/scene/InstancedNodes.tsx');
 const edges=read('src/scene/InstancedFilaments.tsx');
 assert.match(canvas,/from ['"]@react-three\/fiber['"]/);
 assert.match(canvas,/<Canvas/);
 assert.match(nodes,/<instancedMesh/);
 assert.match(edges,/<instancedMesh/);
 assert.doesNotMatch(nodes,/nodes\.map\([^)]*=>\s*<mesh/);
 assert.doesNotMatch(edges,/edges\.map\([^)]*=>\s*<mesh/);
});

test('scene defines TSL materials and on-demand GPU picking integration',()=>{
 const materials=read('src/scene/materials.ts');
 const canvas=read('src/scene/AtlasCanvas.tsx');
 const picking=read('src/scene/gpu-picking.ts');
 assert.match(materials,/three\/tsl/);
 assert.match(materials,/MeshBasicNodeMaterial|MeshStandardNodeMaterial/);
 assert.match(materials,/colorNode/);
 assert.match(canvas,/GpuPicking/);
 assert.match(picking,/readRenderTargetPixelsAsync/);
 assert.match(picking,/WebGLRenderTarget/);
});
