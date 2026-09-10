import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const read=rel=>fs.readFileSync(path.join(lab,rel),'utf8');
const file=rel=>path.join(lab,rel);

test('renderer catalog exposes one graph-renderer role for every engine',async()=>{
 const registry=await import(pathToFileURL(file('graph/renderers/renderer-registry.mjs')));
 for(const id of ['canvas-2d','canvas-25d','pixi-2d','three-25d','three-3d','babylon-25d','babylon-3d']){
  assert.equal(registry.RENDERERS[id].role,'graph',`${id} must own graph rendering`);
  assert.equal(registry.RENDERERS[id].implementation,'native',`${id} must be native`);
 }
 assert.deepEqual([...registry.ENVIRONMENT_RENDERER_IDS],[]);
});

test('renderer runtime owns semantic navigation and keeps the legacy bootstrap hint explicit',async()=>{
 const mod=await import(pathToFileURL(file('graph/renderers/renderer-runtime.mjs')));
 const url=mod.rendererNavigationUrl('babylon-3d','https://example.test/?renderer=legacy-canvas&renderer-v4=canvas-2d&environment=pixi-2d');
 assert.equal(url.searchParams.get('renderer'),'three-canvas');
 assert.equal(url.searchParams.get('renderer-v4'),'babylon-3d');
 assert.equal(url.searchParams.has('environment'),false);
 const operational=mod.resolveRendererSelection({experienceRenderer:'canvas-2d',savedRenderer:'babylon-25d',manualOverride:false,mobile:false});
 assert.equal(operational.graphRendererId,'canvas-2d','stale saved renderer must not override an experience');
});

test('experience selection is authoritative unless the user explicitly chose a renderer',()=>{
 const source=read('graph/experience/visual-experience-v4.mjs');
 assert.match(source,/renderer-runtime\.mjs/);
 assert.match(source,/manualRenderer/);
 assert.match(source,/clearManualRendererOverride/);
 assert.match(source,/navigateToRenderer/);
 assert.doesNotMatch(source,/environmentRendererId/);
});

test('Pixi and Babylon own graph data instead of shadow environment layers',()=>{
 const pixi=read('graph/renderers/pixi-graph-renderer.mjs');
 const babylon=read('graph/renderers/babylon-graph-renderer.mjs');
 for(const source of [pixi,babylon]){
  assert.match(source,/setGraph/);
  assert.match(source,/source\.nodes/);
  assert.match(source,/source\.edges/);
  assert.match(source,/pickNode/);
  assert.doesNotMatch(source,/atlas-engine-layer/);
 }
 assert.match(pixi,/webgpu/i);assert.match(pixi,/webgl/i);
});

test('legacy layout safety applies spacing to targets once and fits target geometry',()=>{
 const source=read('graph/renderers/layout-safety.mjs');
 assert.match(source,/targetPositions/);
 assert.match(source,/layoutSpacing/);
 assert.match(source,/fitPadding/);
 assert.doesNotMatch(source,/transition\.start\s*=\s*scaleMap\(this\.transition\.start/);
 const experience=read('graph/experience/visual-experience-v4.mjs');
 assert.match(experience,/layout-safety\.mjs/);
});

test('search and nested expansion keep only one primary macro lane open',async()=>{
 const projection=await import(pathToFileURL(file('graph/projection.mjs'))+'?runtime-coherence-v7');
 const graph={rootId:'system:NEXO',nodes:[
  {id:'system:NEXO',hierarchyLevel:'root',label:'NEXO'},
  {id:'lane:SCIENCE',parentId:'system:NEXO',hierarchyLevel:'lane',label:'Ciência'},
  {id:'lane:OLYMPUS',parentId:'system:NEXO',hierarchyLevel:'lane',label:'Olympus'},
  {id:'domain:SCIENCE:EXPANSION',parentId:'lane:SCIENCE',hierarchyLevel:'domain',label:'Expansion'},
  {id:'program:SCIENCE:H0',parentId:'domain:SCIENCE:EXPANSION',hierarchyLevel:'program',label:'H0'},
  {id:'olympus:group:LITE',parentId:'lane:OLYMPUS',hierarchyLevel:'group',label:'Lite'}
 ],edges:[]};
 const initial=new Set(['lane:OLYMPUS','olympus:group:LITE']);
 const expanded=projection.expandHierarchyNode(graph,'domain:SCIENCE:EXPANSION',initial);
 assert.deepEqual(new Set(expanded),new Set(['lane:SCIENCE','domain:SCIENCE:EXPANSION']));
 const searched=projection.expandForSearch(graph,'H0',initial);
 assert.deepEqual(new Set(searched.expandedIds),new Set(['lane:SCIENCE','domain:SCIENCE:EXPANSION']));
});
