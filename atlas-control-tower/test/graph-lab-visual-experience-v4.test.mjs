import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const read=rel=>fs.readFileSync(path.join(lab,rel),'utf8');

const mustExist=rel=>{
 const file=path.join(lab,rel);
 assert.ok(fs.existsSync(file),`${rel} must exist`);
 return file;
};

test('visual system owns theme tokens and macro-domain accents',async()=>{
 const file=mustExist('graph/design/atlas-tokens.mjs');
 const mod=await import(pathToFileURL(file));
 assert.ok(mod.ATLAS_THEME.dark);
 assert.ok(mod.ATLAS_THEME.light);
 for(const domain of ['NEXO','SCIENCE','OLYMPUS','ENGINEERING'])assert.ok(mod.DOMAIN_THEMES[domain],`${domain} visual identity must exist`);
 assert.equal(mod.ATLAS_THEME.light.graph.labelText.toLowerCase(),'#ffffff');
 assert.match(mod.ATLAS_THEME.light.graph.labelBackground,/^#0[0-9a-f]{5}$/i);
});

test('background director reacts to domain, theme and graph density without changing graph data',async()=>{
 const file=mustExist('graph/background/background-director.mjs');
 const mod=await import(pathToFileURL(file));
 const science=mod.resolveBackground({theme:'dark',rendererId:'canvas-2d',activeDomain:'SCIENCE',graphDensity:20,filamentMode:'off',viewport:'DESKTOP_WIDE'});
 const olympus=mod.resolveBackground({theme:'dark',rendererId:'canvas-2d',activeDomain:'OLYMPUS',graphDensity:20,filamentMode:'off',viewport:'DESKTOP_WIDE'});
 const light=mod.resolveBackground({theme:'light',rendererId:'canvas-2d',activeDomain:'SCIENCE',graphDensity:20,filamentMode:'off',viewport:'DESKTOP_WIDE'});
 assert.notEqual(science.primary,olympus.primary);
 assert.equal(light.labelText.toLowerCase(),'#ffffff');
 assert.ok(light.contrastVeil>=science.contrastVeil,'light mode needs at least as much contrast protection');
 assert.ok(Object.isFrozen(science),'resolved background should be immutable presentation state');
});

test('experience presets separate public demo, work, review, filaments and mobile',async()=>{
 const presetsFile=mustExist('graph/experience/experience-presets.mjs');
 const resolverFile=mustExist('graph/experience/resolve-experience.mjs');
 const presets=await import(pathToFileURL(presetsFile));
 const resolver=await import(pathToFileURL(resolverFile));
 for(const id of ['OPERATIONAL','EXECUTIVE_DEMO','SCIENTIFIC_REVIEW','FILAMENT_DISCOVERY','PRESENTATION_3D','MOBILE_CLEAN'])assert.ok(presets.EXPERIENCE_PRESETS[id]);
 const desktop=resolver.resolveExperience({experienceId:'EXECUTIVE_DEMO',width:1440,theme:'dark'});
 const mobile=resolver.resolveExperience({experienceId:'EXECUTIVE_DEMO',width:390,theme:'dark'});
 assert.ok(desktop.layoutSpacing>mobile.layoutSpacing,'desktop must breathe more than mobile');
 assert.equal(mobile.rendererId,'canvas-2d','mobile public demo must fall back to a safe 2D renderer');
 assert.equal(mobile.filamentMode,'off');
});

test('renderer registry names current native and integrated engines honestly',async()=>{
 const file=mustExist('graph/renderers/renderer-registry.mjs');
 const mod=await import(pathToFileURL(file));
 for(const id of ['canvas-2d','pixi-2d','three-25d','three-3d','babylon-25d','babylon-3d'])assert.ok(mod.RENDERERS[id]);
 assert.equal(mod.RENDERERS['canvas-2d'].availability,'ready');
 assert.equal(mod.RENDERERS['three-25d'].availability,'ready');
 assert.equal(mod.RENDERERS['pixi-2d'].availability,'ready');
 assert.equal(mod.RENDERERS['pixi-2d'].implementation,'hybrid');
 assert.equal(mod.RENDERERS['babylon-3d'].availability,'ready');
 assert.equal(mod.RENDERERS['babylon-3d'].implementation,'hybrid');
});

test('experience controller adds demo, share, macro-domain navigation and dynamic background',()=>{
 const source=read('graph/experience/visual-experience-v4.mjs');
 assert.match(source,/installVisualExperienceV4/);
 assert.match(source,/EXECUTIVE_DEMO/);
 assert.match(source,/DEMO/);
 assert.match(source,/COPY VIEW|SHARE VIEW/);
 for(const id of ['lane:SCIENCE','lane:OLYMPUS','lane:ENGINEERING'])assert.match(source,new RegExp(id.replace(':','\\:')));
 assert.match(source,/resolveBackground/);
 assert.match(source,/data-atlas-domain/);
});

test('macro-domain expansion keeps one primary lane open at a time',async()=>{
 const projectionFile=mustExist('graph/projection.mjs');
 const projection=await import(pathToFileURL(projectionFile));
 assert.equal(typeof projection.expandHierarchyNode,'function');
 const graph={rootId:'system:NEXO',nodes:[
  {id:'system:NEXO',hierarchyLevel:'root'},
  {id:'lane:SCIENCE',parentId:'system:NEXO',hierarchyLevel:'lane'},
  {id:'lane:OLYMPUS',parentId:'system:NEXO',hierarchyLevel:'lane'},
  {id:'domain:SCIENCE:X',parentId:'lane:SCIENCE',hierarchyLevel:'domain'},
  {id:'olympus:group:LITE',parentId:'lane:OLYMPUS',hierarchyLevel:'group'}
 ],edges:[]};
 const switched=projection.expandHierarchyNode(graph,'lane:SCIENCE',new Set(['lane:OLYMPUS','olympus:group:LITE']));
 assert.deepEqual([...switched],['lane:SCIENCE']);
 const nested=projection.expandHierarchyNode(graph,'domain:SCIENCE:X',switched);
 assert.deepEqual(new Set(nested),new Set(['lane:SCIENCE','domain:SCIENCE:X']));
});

test('app wires visual experience into real hierarchy and keeps alternative filaments opt-in',()=>{
 const app=read('app.mjs');
 assert.match(app,/visual-experience-v4\.mjs/);
 assert.match(app,/installVisualExperienceV4/);
 assert.match(app,/expandHierarchyNode/);
 assert.match(app,/let showAlternativeFilaments=false/);
 assert.match(app,/hierarchyView\(graph,\{[^}]*showAlternativeFilaments/s);
 assert.match(app,/onOpenNode:\s*openNode/);
 assert.match(app,/onToggleFilaments/);
 const ssot=read('data/ssot.mjs');
 assert.match(ssot,/\['SCIENCE','OLYMPUS','ENGINEERING'\]\.map\(makeLane\)/);
});

test('visual experience stylesheet is premium but mobile-first safe',()=>{
 const css=read('graph/experience/visual-experience-v4.css');
 assert.match(css,/\.atlas-experience-bar/);
 assert.match(css,/data-demo-mode/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/--atlas-domain-rgb/);
 assert.doesNotMatch(css,/filter:\s*blur\([2-9][0-9]px\)/,'background effects must not use absurd full-screen blur costs');
});
