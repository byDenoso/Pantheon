import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');

test('initial render does not immediately force a second source sync',()=>{
 assert.doesNotMatch(src,/\nrunSync\(\);\s*$/);
});

test('manual sync is forceful while background syncs share a freshness gate',()=>{
 assert.match(src,/\$\('#sync'\)\.onclick = \(\) => runSync\(true\)/);
 assert.match(src,/async function runSync\(force = false\)/);
 assert.match(src,/if \(!force && Date\.now\(\) - lastAutoSyncAt < AUTO_SYNC_MS\) return null/);
 assert.match(src,/visibilitychange[\s\S]{0,140}runSync\(false\)/);
 assert.match(src,/setInterval\([\s\S]{0,100}runSync\(false\)/);
});
