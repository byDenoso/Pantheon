import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const wrapper=await readFile(new URL('../api/runtime-orphans.js',import.meta.url),'utf8');
const runtime=await readFile(new URL('../api/runtime-github.js',import.meta.url),'utf8');
const authority=await readFile(new URL('../lib/github-authority.mjs',import.meta.url),'utf8');

test('runtime delegates to GitHub canonical implementation',()=>{
 assert.match(wrapper,/runtime-github\.js/);
});

test('sync uses GitHub canonical runtime',()=>{
 assert.match(runtime,/syncGithubCanonical/);
 assert.match(runtime,/loadGithubCanonical/);
 assert.match(runtime,/projectGithubCanonical/);
 assert.match(runtime,/GITHUB/);
 assert.match(runtime,/lastValidPreserved/);
});

test('authority contract is explicit',()=>{
 assert.match(authority,/NEXO_CANONICAL_GITHUB_V1/);
 assert.match(authority,/api\.github\.com/);
});
