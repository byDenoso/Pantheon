import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const prefsPath=path.join(lab,'graph/renderer-lab-preferences.mjs');
const canvasAdapterPath=path.join(lab,'graph/canvas-reference-background.mjs');

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

test('standalone shell loads renderer preferences before app boot through the canvas adapter',()=>{
 const index=fs.readFileSync(path.join(lab,'index.html'),'utf8');
 const app=fs.readFileSync(path.join(lab,'app.mjs'),'utf8');
 const adapter=fs.readFileSync(canvasAdapterPath,'utf8');
 assert.match(index,/\.\/app\.mjs/);
 assert.match(app,/\.\/graph\/canvas-reference-background\.mjs/);
 assert.ok(app.indexOf('./graph/canvas-reference-background.mjs')<app.indexOf('./graph/legacy-renderer.mjs'),'canvas adapter must load before app boot selects its initial renderer');
 assert.match(adapter,/nexo-atlas-renderer-lab-v3/);
 assert.match(adapter,/upgradeRendererLabV3/);
});
