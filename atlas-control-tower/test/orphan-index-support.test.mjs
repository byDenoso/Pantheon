import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const orphanRuntime = read('../api/runtime-orphans.js');
const githubRuntime = read('../api/runtime-github.js');
const drive = read('../lib/drive-ssot.mjs');
const inspector = read('../ui/inspector.mjs');

test('runtime compatibility delegates to GitHub authority with explicit stale projection fallback', () => {
  assert.match(orphanRuntime, /runtime-github\.js/);
  assert.match(githubRuntime, /loadGithubCanonical/);
  assert.match(githubRuntime, /syncGithubCanonical/);
  assert.match(githubRuntime, /projectGithubCanonical/);
  assert.match(githubRuntime, /driveRoute/);
  assert.match(githubRuntime, /X-Atlas-Authority/);
  assert.match(githubRuntime, /GITHUB/);
  assert.match(githubRuntime, /GITHUB_CANONICAL_UNAVAILABLE/);
  assert.match(githubRuntime, /freshness:'STALE'/);
  assert.match(githubRuntime, /METHOD_NOT_ALLOWED/);
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
