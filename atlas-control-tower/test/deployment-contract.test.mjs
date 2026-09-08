import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const routes = vercel.routes || [];
const builds = vercel.builds || [];
const routeFor = pattern => routes.find(route => route.src === pattern);

test('root HTML is explicitly served as HTML and revalidated', () => {
  const root = routeFor('/');
  assert.ok(root, 'root route missing');
  assert.equal(root.headers?.['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(root.headers?.['Cache-Control'], 'public, max-age=0, must-revalidate');
});

test('hashed browser assets come from the Vite static build instead of hand-maintained MIME routes', () => {
  const staticBuild = builds.find(build => build.src === 'package.json');
  assert.ok(staticBuild, 'Vite static build missing');
  assert.equal(staticBuild.use, '@vercel/static-build');
  assert.equal(staticBuild.config?.distDir, 'dist');
  assert.equal(routeFor('/(.*\\.css)'), undefined);
  assert.equal(routeFor('/(.*\\.mjs)'), undefined);
  assert.equal(routeFor('/(.*\\.js)'), undefined);
});

test('API routes execute before filesystem and SPA fallback', () => {
  const filesystemIndex = routes.findIndex(route => route.handle === 'filesystem');
  const runnerIndex = routes.findIndex(route => route.src === '/api/runner');
  const graphIndex = routes.findIndex(route => String(route.src).includes('state|sync|graph'));
  const fallbackIndex = routes.findIndex(route => route.src === '/.*');
  assert.ok(runnerIndex >= 0 && runnerIndex < filesystemIndex, 'runner must resolve before static files');
  assert.ok(graphIndex >= 0 && graphIndex < filesystemIndex, 'runtime API must resolve before static files');
  assert.ok(filesystemIndex >= 0 && fallbackIndex > filesystemIndex, 'SPA fallback must follow filesystem');
});
