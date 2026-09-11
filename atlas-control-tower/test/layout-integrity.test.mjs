import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const shellCss = read('../src/design/shell.css');
const contentCss = read('../src/design/content.css');
const reactCss = read('../src/styles/react-atlas.css');
const mainSource = read('../src/main.tsx');
const appSource = read('../src/App.tsx');

test('vNext entrypoint has one design-system import and no legacy override stack', () => {
  assert.match(mainSource, /\.\/design\/index\.css/);
  for (const legacy of ['../styles.css','official-dashboard.css','premium-v2.css','reference-one.css','galactic-theme.css']) {
    assert.doesNotMatch(mainSource, new RegExp(legacy.replace(/[./]/g,m=>'\\'+m)));
  }
});

test('new shell solves width pressure structurally instead of masking it', () => {
  assert.doesNotMatch(shellCss, /overflow-x\s*:\s*hidden/i);
  assert.match(shellCss, /grid-template-columns:228px minmax\(0,1fr\)/);
  assert.match(shellCss, /\.nexo-workspace\{min-width:0\}/);
  assert.match(contentCss, /grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
});

test('graph interaction remains isolated from the root shell', () => {
  assert.match(reactCss, /\.atlas-webgpu-canvas[^}]*touch-action\s*:\s*none/s);
  assert.doesNotMatch(appSource, /<AtlasCanvas|transparentBackground/);
});

test('vNext layout includes desktop, tablet and mobile pressure relief', () => {
  assert.match(shellCss, /@media\(max-width:820px\)/);
  assert.match(shellCss, /@media\(max-width:560px\)/);
  assert.match(shellCss, /grid-template-columns:72px minmax\(0,1fr\)/);
});
