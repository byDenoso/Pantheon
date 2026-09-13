import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const rendererUrl = new URL('../src/graph-engine/GraphRenderer.tsx', import.meta.url);
const mainUrl = new URL('../src/main.tsx', import.meta.url);

test('graph renderer does not require a react-router context inside the custom Atlas shell', async () => {
  const [renderer, main] = await Promise.all([
    readFile(rendererUrl, 'utf8'),
    readFile(mainUrl, 'utf8')
  ]);

  assert.doesNotMatch(renderer, /react-router-dom/);
  assert.doesNotMatch(renderer, /\buseSearchParams\b/);
  assert.match(renderer, /URLSearchParams/);
  assert.match(renderer, /history\.replaceState/);
  assert.doesNotMatch(main, /<BrowserRouter\b|<RouterProvider\b/);
});

test('root render failures become a visible bootstrap diagnostic instead of a blank page', async () => {
  const main = await readFile(mainUrl, 'utf8');
  assert.match(main, /class RootErrorBoundary/);
  assert.match(main, /getDerivedStateFromError/);
  assert.match(main, /atlas-bootstrap-error/);
  assert.match(main, /<RootErrorBoundary>/);
  assert.match(main, /Falha ao iniciar o NEXO Atlas/);
});
