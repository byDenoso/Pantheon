import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=rel=>fs.readFileSync(new URL(`../${rel}`,import.meta.url),'utf8');

test('Atlas adapter prefers science-read-model and exposes a dedicated SRM reader',()=>{
  const source=read('src/api/multisurface-adapters.ts');
  assert.match(source,/science-read-model/);
  assert.match(source,/getScienceReadModel/);
  assert.match(source,/getObservatoryQuestions/);
});

test('Cockpit source reads SRM structure instead of requiring DOMAIN nodes in the structural graph',()=>{
  const source=read('src/core/PublicSnapshotSource.ts');
  assert.match(source,/science-read-model/);
  assert.match(source,/structure\.facets/);
  assert.match(source,/structure\.campaigns/);
});

test('Universe uses the generic scientific observation renderer registry',()=>{
  const pages=read('src/pages/atlas-pages.tsx');
  const renderer=read('src/components/ScientificObservationRenderer.tsx');
  assert.match(pages,/ScientificObservationRenderer/);
  assert.match(pages,/useScienceReadModel/);
  assert.match(renderer,/scalar/);
  assert.match(renderer,/interval/);
  assert.match(renderer,/directional/);
  assert.match(renderer,/timeseries/);
  assert.match(renderer,/matrix/);
  assert.match(renderer,/distribution/);
  assert.match(renderer,/categorical/);
  assert.match(renderer,/cosmology\.H0/);
});

test('generic SRM parser exists independently of page components',()=>{
  const parser=read('src/api/science-read-model.ts');
  assert.match(parser,/NEXO_SCIENCE_READ_MODEL_V2/);
  assert.match(parser,/parseScienceReadModel/);
  assert.match(parser,/ScientificObservation/);
});
