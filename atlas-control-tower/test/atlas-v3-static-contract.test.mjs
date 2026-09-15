import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const html=fs.readFileSync(new URL('atlas-v3/index.html',root),'utf8');
const app=fs.readFileSync(new URL('src/atlas-v3/AtlasV3App.tsx',root),'utf8');
const loader=fs.readFileSync(new URL('src/atlas-v3/projection-loader.mjs',root),'utf8');
const css=fs.readFileSync(new URL('src/atlas-v3/atlas-v3.css',root),'utf8');

test('Atlas Neural V3 is a bundled standalone read-only projection surface',()=>{
  assert.match(html,/NEURAL V3/);
  assert.match(html,/Um universo\. Uma autoridade\. Várias camadas\./);
  assert.match(app,/SCIENCE/);
  assert.match(app,/LEARNING/);
  assert.match(app,/OPERATIONS/);
  assert.match(app,/EVIDENCE/);
  assert.match(app,/PROVENANCE/);
  assert.match(app,/HEALTH/);
  assert.match(app,/AtlasCanvas/);
  assert.match(css,/\.cinematic-stage/);
  assert.match(css,/\.inspector-sheet/);
  assert.match(css,/\.runtime-strip/);
});

test('Atlas Neural V3 reads only the validated Projection V3 snapshot',()=>{
  assert.match(loader,/data\/v3\/current\/manifest\.json/);
  assert.match(loader,/TOWER_V06/);
  assert.match(loader,/projectionOnly/);
  assert.match(loader,/fingerprint divergente/);
  assert.doesNotMatch(loader,/tower-source\.json|bootstrap-source\.json|drive|vercel|neon/i);
});
