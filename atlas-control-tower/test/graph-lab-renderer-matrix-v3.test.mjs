import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const read=rel=>fs.readFileSync(path.join(lab,rel),'utf8');

test('renderer matrix exposes 2D, 2.5D and 3D options across native engines',async()=>{
 const registry=await import(pathToFileURL(path.join(lab,'graph/renderers/renderer-registry.mjs')));
 for(const id of ['canvas-2d','canvas-25d','pixi-2d','three-25d','three-3d','babylon-25d','babylon-3d'])assert.ok(registry.RENDERERS[id]);
 assert.equal(registry.RENDERERS['pixi-2d'].dimension,'2D');
 assert.equal(registry.RENDERERS['three-25d'].dimension,'2.5D');
 assert.equal(registry.RENDERERS['babylon-3d'].dimension,'3D');
 assert.equal(registry.RENDERERS['babylon-3d'].mobileSafe,false);
});

test('viewport spacing separates desktop from mobile',async()=>{
 const mod=await import(pathToFileURL(path.join(lab,'graph/experience/resolve-experience.mjs')));
 const wide=mod.viewportProfile(1440),mobile=mod.viewportProfile(390);
 assert.ok(wide.layoutSpacing>mobile.layoutSpacing);
 assert.ok(wide.fitPadding>mobile.fitPadding);
 assert.ok(wide.maxLabels>mobile.maxLabels);
});

test('light contrast remains explicit in the Canvas visual adapter',()=>{
 const text=read('graph/canvas-reference-background.mjs');
 assert.match(text,/LIGHT_CONTRAST/);
 assert.match(text,/Solar Observatory Contrast/);
 assert.match(text,/#051c30/i);
 assert.match(text,/#ffffff/i);
 assert.match(text,/--graph-label-bg/);
});

test('renderer UI is populated from the canonical registry, not a V3 duplicate registry',()=>{
 const runtime=read('graph/renderers/renderer-runtime.mjs');
 const adapter=read('graph/canvas-reference-background.mjs');
 assert.match(runtime,/GRAPH_RENDERER_IDS/);
 assert.match(runtime,/replaceOptions/);
 assert.doesNotMatch(adapter,/RENDERER_REGISTRY/);
 assert.doesNotMatch(adapter,/upgradeRendererLabV3/);
});
