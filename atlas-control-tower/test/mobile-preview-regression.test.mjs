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

test('mobile overrides are loaded after theme and renderer styles', () => {
  const css = read('src/design/index.css');
  assert.ok(css.indexOf("./mobile.css") > css.indexOf("./theme.css"));
  assert.ok(css.indexOf("./mobile.css") > css.indexOf("./structural.css"));
});
