import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const orphanRuntime = read('../api/runtime-orphans.js');
const drive = read('../lib/drive-ssot.mjs');
const inspector = read('../ui/inspector.mjs');

test('runtime compatibility delegates canonical reads to Drive and has no GitHub fallback', () => {
  assert.match(orphanRuntime, /runtime-drive\.js/);
  assert.doesNotMatch(orphanRuntime, /runtime-github\.js/);
  assert.match(orphanRuntime, /return drive\(req,res\)/);
});

test('Drive entities preserve source references as projection provenance metadata', () => {
  assert.match(drive, /metadata:\{sourceRef/);
  assert.match(drive, /driveEntity/);
  assert.match(drive, /entity\?\.metadata\?\.sourceRef/);
});

test('Inspector exposes source link in the normal entity action row', () => {
  assert.match(inspector, /Fonte ↗/);
  assert.match(inspector, /sourceUrl/);
  assert.match(inspector, /window\.open\(sourceUrl/);
});
