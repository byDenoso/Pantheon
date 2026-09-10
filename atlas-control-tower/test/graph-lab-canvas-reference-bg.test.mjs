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
 assert.doesNotMatch(source,/layoutNodes/,'background adapter must not recompute canonical graph layout');
 assert.doesNotMatch(source,/layoutSpacing/,'background adapter must not own viewport/layout spacing');
 const layoutSafety=fs.readFileSync(path.join(lab,'graph/renderers/layout-safety.mjs'),'utf8');
 assert.match(layoutSafety,/layoutSpacing/,'responsive spacing belongs to the renderer layout-safety boundary');
});

test('app loads the 2D background adapter before the renderer factory creates Canvas',()=>{
 const app=fs.readFileSync(path.join(lab,'app.mjs'),'utf8');
 const factory=fs.readFileSync(path.join(lab,'graph/renderers/renderer-factory.mjs'),'utf8');
 assert.match(app,/import ['"]\.\/graph\/canvas-reference-background\.mjs['"]/);
 assert.match(app,/renderer-factory\.mjs/);
 assert.ok(app.indexOf('./graph/canvas-reference-background.mjs')<app.indexOf('./graph/renderers/renderer-factory.mjs'),'background adapter must load before renderer factory binding');
 assert.match(factory,/legacy-renderer\.mjs/);
 assert.match(app,/createGraphRenderer/);
});

test('legacy canvas graph can change colour system when the theme changes',()=>{
 assert.ok(fs.existsSync(canvasRework),'graph/canvas-reference-background.mjs must exist');
 const source=fs.readFileSync(canvasRework,'utf8');
 const legacy=fs.readFileSync(path.join(lab,'graph/legacy-renderer.mjs'),'utf8');
 assert.match(legacy,/setTheme\(theme=/,'theme lifecycle belongs to the canonical Canvas renderer');
 assert.match(source,/PALETTE_LIGHT/);
 assert.match(source,/prototype\.nodeColor/);
 assert.match(source,/referenceBackgroundTheme/);
});
