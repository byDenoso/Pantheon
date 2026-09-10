import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

test('Breakthrough hybrid stack declares React, D3, Three and GSAP', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const dep of ['react', 'react-dom', 'd3', 'three', 'gsap']) {
    assert.ok(pkg.dependencies?.[dep], `${dep} must be a production dependency`);
  }
});

test('Breakthrough hybrid scene is split into SVG graph and Three atmosphere', () => {
  for (const file of [
    'src/scene/BreakthroughAtlas.tsx',
    'src/scene/AtlasAtmosphere.tsx',
    'src/scene/breakthrough-layout.ts',
    'src/styles/breakthrough-hybrid.css'
  ]) assert.equal(exists(file), true, `${file} must exist`);
});

test('Breakthrough graph uses SVG + D3 and GSAP, not R3F meshes for graph entities', () => {
  assert.equal(exists('src/scene/BreakthroughAtlas.tsx'), true, 'BreakthroughAtlas.tsx must exist before source contract can be checked');
  const source = read('src/scene/BreakthroughAtlas.tsx');
  assert.match(source, /from ['"]d3['"]/);
  assert.match(source, /from ['"]gsap['"]/);
  assert.match(source, /<svg[\s>]/);
  assert.match(source, /data-bt-graph/);
  assert.doesNotMatch(source, /InstancedNodes|InstancedFilaments/);
});

test('Three/WebGPU is an atmosphere layer with graceful fallback', () => {
  assert.equal(exists('src/scene/AtlasAtmosphere.tsx'), true, 'AtlasAtmosphere.tsx must exist before source contract can be checked');
  const source = read('src/scene/AtlasAtmosphere.tsx');
  assert.match(source, /createAtlasRenderer/);
  assert.match(source, /Canvas/);
  assert.match(source, /webgpu|webgl2/i);
});

test('official React shell mounts the Breakthrough hybrid experience', () => {
  const app = read('src/App.tsx');
  assert.match(app, /BreakthroughAtlas/);
  assert.match(app, /breakthrough-hybrid\.css/);
  assert.match(app, /data-bt-stack/);
});

test('Breakthrough CSS provides rustic depth and reduced-motion safety', () => {
  assert.equal(exists('src/styles/breakthrough-hybrid.css'), true, 'breakthrough-hybrid.css must exist before source contract can be checked');
  const css = read('src/styles/breakthrough-hybrid.css');
  assert.match(css, /perspective\s*:/);
  assert.match(css, /transform-style\s*:\s*preserve-3d/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /--bt-rx/);
  assert.match(css, /--bt-ry/);
});
