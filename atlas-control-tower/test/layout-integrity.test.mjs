import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {frontendFiles} from '../frontend-files.mjs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const index = read('../index.html');
const css = read('../nextgen/styles.css');
const appSource = read('../nextgen/app.mjs');
const themeSource = read('../ui/theme.mjs');
const vercel = JSON.parse(read('../vercel.json'));
const builds = new Set(vercel.builds.map(x => x.src));

const obsoleteRuntimeStyles = ['ui/control-tower.css','ui/galactic-theme.css','ui/observatory-v2.css','ui/motion-impact.css','ui/readability.css'];

test('NextGen is the only active shell loaded by the entrypoint', () => {
  assert.match(index, /\/nextgen\/styles\.css/);
  assert.match(index, /\/nextgen\/app\.mjs/);
  assert.doesNotMatch(index, /\/ui\/official-dashboard\.css|\/ui\/premium-v2\.css|\/ui\/reference-one\.css|\/ui\/reference-deck\.css/);
  for (const file of obsoleteRuntimeStyles) {
    const escaped = file.replace(/[./]/g, m => '\\' + m);
    assert.doesNotMatch(index, new RegExp(escaped), `entrypoint still loads competing layer ${file}`);
  }
});

test('NextGen solves width pressure and safe-area layout explicitly', () => {
  assert.match(css, /overflow-x:hidden/);
  assert.match(css, /viewport-fit=cover|safe-area-inset-top|safe-area-inset-bottom/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /100dvh/);
  assert.match(css, /\.lower-deck\{display:grid/);
});

test('graph geometry stays interactive while cosmic layers stay paint-only', () => {
  assert.match(css, /#cosmos\{[^}]*touch-action:none/s);
  assert.match(css, /\.observatory:after\{[^}]*pointer-events:none/s);
  assert.doesNotMatch(appSource, /transparentBackground/);
});

test('theme bootstrap does not request a stylesheet excluded from the public build', () => {
  assert.doesNotMatch(themeSource, /readability\.css/i);
  assert.doesNotMatch(themeSource, /data-atlas-readability/i);
});

test('NextGen public assets are present in both boundary and Vercel build', () => {
  for(const file of ['nextgen/styles.css','nextgen/app.mjs','nextgen/graph/engine.mjs']){
    assert.equal(frontendFiles.includes(file),true,`frontend boundary missing ${file}`);
    assert.equal(builds.has(file),true,`Vercel build missing ${file}`);
  }
});
