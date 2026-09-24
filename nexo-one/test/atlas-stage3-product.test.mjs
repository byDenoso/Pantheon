import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const text = path => readFile(new URL(path, root), 'utf8');

test('mobile breakpoints exist for the new mode/tour/HUD controls', async () => {
  const css = await text('src/styles/system.css');
  assert.match(css, /@media \(max-width:760px\)\{[\s\S]*?\.atlas-mode-toggle/);
});
