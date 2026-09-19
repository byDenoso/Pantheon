import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('Atlas uses procedural Three.js galaxy as the primary renderer', async () => {
  const atlas = await text('src/features/system/Atlas.tsx');
  assert.match(atlas, /import \{ AtlasGalaxy \}/);
  assert.match(atlas, /<AtlasGalaxy/);
  assert.match(atlas, /snapshot=\{galaxySnapshot\}/);
  assert.doesNotMatch(atlas, /<AtlasCanvas25D/);
});

test('procedural galaxy is shader/points based and never uses the old force graph', async () => {
  const source = await text('src/components/ThreeGalaxy.tsx');
  assert.match(source, /new THREE\.WebGLRenderer/);
  assert.match(source, /new THREE\.ShaderMaterial/);
  assert.match(source, /new THREE\.Points/);
  assert.match(source, /new THREE\.InstancedMesh/);
  assert.match(source, /new OrbitControls/);
  assert.match(source, /THREE\.AdditiveBlending/);
  assert.match(source, /signatureCount/);
  assert.match(source, /SCIENCE/);
  assert.match(source, /ENGINEERING/);
  assert.match(source, /OLYMPUS/);
  assert.doesNotMatch(source, /ForceGraph3D|react-force-graph-3d/);
});

test('WebGL is a progressive enhancement with the existing Canvas 2.5D fallback', async () => {
  const source = await text('src/components/AtlasGalaxy.tsx');
  assert.match(source, /browserSupportsWebGL/);
  assert.match(source, /<ThreeGalaxy/);
  assert.match(source, /<AtlasCanvas25D/);
  assert.match(source, /renderer.*canvas/);
  assert.match(source, /onUnavailable/);
});

test('galaxy density is driven by snapshot entities while all four macro domains remain legible', async () => {
  const source = await text('src/components/ThreeGalaxy.tsx');
  assert.match(source, /entityCounts\.set\(entity\.domain/);
  assert.match(source, /snapshot\.domains/);
  assert.match(source, /domainLabels\(snapshot\)/);
  assert.match(source, /snapshot\.stats\.entities/);
  assert.match(source, /snapshot\.relations/);
});
