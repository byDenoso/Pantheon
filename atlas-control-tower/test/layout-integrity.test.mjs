import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {frontendFiles} from '../frontend-files.mjs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const index = read('../index.html');
const referenceCss = read('../ui/reference-one.css');
const officialCss = read('../ui/official-dashboard.css');
const graphSource = read('../graph3d.mjs');
const appSource = read('../app.mjs');
const themeSource = read('../ui/theme.mjs');
const vercel = JSON.parse(read('../vercel.json'));
const builds = new Set(vercel.builds.map(x => x.src));

const obsoleteRuntimeStyles = ['ui/control-tower.css','ui/galactic-theme.css','ui/observatory-v2.css'];

test('reference-one is the only current shell override after shared base styles', () => {
  assert.match(index, /\/styles\.css/);
  assert.match(index, /\/ui\/official-dashboard\.css/);
  assert.match(index, /\/ui\/premium-v2\.css/);
  assert.match(index, /\/ui\/reference-one\.css/);
  for (const file of obsoleteRuntimeStyles) {
    const escaped = file.replace(/[./]/g, m => '\\' + m);
    assert.doesNotMatch(index, new RegExp(escaped), `entrypoint still loads competing layer ${file}`);
    assert.equal(frontendFiles.includes(file), false, `frontend boundary still deploys ${file}`);
    assert.equal(builds.has(file), false, `Vercel still builds ${file}`);
  }
  assert.doesNotMatch(officialCss, /Cosmic dark-mode rework/i);
});

test('reference shell solves width pressure instead of masking horizontal overflow', () => {
  assert.doesNotMatch(referenceCss, /overflow-x\s*:\s*hidden/i);
  assert.match(referenceCss, /--reference-sidebar-width\s*:/);
  assert.match(referenceCss, /--reference-gutter\s*:/);
  assert.match(referenceCss, /\.reference-main[^}]*min-width\s*:\s*0/s);
  assert.match(referenceCss, /grid-template-columns\s*:[^;}]*minmax\(0\s*,\s*1fr\)/i);
  assert.match(referenceCss, /@media\s*\(max-width\s*:\s*1600px\)/i);
  assert.match(referenceCss, /@media\s*\(max-width\s*:\s*1366px\)/i);
});

test('reference wallpaper can remain behind an intentionally transparent graph canvas', () => {
  assert.match(referenceCss, /\.reference-space[^}]*pointer-events\s*:\s*none/s);
  assert.match(graphSource, /transparentBackground/);
  assert.match(appSource, /transparentBackground\s*:\s*document\.body\.classList\.contains\(['"]reference-one['"]\)/);
});

test('theme bootstrap does not request a stylesheet excluded from the public build', () => {
  assert.doesNotMatch(themeSource, /readability\.css/i);
  assert.doesNotMatch(themeSource, /data-atlas-readability/i);
});

test('reference console rows contain variable real text without widening their grid', () => {
  assert.match(referenceCss, /\.ct-ref-row[^}]*min-width\s*:\s*0/s);
  assert.match(referenceCss, /\.ct-ref-row b[^}]*overflow-wrap\s*:\s*anywhere/s);
  assert.match(referenceCss, /\.ct-reference-grid[^}]*minmax\(0\s*,\s*1fr\)/s);
});
