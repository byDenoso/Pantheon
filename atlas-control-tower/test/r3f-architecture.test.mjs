import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

const required = [
 'src/main.tsx',
 'src/App.tsx',
 'src/state/useAtlasSession.ts',
 'src/scene/AtlasCanvas.tsx',
 'src/scene/createRenderer.ts',
 'src/scene/semantic-lod.ts',
 'src/scene/gpu-picking.ts',
 'src/scene/InstancedNodes.tsx',
 'src/scene/InstancedFilaments.tsx',
 'src/scene/LabelOverlay.tsx',
 'src/scene/materials.ts',
 'vite.config.ts',
 'tsconfig.json'
];

test('frontend is React + R3F + Three WebGPU with a typed Vite build', () => {
 assert.equal(pkg.dependencies?.react, '19.2.8');
 assert.equal(pkg.dependencies?.['react-dom'], '19.2.8');
 assert.equal(pkg.dependencies?.three, '0.185.1');
 assert.equal(pkg.dependencies?.['@react-three/fiber'], '9.7.0');
 assert.equal(pkg.devDependencies?.vite, '8.2.2');
 assert.ok(pkg.devDependencies?.typescript, 'typescript is required');
 assert.equal(pkg.scripts?.build, 'vite build');
 assert.match(pkg.scripts?.typecheck || '', /tsc/);
 for (const file of required) assert.ok(fs.existsSync(new URL(file, root)), `missing ${file}`);
});

test('Durable Runner API remains in the Vercel production boundary', () => {
 const json = JSON.stringify(vercel);
 assert.match(json, /api\/runner\.js/);
 assert.match(json, /\/api\/runner/);
 assert.ok(fs.existsSync(new URL('api/runner.js', root)));
 assert.ok(fs.existsSync(new URL('lib/durable-runner.mjs', root)));
});
