import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../api/runtime-orphans.js',import.meta.url),'utf8');

test('runtime uses live SSOT projection before static fallback',()=>{
 assert.match(source,/loadLiveSsot/);
 assert.match(source,/projectLiveRoute/);
 assert.match(source,/driveRoute/);
 assert.match(source,/LIVE_SSOT_UNAVAILABLE/);
});

test('POST is accepted only for sync and returns semantic diff',()=>{
 assert.match(source,/route==='sync'/);
 assert.match(source,/syncLiveSsot/);
 assert.match(source,/changedSections/);
 assert.match(source,/METHOD_NOT_ALLOWED/);
});
