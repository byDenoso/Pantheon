import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const read=rel=>readFileSync(resolve(here,rel),'utf8');

test('Atlas runtime fails closed instead of serving or relabeling Drive fallback',()=>{
  const runtime=read('../api/runtime-github.js');
  const authority=read('../lib/github-authority.mjs');
  assert.doesNotMatch(runtime,/driveRoute/);
  assert.doesNotMatch(runtime,/LEGACY_GOOGLE_DRIVE_SNAPSHOT/);
  assert.match(runtime,/TOWER_PROJECTION_UNAVAILABLE/);
  assert.match(runtime,/,503,\{noStore:true\}\)/);
  assert.match(authority,/ATLAS_LEGACY_DRIVE_PROJECTION_RETIRED/);
});

test('Vercel projects skip builds when their project directory is unchanged',()=>{
  const atlas=JSON.parse(read('../vercel.json'));
  const nexo=JSON.parse(read('../../nexo-one/vercel.json'));
  const root=JSON.parse(read('../../vercel.json'));
  assert.equal(atlas.ignoreCommand,'git diff --quiet HEAD^ HEAD -- .');
  assert.equal(nexo.ignoreCommand,'git diff --quiet HEAD^ HEAD -- .');
  assert.equal(root.ignoreCommand,'git diff --quiet HEAD^ HEAD -- nexo-one vercel.json');
});
