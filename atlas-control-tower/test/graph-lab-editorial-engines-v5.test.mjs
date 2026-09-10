import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const lab=path.join(root,'graph-lab');
const read=rel=>fs.readFileSync(path.join(lab,rel),'utf8');

test('project pins real PixiJS and Babylon packages',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.equal(pkg.dependencies['pixi.js'],'8.20.1');
 assert.equal(pkg.dependencies['@babylonjs/core'],'9.25.0');
});

test('renderer registry exposes Pixi and Babylon as native graph renderers',()=>{
 const source=read('graph/renderers/renderer-registry.mjs');
 for(const id of ['pixi-2d','babylon-25d','babylon-3d'])assert.match(source,new RegExp(`'${id}'`));
 assert.doesNotMatch(source,/availability:'scaffold'/);
 assert.doesNotMatch(source,/implementation:'hybrid'/);
 assert.doesNotMatch(source,/role:'environment'/);
 assert.match(source,/implementation:'native'/);
});

test('native Pixi and Babylon renderer modules pin exact library versions',()=>{
 const pixi=read('graph/renderers/pixi-graph-renderer.mjs');
 const babylon=read('graph/renderers/babylon-graph-renderer.mjs');
 assert.match(pixi,/pixi\.js@8\.20\.1/);
 assert.match(pixi,/preference:'webgpu'/);
 assert.match(pixi,/preference:'webgl'/);
 assert.match(babylon,/@babylonjs\/core@9\.25\.0/);
 assert.match(babylon,/MeshBuilder\.CreateSphere/);
 assert.match(babylon,/MeshBuilder\.CreateLines/);
});

test('editorial observatory removes generic AI-dashboard chrome',()=>{
 const css=read('graph/experience/editorial-observatory-v5.css');
 assert.match(css,/data-atlas-design=['"]editorial['"]/);
 assert.match(css,/--atlas-type-entity/);
 assert.match(css,/border-radius:\s*(?:0|2px|4px|6px|8px)/);
 assert.match(css,/\.topbar-nav/);
 assert.match(css,/\.cockpit/);
 assert.match(css,/\.stage/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.doesNotMatch(css,/letter-spacing:\s*\.1[2-9]em/g);
});

test('visual bootstrap installs editorial design without a shadow renderer bridge',()=>{
 const source=read('graph/experience/editorial-observatory-v5.mjs');
 assert.match(source,/data-atlas-design/);
 assert.match(source,/Editorial Observatory/);
 assert.doesNotMatch(source,/engine-bridge-auto\.mjs/);
 const builder=read('build-cdn-index.mjs');
 assert.match(builder,/editorial-observatory-v5\.mjs/);
 assert.match(builder,/Visual Experience v5/);
});
