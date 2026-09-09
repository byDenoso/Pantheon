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

test('app imports the 2D background adapter before choosing the legacy renderer',()=>{
 const app=fs.readFileSync(path.join(lab,'app.mjs'),'utf8');
 assert.match(app,/import ['"]\.\/graph\/canvas-reference-background\.mjs['"]/);
 assert.ok(app.indexOf('./graph/canvas-reference-background.mjs')<app.indexOf('./graph/legacy-renderer.mjs'),'adapter must load before app imports the legacy renderer binding');
});

test('approved 2D canvas becomes the default renderer while three-canvas remains opt-in',()=>{
 const app=fs.readFileSync(path.join(lab,'app.mjs'),'utf8');
 assert.match(app,/params\.get\('renderer'\)==='three-canvas'\?'three-canvas':'legacy-canvas'/);
 assert.match(app,/const Renderer=rendererMode==='legacy-canvas'\?LegacyCanvasRenderer:ThreeCanvasRenderer/);
});

test('legacy canvas graph can change colour system when the theme changes',()=>{
 assert.ok(fs.existsSync(canvasRework),'graph/canvas-reference-background.mjs must exist');
 const source=fs.readFileSync(canvasRework,'utf8');
 assert.match(source,/prototype\.setTheme/);
 assert.match(source,/PALETTE_LIGHT/);
 assert.match(source,/prototype\.nodeColor/);
 assert.match(source,/referenceBackgroundTheme/);
});
