import test from 'node:test';
import assert from 'node:assert/strict';
import {modeState, normalizeMode} from '../ui/workspace.mjs';

test('workspace modes expose exactly one primary surface', () => {
 assert.deepEqual(modeState('overview'), {map:true,data:false,learning:false,audit:false});
 assert.deepEqual(modeState('explore'), {map:false,data:true,learning:false,audit:false});
 assert.deepEqual(modeState('learning'), {map:false,data:false,learning:true,audit:false});
 assert.deepEqual(modeState('audit'), {map:false,data:false,learning:false,audit:true});
});

test('workspace mode normalization falls back to overview', () => {
 assert.equal(normalizeMode('overview'),'overview');
 assert.equal(normalizeMode('explore'),'explore');
 assert.equal(normalizeMode('learning'),'learning');
 assert.equal(normalizeMode('audit'),'audit');
 assert.equal(normalizeMode('unknown'),'overview');
 assert.equal(normalizeMode(''),'overview');
});
