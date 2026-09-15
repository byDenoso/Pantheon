import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/atlas-v3/index.html', import.meta.url), 'utf8');
const js = await readFile(new URL('../public/atlas-v3/atlas-v3.js', import.meta.url), 'utf8');

const layers = ['SCIENCE', 'LEARNING', 'OPERATIONS', 'EVIDENCE', 'PROVENANCE', 'HEALTH'];

test('Atlas Neural V3 is one spatial workspace with six presentation layers', () => {
  assert.match(html, /NEXO Atlas/);
  assert.match(html, /NEURAL V3/);
  assert.match(html, /Um universo\. Uma autoridade\. Várias camadas\./);
  for (const layer of layers) assert.match(html, new RegExp(`data-layer="${layer}"`));
});

test('V3 browser reads only the published V3 projection contract', () => {
  assert.match(js, /\.\.\/data\/v3\/current\/manifest\.json/);
  assert.match(js, /authority !== 'TOWER_V06'/);
  assert.match(js, /projectionOnly !== true/);
  assert.doesNotMatch(js, /vercel\.app|neon|google drive/i);
});

test('V3 refuses to invent replacement state on projection failure', () => {
  assert.match(js, /Projeção indisponível\. O Atlas não inventará um estado substituto\./);
});
