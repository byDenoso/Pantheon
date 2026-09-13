import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const read=p=>readFileSync(join(here,'..',p),'utf8');

test('legacy semantic wrapper remains provider-neutral compatibility code',()=>{
  const runtime=read('api/runtime-semantic.js');
  assert.match(runtime,/short_label_pt/);
  assert.match(runtime,/what_pt/);
  assert.match(runtime,/how_pt/);
  assert.match(runtime,/why_pt/);
});

test('Vercel compatibility APIs route through GitHub canonical runtime and expose only POST sync as mutation-shaped refresh',()=>{
  const vercel=read('vercel.json');
  assert.match(vercel,/api\/runtime-orphans\.js/);
  assert.match(vercel,/"dest":\s*"\/api\/runtime-orphans\.js\?route=\$1"/);
  const wrapper=read('api/runtime-orphans.js');
  const runtime=read('api/runtime-github.js');
  assert.match(wrapper,/runtime-github\.js/);
  assert.match(runtime,/loadGithubCanonical/);
  assert.match(runtime,/method==='POST'&&route==='sync'/);
  assert.match(runtime,/METHOD_NOT_ALLOWED/);
  assert.match(runtime,/GITHUB/);
});
