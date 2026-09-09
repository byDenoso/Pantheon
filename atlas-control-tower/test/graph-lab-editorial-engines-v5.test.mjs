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

test('renderer registry exposes real integrated engines instead of scaffolds',()=>{
 const source=read('graph/renderers/renderer-registry.mjs');
 for(const id of ['pixi-2d','babylon-25d','babylon-3d'])assert.match(source,new RegExp(`'${id}'`));
 assert.doesNotMatch(source,/pixi-2d[^\n]+availability:'scaffold'/);
 assert.doesNotMatch(source,/babylon-25d[^\n]+availability:'scaffold'/);
 assert.doesNotMatch(source,/babylon-3d[^\n]+availability:'scaffold'/);
 assert.match(source,/implementation:'hybrid'/);
});

test('engine bridge loads exact library versions and protects mobile',()=>{
 const source=read('graph/renderers/engine-bridge-auto.mjs');
 assert.match(source,/pixi\.js@8\.20\.1/);
 assert.match(source,/@babylonjs\/core@9\.25\.0/);
 assert.match(source,/pixi-2d/);
 assert.match(source,/babylon-25d/);
 assert.match(source,/babylon-3d/);
 assert.match(source,/max-width:760px/);
 assert.match(source,/destroyEngine/);
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

test('visual bootstrap installs editorial design and engine bridge in production',()=>{
 const source=read('graph/experience/editorial-observatory-v5.mjs');
 assert.match(source,/data-atlas-design/);
 assert.match(source,/Editorial Observatory/);
 assert.match(source,/engine-bridge-auto\.mjs/);
 assert.match(source,/MutationObserver/);
 const builder=read('build-cdn-index.mjs');
 assert.match(builder,/editorial-observatory-v5\.mjs/);
 assert.match(builder,/Visual Experience v5/);
});
