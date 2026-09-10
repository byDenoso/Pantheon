import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const read=rel=>fs.readFileSync(path.join(lab,rel),'utf8');
const exists=rel=>fs.existsSync(path.join(lab,rel));

test('renderer registry exposes every production engine as a native graph renderer',()=>{
 const source=read('graph/renderers/renderer-registry.mjs');
 for(const id of ['canvas-2d','canvas-25d','pixi-2d','three-25d','three-3d','babylon-25d','babylon-3d']){
  assert.match(source,new RegExp(`'${id}'`));
 }
 assert.doesNotMatch(source,/role:'environment'/);
 assert.doesNotMatch(source,/implementation:'hybrid'/);
 assert.match(source,/GRAPH_RENDERER_IDS/);
});

test('renderer factory is the only app-level engine constructor',()=>{
 assert.ok(exists('graph/renderers/renderer-factory.mjs'));
 const factory=read('graph/renderers/renderer-factory.mjs');
 assert.match(factory,/createGraphRenderer/);
 assert.match(factory,/PixiGraphRenderer/);
 assert.match(factory,/BabylonGraphRenderer/);
 const app=read('app.mjs');
 assert.match(app,/renderer-factory\.mjs/);
 assert.match(app,/createGraphRenderer/);
 assert.doesNotMatch(app,/GraphLabRenderer as ThreeCanvasRenderer/);
 assert.doesNotMatch(app,/GraphLabRenderer as LegacyCanvasRenderer/);
});

test('Pixi renderer owns graph geometry labels picking and lifecycle',()=>{
 assert.ok(exists('graph/renderers/pixi-graph-renderer.mjs'));
 const source=read('graph/renderers/pixi-graph-renderer.mjs');
 for(const token of ['layoutNodes','placeLabels','pickNode','setGraph','setSelected','setTheme','setOptions','setPreset','fit','focusNode','destroy'])assert.match(source,new RegExp(token));
 assert.match(source,/pixi\.js@8\.20\.1/);
 assert.doesNotMatch(source,/atlas-engine-layer/);
});

test('Babylon renderer owns graph meshes labels picking camera and lifecycle',()=>{
 assert.ok(exists('graph/renderers/babylon-graph-renderer.mjs'));
 const source=read('graph/renderers/babylon-graph-renderer.mjs');
 for(const token of ['layoutNodes','placeLabels','pickNode','setGraph','setSelected','setTheme','setOptions','setPreset','fit','focusNode','destroy'])assert.match(source,new RegExp(token));
 assert.match(source,/@babylonjs\/core@9\.25\.0/);
 assert.match(source,/MeshBuilder\.CreateSphere/);
 assert.match(source,/MeshBuilder\.CreateLines/);
 assert.doesNotMatch(source,/atlas-engine-layer/);
});

test('legacy environment bridge and V3 renderer lab no longer own production state',()=>{
 const editorial=read('graph/experience/editorial-observatory-v5.mjs');
 assert.doesNotMatch(editorial,/engine-bridge-auto\.mjs/);
 const runtime=read('graph/renderers/renderer-runtime.mjs');
 assert.doesNotMatch(runtime,/ENVIRONMENT_RENDERER_IDS/);
 assert.doesNotMatch(runtime,/atlas-environment-engine/);
 const canvas=read('graph/canvas-reference-background.mjs');
 assert.doesNotMatch(canvas,/RENDERER_REGISTRY/);
 assert.doesNotMatch(canvas,/upgradeRendererLabV3/);
 assert.doesNotMatch(canvas,/nexo-atlas-renderer-lab-v3/);
});

test('renderer runtime serializes one renderer authority without environment shadow state',()=>{
 const source=read('graph/renderers/renderer-runtime.mjs');
 assert.match(source,/rendererNavigationUrl/);
 assert.match(source,/renderer-v4/);
 assert.match(source,/manualOverride/);
 assert.doesNotMatch(source,/environmentRendererId/);
 assert.doesNotMatch(source,/searchParams\.set\('environment'/);
});

test('mobile accepts Pixi manual override but blocks heavy Three and Babylon renderers',async()=>{
 const mod=await import(pathToFileURL(path.join(lab,'graph/experience/resolve-experience.mjs')));
 const pixi=mod.resolveExperience({experienceId:'OPERATIONAL',width:390,rendererOverride:'pixi-2d'});
 assert.equal(pixi.rendererId,'pixi-2d');
 const babylon=mod.resolveExperience({experienceId:'OPERATIONAL',width:390,rendererOverride:'babylon-3d'});
 assert.equal(babylon.rendererId,'canvas-2d');
});

test('legacy Canvas implements the full renderer lifecycle without relying on hidden environment patches',()=>{
 const source=read('graph/legacy-renderer.mjs');
 for(const token of ['setTheme','destroy'])assert.match(source,new RegExp(`\\b${token}\\s*\\(`),`legacy Canvas must implement ${token}`);
 assert.match(source,/resizeObserver/);
 assert.match(source,/eventController/,'Canvas lifecycle must be able to remove DOM listeners on destroy');
 const factory=read('graph/renderers/renderer-factory.mjs');
 assert.match(factory,/volume-rendering\.mjs/,'factory must deterministically install Three visual extensions before contract validation');
});

test('retired shadow renderer files are physically absent from production source',()=>{
 assert.equal(exists('graph/renderers/engine-bridge-auto.mjs'),false,'environment bridge must be deleted, not merely unimported');
 assert.equal(exists('graph/renderer-lab-preferences.mjs'),false,'V1/V3 renderer lab preference shim must be deleted');
});


test('native Pixi and Babylon renderers own removable DOM listener lifecycles',()=>{
 for(const rel of ['graph/renderers/pixi-graph-renderer.mjs','graph/renderers/babylon-graph-renderer.mjs']){
  const source=read(rel);
  assert.match(source,/eventController/);
  assert.match(source,/signal:\s*this\.eventController\.signal/);
  assert.match(source,/eventController\?\.abort\(\)/);
 }
});
