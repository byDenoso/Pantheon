import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {frontendFiles} from '../frontend-files.mjs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const referenceCss = read('../ui/reference-one.css');
const officialCss = read('../ui/official-dashboard.css');
const reactCss = read('../src/styles/react-atlas.css');
const mainSource = read('../src/main.tsx');
const appSource = read('../src/App.tsx');

const obsoleteRuntimeStyles = ['ui/control-tower.css','ui/galactic-theme.css','ui/observatory-v2.css'];

test('reference-one is the final shell override after shared styles in the Vite entrypoint', () => {
  assert.match(mainSource, /\.\.\/styles\.css/);
  assert.match(mainSource, /\.\.\/ui\/official-dashboard\.css/);
  assert.match(mainSource, /\.\.\/ui\/premium-v2\.css/);
  assert.match(mainSource, /\.\.\/ui\/reference-one\.css/);
  assert.ok(mainSource.indexOf('../ui/premium-v2.css') < mainSource.indexOf('../ui/reference-one.css'));
  for (const file of obsoleteRuntimeStyles) {
    assert.equal(frontendFiles.includes(file), false, `frontend boundary still deploys ${file}`);
    assert.doesNotMatch(mainSource, new RegExp(file.replace(/[./]/g,m=>'\\'+m)));
  }
  assert.doesNotMatch(officialCss, /Cosmic dark-mode rework/i);
});

test('reference shell solves width pressure instead of masking it', () => {
  assert.doesNotMatch(referenceCss, /overflow-x\s*:\s*hidden/i);
  assert.match(referenceCss, /--reference-sidebar-width\s*:/);
  assert.match(referenceCss, /--reference-gutter\s*:/);
  assert.match(referenceCss, /\.reference-main[^}]*min-width\s*:\s*0/s);
  assert.match(referenceCss, /grid-template-columns\s*:[^;}]*minmax\(0\s*,\s*1fr\)/i);
});

test('wallpaper stays passive while the R3F canvas owns pointer interaction', () => {
  assert.match(referenceCss, /\.reference-space[^}]*pointer-events\s*:\s*none/s);
  assert.match(reactCss, /\.atlas-webgpu-canvas[^}]*touch-action\s*:\s*none/s);
  assert.match(appSource, /<AtlasCanvas/);
  assert.doesNotMatch(appSource, /transparentBackground/);
});

test('React layout includes responsive pressure relief', () => {
  assert.match(reactCss, /@media\(max-width:980px\)/);
  assert.match(reactCss, /@media\(max-width:760px\)/);
  assert.match(reactCss, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
