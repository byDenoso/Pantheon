import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('crew cards keep the continuity, description and status in the same full-width track', async () => {
  const css = await readFile(new URL('../src/styles/atlas-cinematic.css', import.meta.url), 'utf8');
  assert.match(css, /\.observatory \.crew-card\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.crew-card>:is\(\.crew-top,\.crew-hats,\.crew-does,\.crew-continuity,\.crew-pulse\)\{grid-column:1\/-1;min-width:0;overflow-wrap:anywhere\}/);
  assert.match(css, /\.crew-card \.crew-top\{display:flex;flex-wrap:wrap/);
});
