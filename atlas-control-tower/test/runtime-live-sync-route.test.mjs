import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const wrapper=await readFile(new URL('../api/runtime-orphans.js',import.meta.url),'utf8');
const runtime=await readFile(new URL('../api/runtime-github.js',import.meta.url),'utf8');
const authority=await readFile(new URL('../lib/github-authority.mjs',import.meta.url),'utf8');

test('runtime delegates to the Tower projection compatibility implementation',()=>{
 assert.match(wrapper,/runtime-github\.js/);
});

test('sync uses the canonical projection runtime under Tower authority',()=>{
 assert.match(runtime,/syncGithubCanonical/);
 assert.match(runtime,/loadGithubCanonical/);
 assert.match(runtime,/projectGithubCanonical/);
 assert.match(runtime,/TOWER_V06/);
 assert.match(runtime,/lastValidPreserved/);
});

test('authority contract is explicit',()=>{
 assert.match(authority,/NEXO_ATLAS_AUTHORITY_V2/);
 assert.match(authority,/TOWER_V06/);
 assert.match(authority,/api\.github\.com/);
});