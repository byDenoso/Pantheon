import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../nextgen/styles.css', import.meta.url), 'utf8');
const tower = fs.readFileSync(new URL('../ui/control-tower.mjs', import.meta.url), 'utf8');

test('NextGen command center exposes the semantic depth rail and 3.5D hero shell', () => {
  for (const label of ['MACRO','SCIENTIFIC','PROVENANCE','AUTO ZOOM']) assert.match(index, new RegExp(label));
  assert.match(index, /NEXO \/ EXPLORE · MACRO/);
  assert.match(index, /Universo científico/);
  assert.match(index, /id="cosmos"/);
  assert.match(index, /TRUTH OWNER/);
  assert.match(index, /GOOGLE DRIVE/);
  assert.doesNotMatch(index, /NEON V1/);
  assert.doesNotMatch(index, /FRONTEND OFICIAL|reference-cosmos-index|reference-quote/);
});

test('NextGen spatial shell is responsive and keeps graph center interactive', () => {
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /#cosmos\{[^}]*touch-action:none/s);
  assert.match(css, /\.observatory\{[^}]*overflow:hidden/s);
  assert.match(css, /100dvh/);
});

test('legacy operational deck remains testable while the NextGen entrypoint supersedes it', () => {
  assert.match(tower, /ct-status-ring/);
  assert.match(tower, /ct-system-list/);
  assert.match(tower, /ct-action-state/);
  assert.match(tower, /Ver todos os blockers/);
  assert.match(tower, /Ver histórico/);
});
