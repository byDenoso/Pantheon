import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const routes = vercel.routes || [];

const routeFor = pattern => routes.find(route => route.src === pattern);

test('root HTML is explicitly served as HTML and revalidated', () => {
  const root = routeFor('/');
  assert.ok(root, 'root route missing');
  assert.equal(root.headers?.['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(root.headers?.['Cache-Control'], 'public, max-age=0, must-revalidate');
});

test('stable-name CSS and JS assets have explicit MIME and are revalidated', () => {
  const css = routeFor('/(.*\\.css)');
  const mjs = routeFor('/(.*\\.mjs)');
  const js = routeFor('/(.*\\.js)');
  for (const [name, route, mime] of [
    ['css', css, 'text/css; charset=utf-8'],
    ['mjs', mjs, 'text/javascript; charset=utf-8'],
    ['js', js, 'text/javascript; charset=utf-8']
  ]) {
    assert.ok(route, `${name} MIME route missing`);
    assert.equal(route.headers?.['Content-Type'], mime);
    assert.equal(route.headers?.['Cache-Control'], 'public, max-age=0, must-revalidate');
  }
});

test('asset header routes execute before filesystem handling', () => {
  const filesystemIndex = routes.findIndex(route => route.handle === 'filesystem');
  assert.ok(filesystemIndex >= 0, 'filesystem route missing');
  for (const pattern of ['/(.*\\.css)','/(.*\\.mjs)','/(.*\\.js)']) {
    const i = routes.findIndex(route => route.src === pattern);
    assert.ok(i >= 0 && i < filesystemIndex, `${pattern} must precede filesystem handling`);
  }
});
