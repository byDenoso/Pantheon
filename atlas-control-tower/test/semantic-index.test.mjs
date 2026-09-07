import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const read=p=>readFileSync(join(here,'..',p),'utf8');

test('runtime reads the PT-BR cockpit overlay and merges it into entity metadata',()=>{
  const runtime=read('api/runtime.js');
  assert.match(runtime,/flight_api/);
  assert.match(runtime,/atlas_cockpit_index/);
  assert.match(runtime,/short_label_pt/);
  assert.match(runtime,/what_pt/);
  assert.match(runtime,/how_pt/);
  assert.match(runtime,/why_pt/);
  assert.match(runtime,/cockpitIndex/);
  assert.match(runtime,/metadata:\{[^}]*\.\.\.cockpit/i);
});

test('sync invalidates semantic overlay cache together with science and learning',()=>{
  const runtime=read('api/runtime.js');
  assert.match(runtime,/cockpitCache/);
  assert.match(runtime,/loadCockpitIndex\(token,true\)/);
});
