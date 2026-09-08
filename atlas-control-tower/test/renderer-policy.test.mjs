import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../src/scene/createRenderer.ts',import.meta.url),'utf8');

test('renderer is WebGPU-first and explicitly supports a WebGL2 fallback',()=>{
 assert.match(src,/three\/webgpu/);
 assert.match(src,/WebGPURenderer/);
 assert.match(src,/await\s+renderer\.init\(\)/);
 assert.match(src,/forceWebGL/);
 assert.match(src,/backend:\s*['"]webgpu['"]/);
 assert.match(src,/backend:\s*['"]webgl2['"]/);
});
