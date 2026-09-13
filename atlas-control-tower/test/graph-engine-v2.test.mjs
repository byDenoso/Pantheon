import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('graph runtime uses PixiJS and GSAP',()=>{const source=read('src/graph-engine/runtime.ts');assert.match(source,/pixi\.js/);assert.match(source,/gsap/)});
test('Learning remains a graph context and is not a primary product area',()=>{
 const app=read('src/App.tsx');const route=read('src/atlas-route.ts');
 assert.match(app,/system:LEARNING/);assert.match(app,/GRAFOS.*OBSERVATÓRIO.*LABORATÓRIO.*RESUMO DO UNIVERSO/s);
 assert.doesNotMatch(route,/Learning/);assert.doesNotMatch(app,/label: ['"]Learning['"]/);
});
test('projection contract discards undeclared and dangling edges',()=>{const source=read('src/graph-engine/projection.ts');assert.match(source,/declared===true/);assert.match(source,/ids\.has\(e\.source\)/);assert.match(source,/ids\.has\(e\.target\)/)});
test('v2 pages use one renderer gateway with Canvas primary and WebGL opt-in',()=>{for(const page of ['GraphsV2Page.tsx','GraphDomainV2Page.tsx','GraphDetailV2Page.tsx'])assert.match(read('src/pages/'+page),/GraphRenderer/);const gateway=read('src/graph-engine/GraphRenderer.tsx');assert.match(gateway,/GraphScene3D/);assert.match(gateway,/GraphExplorer/);assert.match(gateway,/renderer'\)===['"]webgl['"]/);assert.match(gateway,/if\(!webgl\).*GraphExplorer/s)});
test('contextual deep links are retained by the Atlas route reader',()=>{
 const source=read('src/atlas-route.ts');
 assert.match(source,/readAtlasRoute/);assert.match(source,/routeFor/);assert.match(source,/graphs\/science/);
 assert.match(source,/observatory|lab|universe/);
});