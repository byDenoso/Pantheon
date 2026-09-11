import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('dark theme keeps learning and structural surfaces dark and legible', () => {
  const css = read('src/design/theme.css');
  assert.match(css, /html\[data-theme="dark"\] \.learning-inspector/);
  assert.match(css, /html\[data-theme="dark"\] \.structural-inspector/);
  assert.match(css, /--muted:#c/);
});

test('mobile graph surfaces stay visible and pannable instead of collapsing', () => {
  const css = read('src/design/mobile.css');
  assert.match(css, /\.domain-navigator-svg\{[^}]*min-width:/s);
  assert.match(css, /\.learning-mesh\{[^}]*min-width:/s);
  assert.match(css, /\.structural-map-canvas\{[^}]*min-height:/s);
});

test('preview runtime falls back to canonical live API when OIDC is unavailable', () => {
  const runtime = read('api/runtime-orphans.js');
  assert.match(runtime, /VERCEL_ENV/);
  assert.match(runtime, /CANONICAL_API_ORIGIN/);
  assert.match(runtime, /proxyCanonical/);
});
