import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const canvasRework=path.join(lab,'graph/canvas-reference-background.mjs');

test('2D canvas renderer owns the approved third-reference galactic background',()=>{
 assert.ok(fs.existsSync(canvasRework),'graph/canvas-reference-background.mjs must exist');
 const source=fs.readFileSync(canvasRework,'utf8');
 assert.match(source,/GraphLabRenderer as LegacyCanvasRenderer/);
 assert.match(source,/prototype\.drawSpace/);
 assert.match(source,/referenceGalaxyTexture/);
 assert.match(source,/dust lane/i);
 assert.match(source,/blue-gold|gold-blue|orange-blue/i);
 assert.match(source,/cacheKey/);
 assert.doesNotMatch(source,/layoutNodes/,'background adapter must not alter graph layout');
 assert.doesNotMatch(source,/setGraph\s*=/,'background adapter must not replace graph data flow');
});

test('standalone shell loads the 2D background adapter before app and pins it for deploy',()=>{
 const index=fs.readFileSync(path.join(lab,'index.html'),'utf8');
 const builder=fs.readFileSync(path.join(lab,'build-cdn-index.mjs'),'utf8');
 assert.match(index,/\.\/graph\/canvas-reference-background\.mjs/);
 assert.ok(index.indexOf('./graph/canvas-reference-background.mjs')<index.indexOf('./app.mjs'),'canvas adapter must load before app imports the legacy renderer');
 assert.match(builder,/graph\/canvas-reference-background\.mjs/);
});

test('legacy canvas graph can change colour system when the theme changes',()=>{
 assert.ok(fs.existsSync(canvasRework),'graph/canvas-reference-background.mjs must exist');
 const source=fs.readFileSync(canvasRework,'utf8');
 assert.match(source,/prototype\.setTheme/);
 assert.match(source,/PALETTE_LIGHT/);
 assert.match(source,/prototype\.nodeColor/);
 assert.match(source,/referenceBackgroundTheme/);
});
