import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReleaseVercelConfig} from '../scripts/release-config.mjs';

const sourceConfig={headers:[{source:'/(.*)',headers:[
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'Referrer-Policy',value:'no-referrer'}
]}]};

test('release config publishes hashed frontend assets explicitly before SPA fallback',()=>{
  const out=buildReleaseVercelConfig(sourceConfig,[
    'index.html',
    'assets/index-ABC123.js',
    'assets/index-DEF456.css'
  ]);
  assert.deepEqual(out.builds.map(x=>x.src),[
    'api/index.js',
    'index.html',
    'assets/index-ABC123.js',
    'assets/index-DEF456.css'
  ]);
  assert.equal(out.builds.some(x=>x.src==='assets/**'),false);
  const filesystem=out.routes.findIndex(x=>x.handle==='filesystem');
  const fallback=out.routes.findIndex(x=>x.dest==='/index.html'&&x.src==='/(.*)');
  assert.ok(filesystem>=0&&fallback>filesystem,'filesystem must run before SPA fallback');
});
