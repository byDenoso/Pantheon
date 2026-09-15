import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WORKSPACE_PREFERENCES,
  readWorkspacePreferences,
  writeWorkspacePreferences
} from '../src/state/workspace-preferences.ts';

function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

test('workspace preferences default to a useful map-first surface', () => {
  assert.deepEqual(readWorkspacePreferences(storage()), DEFAULT_WORKSPACE_PREFERENCES);
  assert.equal(DEFAULT_WORKSPACE_PREFERENCES.startArea, 'graphs');
});

test('workspace preferences survive reload and reject malformed values', () => {
  const target = storage({ 'nexo-atlas-workspace': JSON.stringify({ startArea: 'cockpit', showResearch: false, showOperations: true, showLearning: false }) });
  assert.deepEqual(readWorkspacePreferences(target), { startArea: 'cockpit', showResearch: false, showOperations: true, showLearning: false });
  assert.deepEqual(readWorkspacePreferences(storage({ 'nexo-atlas-workspace': '{broken' })), DEFAULT_WORKSPACE_PREFERENCES);
  writeWorkspacePreferences(target, { ...DEFAULT_WORKSPACE_PREFERENCES, startArea: 'observatory' });
  assert.equal(readWorkspacePreferences(target).startArea, 'observatory');
});
