import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const read=rel=>fs.readFileSync(path.join(lab,rel),'utf8');

test('visual presets are centralized and shared by every renderer',()=>{
 const source=read('graph/renderers/visual-presets.mjs');
 for(const name of ['REFERENCE_3','GALACTIC_DUST','FOCUS_REVIEW','MOBILE_CLEAN','PERFORMANCE','PRESENTATION','BABYLON_OBSERVATORY'])assert.match(source,new RegExp(`${name}:`));
 assert.match(source,/Object\.assign\(PRESETS,VISUAL_PRESETS\)/);
});

test('renderer preferences persist one semantic renderer selection',()=>{
 const source=read('graph/renderers/renderer-runtime.mjs');
 assert.match(source,/nexo-atlas-renderer-runtime-v7/);
 assert.match(source,/localStorage\.getItem/);
 assert.match(source,/localStorage\.setItem/);
 assert.match(source,/saveManualRendererOverride/);
 assert.match(source,/clearManualRendererOverride/);
 assert.doesNotMatch(source,/environmentRendererId/);
});

test('standalone shell boots through the renderer factory rather than a legacy lab adapter',()=>{
 const app=read('app.mjs');
 const adapter=read('graph/canvas-reference-background.mjs');
 assert.match(app,/renderer-factory\.mjs/);
 assert.match(app,/createGraphRenderer/);
 assert.match(app,/\.\/graph\/canvas-reference-background\.mjs/);
 assert.doesNotMatch(adapter,/nexo-atlas-renderer-lab-v3/);
 assert.doesNotMatch(adapter,/upgradeRendererLabV3/);
});
