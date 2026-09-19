import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYER_TYPES, PRESETS, applyPreset, presetById, typesForLayers } from '../src/viewmodels/layers.ts';
import { EMPTY_FILTERS } from '../src/viewmodels/graph.ts';

test('every preset is built only from real layer ids', () => {
  const validLayers = new Set(Object.keys(LAYER_TYPES));
  for (const preset of PRESETS) {
    assert.ok(preset.layers.length > 0, preset.id);
    for (const layer of preset.layers) assert.ok(validLayers.has(layer), `${preset.id} -> ${layer}`);
  }
});

test('typesForLayers unions only the canonical GraphNodeTypes those layers declare', () => {
  assert.deepEqual(typesForLayers(['TESTS']), ['TEST']);
  assert.deepEqual(typesForLayers(['TESTS', 'HYPOTHESES']).sort(), ['FILAMENT', 'TEST']);
  assert.deepEqual(typesForLayers(['NEEDS_YOU', 'CHANGES', 'RELATIONS']), []);
});

test('RESEARCH/EXECUTION/LEARNING presets narrow filters.types to real canonical types', () => {
  const research = applyPreset(presetById('RESEARCH'), EMPTY_FILTERS);
  assert.deepEqual(research.types.sort(), ['FILAMENT', 'TEST']);
  assert.deepEqual(research.domains, []);

  const execution = applyPreset(presetById('EXECUTION'), EMPTY_FILTERS);
  assert.deepEqual(execution.types.sort(), ['CAPABILITY', 'PROVIDER', 'TEST']);

  const learning = applyPreset(presetById('LEARNING'), EMPTY_FILTERS);
  assert.deepEqual(learning.types, ['FILAMENT']);
});

test('ATTENTION preset narrows by BLOCKED state, not by type — attention is a state, not a taxonomy', () => {
  const attention = applyPreset(presetById('ATTENTION'), EMPTY_FILTERS);
  assert.deepEqual(attention.types, []);
  assert.deepEqual(attention.states, ['BLOCKED']);
});

test('FULL_SYSTEM preset applies no type narrowing at all (every layer is active)', () => {
  const full = applyPreset(presetById('FULL_SYSTEM'), EMPTY_FILTERS);
  assert.deepEqual(full.types, []);
  assert.deepEqual(full.states, []);
});

test('applying a preset preserves the current search text but clears other filters', () => {
  const filters = { ...EMPTY_FILTERS, search: 'olympus', domains: ['SCIENCE'], types: ['ACTION'] };
  const result = applyPreset(presetById('EXECUTION'), filters);
  assert.equal(result.search, 'olympus');
  assert.deepEqual(result.domains, []);
});

test('presetById returns null for an unknown id instead of throwing', () => {
  assert.equal(presetById('NOT_A_PRESET'), null);
});
