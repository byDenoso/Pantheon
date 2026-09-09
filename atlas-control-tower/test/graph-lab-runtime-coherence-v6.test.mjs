import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const read=rel=>fs.readFileSync(path.join(lab,rel),'utf8');
const file=rel=>path.join(lab,rel);

test('renderer catalog separates graph renderers from optional environment engines',async()=>{
 const registry=await import(pathToFileURL(file('graph/renderers/renderer-registry.mjs')));
 assert.ok(registry.RENDERERS['canvas-25d'],'Canvas 2.5D must have one canonical registry entry');
 for(const id of ['canvas-2d','canvas-25d','three-25d','three-3d']){
  assert.equal(registry.RENDERERS[id].role,'graph',`${id} must be a graph renderer`);
 }
 for(const id of ['pixi-2d','babylon-25d','babylon-3d']){
  assert.equal(registry.RENDERERS[id].role,'environment',`${id} is currently an environment engine, not a graph renderer`);
 }
});

test('renderer runtime owns semantic renderer navigation and keeps legacy base renderer explicit',async()=>{
 assert.ok(fs.existsSync(file('graph/renderers/renderer-runtime.mjs')),'renderer runtime must exist');
 const mod=await import(pathToFileURL(file('graph/renderers/renderer-runtime.mjs')));
 assert.equal(typeof mod.rendererNavigationUrl,'function');
 assert.equal(typeof mod.resolveRendererSelection,'function');
 const url=mod.rendererNavigationUrl('three-3d','https://example.test/?renderer=legacy-canvas&renderer-v4=canvas-2d');
 assert.equal(url.searchParams.get('renderer'),'three-canvas');
 assert.equal(url.searchParams.get('renderer-v4'),'three-3d');
 const operational=mod.resolveRendererSelection({experienceRenderer:'canvas-2d',savedRenderer:'babylon-25d',manualOverride:false,mobile:false});
 assert.equal(operational.graphRendererId,'canvas-2d','stale saved renderer must not override an experience');
});

test('experience selection is authoritative unless the user explicitly chose a manual renderer',()=>{
 const source=read('graph/experience/visual-experience-v4.mjs');
 assert.match(source,/renderer-runtime\.mjs/);
 assert.match(source,/manualRenderer/);
 assert.doesNotMatch(source,/query\.get\('renderer-v4'\)\|\|saved\.rendererId\|\|state\.rendererId/,'saved renderer must not silently pin every experience');
 assert.match(source,/clearManualRendererOverride|manualOverride\s*=\s*false/);
});

test('optional GPU environments do not remount on every domain change and Pixi can fall back to WebGL',()=>{
 const source=read('graph/renderers/engine-bridge-auto.mjs');
 assert.match(source,/scheduleActivation/);
 assert.match(source,/updateDomain/);
 assert.match(source,/webgpu/i);
 assert.match(source,/webgl/i);
 assert.doesNotMatch(source,/records\.some\([^)]*data-atlas-domain[^)]*\)\)activateRequestedEngine\(/s,'domain changes must update an active engine rather than destroy/remount it');
});

test('legacy layout safety applies spacing to targets once and fits the target geometry',()=>{
 assert.ok(fs.existsSync(file('graph/renderers/layout-safety.mjs')),'layout safety module must exist');
 const source=read('graph/renderers/layout-safety.mjs');
 assert.match(source,/targetPositions/);
 assert.match(source,/layoutSpacing/);
 assert.match(source,/fitPadding/);
 assert.doesNotMatch(source,/transition\.start\s*=\s*scaleMap\(this\.transition\.start/,'transition starts must never be rescaled on each refresh');
 const experience=read('graph/experience/visual-experience-v4.mjs');
 assert.match(experience,/layout-safety\.mjs/);
});

test('search and nested expansion keep only one primary macro lane open',async()=>{
 const projection=await import(pathToFileURL(file('graph/projection.mjs'))+'?runtime-coherence-v6');
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
