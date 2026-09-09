import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const prefsPath=path.join(lab,'graph/renderer-lab-preferences.mjs');

test('renderer lab exposes additional production presets',()=>{
 assert.ok(fs.existsSync(prefsPath),'graph/renderer-lab-preferences.mjs must exist');
 const source=fs.readFileSync(prefsPath,'utf8');
 for(const name of ['REFERENCE_3','GALACTIC_DUST','FOCUS_REVIEW','MOBILE_CLEAN','PERFORMANCE']){
  assert.match(source,new RegExp(`${name}\\s*:`),`${name} preset must exist`);
 }
 assert.match(source,/Object\.assign\(PRESETS,EXTRA_PRESETS\)/,'extra presets must extend the canonical PRESETS object');
});

test('renderer lab preferences persist preset, dataset and slider values',()=>{
 assert.ok(fs.existsSync(prefsPath),'graph/renderer-lab-preferences.mjs must exist');
 const source=fs.readFileSync(prefsPath,'utf8');
 assert.match(source,/nexo-atlas-renderer-lab-v1/,'preferences must use a stable localStorage key');
 assert.match(source,/localStorage\.getItem/);
 assert.match(source,/localStorage\.setItem/);
 assert.match(source,/patchRendererPrototype/);
 assert.match(source,/prototype\.setPreset/);
 assert.match(source,/prototype\.setOptions/);
 assert.match(source,/dataset-size/);
 assert.match(source,/node-radius/);
 assert.match(source,/max-visible/);
});

test('standalone shell loads preferences before app and pins them for deploy',()=>{
 const index=fs.readFileSync(path.join(lab,'index.html'),'utf8');
 const builder=fs.readFileSync(path.join(lab,'build-cdn-index.mjs'),'utf8');
 assert.match(index,/\.\/graph\/renderer-lab-preferences\.mjs/);
 assert.ok(index.indexOf('./graph/renderer-lab-preferences.mjs')<index.indexOf('./app.mjs'),'preferences must load before app boot selects its initial preset');
 assert.match(builder,/graph\/renderer-lab-preferences\.mjs/);
});
