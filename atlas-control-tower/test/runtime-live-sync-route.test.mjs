import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../api/runtime-orphans.js',import.meta.url),'utf8');
const canonical=await readFile(new URL('../../nexo-one/server/adapters/github-canonical.mjs',import.meta.url),'utf8').catch(()=> '');

test('runtime uses live canonical projection before static fallback',()=>{
 assert.match(source,/loadLiveSsot/);
 assert.match(source,/projectLiveRoute/);
 assert.match(source,/LIVE_SSOT_UNAVAILABLE/);
});

test('POST is accepted only for sync and returns semantic diff',()=>{
 assert.match(source,/route==='sync'/);
 assert.match(source,/syncLiveSsot/);
 assert.match(source,/changedSections/);
 assert.match(source,/METHOD_NOT_ALLOWED/);
});

test('GitHub is the canonical authority for sync',()=>{
 assert.match(source,/authority:'GITHUB'/);
 assert.doesNotMatch(source,/authority:'GOOGLE_DRIVE'/);
 assert.match(canonical,/NEXO_CANONICAL_GITHUB_V1/);
 assert.match(canonical,/raw\.githubusercontent\.com/);
});
