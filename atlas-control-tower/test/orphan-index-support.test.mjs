import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const orphanRuntime = read('../api/runtime-orphans.js');
const drive = read('../lib/drive-ssot.mjs');
const inspector = read('../ui/inspector.mjs');

test('runtime routes orphaned compatibility reads through the Drive authority', () => {
  assert.match(orphanRuntime, /driveRoute,DRIVE_SSOT_META/);
  assert.match(orphanRuntime, /X-Atlas-Authority/);
  assert.match(orphanRuntime, /GOOGLE_DRIVE/);
  assert.match(orphanRuntime, /READ_ONLY_DRIVE_SSOT/);
  assert.match(orphanRuntime, /driveRoute\(route,query,\{method\}\)/);
});

test('Drive entities preserve source references as provenance metadata', () => {
  assert.match(drive, /metadata:\{sourceRef/);
  assert.match(drive, /driveEntity/);
  assert.match(drive, /entity\?\.metadata\?\.sourceRef/);
});

test('Inspector exposes source link in the normal entity action row', () => {
  assert.match(inspector, /Fonte ↗/);
  assert.match(inspector, /sourceUrl/);
  assert.match(inspector, /window\.open\(sourceUrl/);
});
