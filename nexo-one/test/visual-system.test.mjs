import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const text = async path => {
  try { return await readFile(new URL(path, root), 'utf8'); }
  catch { return ''; }
};

test('Command OS visual layer is loaded last so it can safely refine the existing system', async () => {
  const main = await text('src/main.tsx');
  const importIndex = main.indexOf("./styles/command-os.css");
  const systemIndex = main.indexOf("./styles/system.css");

  assert.ok(importIndex > systemIndex, 'command-os.css must be imported after system.css');
});

test('Command OS preserves semantic status colors while introducing explicit depth surfaces', async () => {
  const css = await text('src/styles/command-os.css');

  assert.match(css, /--surface-0:/);
  assert.match(css, /--surface-1:/);
  assert.match(css, /--surface-2:/);
  assert.match(css, /--command-accent:/);
  assert.match(css, /var\(--live\)/);
  assert.match(css, /var\(--degraded\)/);
  assert.match(css, /var\(--conflict\)/);
});

test('Command OS defines shell hierarchy, instrument cards and mobile adaptation', async () => {
  const css = await text('src/styles/command-os.css');

  assert.match(css, /\.cockpit\s*\{/);
  assert.match(css, /\.topbar\s*\{/);
  assert.match(css, /\.nav-rail\s*\{/);
  assert.match(css, /\.workspace-heading\s*\{/);
  assert.match(css, /\.domain-tile/);
  assert.match(css, /\.action-card/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /:focus-visible/);
});
