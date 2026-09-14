import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Real, confirmed root cause of the "3D nodes/filaments render solid black" defect:
// material.vertexColors=true makes three.js compile a per-VERTEX `attribute vec3
// color` into the vertex shader (WebGLProgram.js gates this purely on the material
// flag, independent of instancing), and multiplies vColor by it *before* the
// separate per-instance `instanceColor` multiply runs. None of our instanced
// geometries (sphereGeometry for nodes, cylinderGeometry for filaments) ever define
// a `color` attribute -- only setColorAt/instanceColor is used -- so that phantom
// attribute is never bound and reads WebGL's unbound default (0,0,0,1), zeroing the
// color to black regardless of what instanceColor actually holds. Confirmed live in
// a real browser: even a hardcoded, unmistakable green instanceColor rendered solid
// black until vertexColors was removed. This locks the fix in place at the source
// level so it can't silently regress.
const materials = readFileSync(new URL('../src/scene/materials.ts', import.meta.url), 'utf8');
const instancedNodes = readFileSync(new URL('../src/scene/InstancedNodes.tsx', import.meta.url), 'utf8');

test('none of the instanced-mesh materials set vertexColors:true (the confirmed black-color regression)', () => {
  assert.doesNotMatch(materials, /vertexColors\s*:\s*true/);
  assert.doesNotMatch(instancedNodes, /vertexColors\s*:\s*true/);
});

test('per-instance coloring still goes through setColorAt/instanceColor, which needs no vertexColors flag', () => {
  assert.match(instancedNodes, /setColorAt\(/);
  assert.match(instancedNodes, /instanceColor(\?\.|\.)/);
});
