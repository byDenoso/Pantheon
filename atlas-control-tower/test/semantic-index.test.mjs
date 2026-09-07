import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const read=p=>readFileSync(join(here,'..',p),'utf8');

test('production semantic wrapper reads the PT-BR cockpit overlay and merges display metadata',()=>{
  const runtime=read('api/runtime-semantic.js');
  assert.match(runtime,/flight_api/);
  assert.match(runtime,/atlas_cockpit_index/);
  assert.match(runtime,/short_label_pt/);
  assert.match(runtime,/what_pt/);
  assert.match(runtime,/how_pt/);
  assert.match(runtime,/why_pt/);
  assert.match(runtime,/cockpitCache/);
  assert.match(runtime,/metadata:\s*\{\s*\.\.\.\(entity\.metadata\|\|\{\}\),\s*\.\.\.cockpit/i);
});

test('sync forces semantic overlay refresh and Vercel routes APIs through the wrapper',()=>{
  const runtime=read('api/runtime-semantic.js');
  const vercel=read('vercel.json');
  assert.match(runtime,/loadCockpitIndex\(req,true\)/);
  assert.match(vercel,/api\/runtime-semantic\.js/);
  assert.match(vercel,/"dest":\s*"\/api\/runtime-semantic\.js\?route=\$1"/);
});
