import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const wrapper=await readFile(new URL('../api/runtime-orphans.js',import.meta.url),'utf8');
const authority=await readFile(new URL('../lib/github-authority.mjs',import.meta.url),'utf8');

test('runtime delegates canonical reads directly to the live Drive Tower adapter',()=>{
 assert.match(wrapper,/runtime-drive\.js/);
 assert.doesNotMatch(wrapper,/runtime-github\.js/);
});

test('compatibility route preserves the separately read-only activity endpoint',()=>{
 assert.match(wrapper,/live-activity/);
 assert.match(wrapper,/liveActivity/);
});

test('authority contract is explicit',()=>{
 assert.match(authority,/NEXO_ATLAS_AUTHORITY_V2/);
 assert.match(authority,/TOWER_V06/);
 assert.match(authority,/api\.github\.com/);
});
