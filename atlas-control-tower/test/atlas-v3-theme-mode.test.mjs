import test from 'node:test';
import assert from 'node:assert/strict';

const moduleUrl = new URL('../src/atlas-v3/theme-mode.mjs', import.meta.url);

async function loadThemeMode() {
  try {
    return await import(moduleUrl);
  } catch (error) {
    assert.fail(`theme-mode module is missing or invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

test('theme mode reads only persisted light, dark or system values and defaults to system', async () => {
  const { readThemeMode } = await loadThemeMode();
  const storage = new Map([
    ['nexo-atlas-v3-theme', 'dark']
  ]);
  const adapter = {
    getItem: key => storage.get(key) ?? null
  };
  assert.equal(readThemeMode(adapter), 'dark');
  storage.set('nexo-atlas-v3-theme', 'invalid');
  assert.equal(readThemeMode(adapter), 'system');
  assert.equal(readThemeMode({ getItem: () => { throw new Error('blocked'); } }), 'system');
});

test('system theme resolves from prefers-color-scheme while explicit modes win', async () => {
  const { resolveTheme } = await loadThemeMode();
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('theme mode persistence writes the selected mode without breaking when storage is unavailable', async () => {
  const { persistThemeMode } = await loadThemeMode();
  const values = new Map();
  persistThemeMode('light', { setItem: (key, value) => values.set(key, value) });
  assert.equal(values.get('nexo-atlas-v3-theme'), 'light');
  assert.doesNotThrow(() => persistThemeMode('system', { setItem: () => { throw new Error('blocked'); } }));
});
