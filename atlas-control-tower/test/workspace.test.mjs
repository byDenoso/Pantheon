import test from 'node:test';
import assert from 'node:assert/strict';
import {modeState, normalizeMode} from '../ui/workspace.mjs';

// Dados, Learning and Auditoria used to be sibling tab panels. Their relations
// are now read on the map itself, so the workspace has one surface and one mode.
test('the workspace exposes the map as its only surface', () => {
 assert.deepEqual(modeState('overview'), {map:true});
 assert.deepEqual(modeState('learning'), {map:true});
 assert.deepEqual(modeState('audit'), {map:true});
});

test('every mode normalizes to the map, so it can never be hidden', () => {
 for (const mode of ['overview','explore','learning','audit','unknown','',undefined])
  assert.equal(normalizeMode(mode),'overview');
});
