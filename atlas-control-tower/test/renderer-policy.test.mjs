import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src=fs.readFileSync(new URL('../src/scene/createRenderer.ts',import.meta.url),'utf8');

test('renderer is WebGL2-first in production; WebGPU exists only as an explicit opt-in',()=>{
 assert.match(src,/three\/webgpu/);
 assert.match(src,/WebGPURenderer/);
 assert.match(src,/await\s+renderer\.init\(\)/);
 assert.match(src,/forceWebGL/);
 assert.match(src,/backend:\s*['"]webgpu['"]/);
 assert.match(src,/backend:\s*['"]webgl2['"]/);
 // The locked contract: WebGPU must never be chosen just because navigator.gpu
 // exists. There must be an explicit gate (an allowWebGPU option, defaulting to a
 // query-flag check) that a normal production page load will not satisfy, and that
 // gate must be evaluated before WebGPURenderer is ever constructed.
 assert.match(src,/allowWebGPU/);
 const gateIndex=src.indexOf('allowWebGPU');
 const constructIndex=src.indexOf('new WebGPURenderer');
 assert.ok(gateIndex>=0&&constructIndex>gateIndex,'allowWebGPU gate must be checked before constructing WebGPURenderer');
 assert.match(src,/if\s*\(\s*options\.forceWebGL\s*\|\|\s*!allowWebGPU\s*\)\s*\{\s*return createWebGLRenderer/,'must return WebGL2 immediately unless WebGPU was explicitly allowed');
});
