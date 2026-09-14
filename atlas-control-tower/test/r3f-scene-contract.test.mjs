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

test('scene defines flat vertex-colored materials (not TSL/WebGPU node materials) and renderer-native picking integration',()=>{
 // The TSL/WebGPU node-material path (MeshBasicNodeMaterial + colorNode) crashed at
 // runtime under the default WebGL2 backend -- confirmed via a real browser smoke
 // test (repeated "reading 'replace'" exceptions, blank canvas). Plain
 // MeshBasicMaterial with vertexColors keeps the same flat/unlit/vertex-colored look
 // and actually renders on the contractual default renderer.
 const materials=read('src/scene/materials.ts');
 const canvas=read('src/scene/AtlasCanvas.tsx');
 const picking=read('src/scene/gpu-picking.ts');
 assert.doesNotMatch(materials,/^import.*['"]three\/(tsl|webgpu)['"]/m);
 assert.match(materials,/MeshBasicMaterial/);
 assert.match(materials,/vertexColors\s*:\s*true/);
 assert.match(canvas,/onNodeClick/);
 assert.doesNotMatch(canvas,/createPortal|<GpuPicking/);
 assert.match(picking,/readRenderTargetPixelsAsync/);
 assert.match(picking,/WebGLRenderTarget/);
});
