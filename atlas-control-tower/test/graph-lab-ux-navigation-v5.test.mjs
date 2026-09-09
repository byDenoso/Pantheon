import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const read=rel=>fs.readFileSync(path.join(lab,rel),'utf8');
const mustExist=rel=>{const file=path.join(lab,rel);assert.ok(fs.existsSync(file),`${rel} must exist`);return file};

test('selected graph nodes expose an explicit open/focus action bar',async()=>{
 const file=mustExist('graph/experience/node-action-bar.mjs');
 const mod=await import(pathToFileURL(file));
 assert.equal(typeof mod.createNodeActionBar,'function');
 assert.equal(typeof mod.actionLabelForNode,'function');
 const source=read('graph/experience/node-action-bar.mjs');
 assert.match(source,/ABRIR/);
 assert.match(source,/FOCAR/);
 assert.match(source,/data-label-reserved/);
 assert.match(source,/onOpen/);
});

test('experience studio is experience-first and hides technical controls behind Advanced',()=>{
 const source=read('graph/experience/visual-experience-v4.mjs');
 assert.match(source,/node-action-bar\.mjs/);
 assert.match(source,/atlas-advanced-controls/);
 assert.match(source,/ADVANCED/);
 assert.match(source,/data-atlas-advanced-host/);
 assert.doesNotMatch(source,/Renderer roadmap/,'renderer roadmap must not duplicate the renderer selector in the primary studio');
});

test('status is an editorial strip and overlays reserve graph label space',()=>{
 const css=read('graph/experience/visual-experience-v4.css');
 const source=read('graph/experience/visual-experience-v4.mjs');
 assert.match(css,/\.atlas-status-summary\{[^}]*display:flex/s);
 assert.doesNotMatch(css,/\.atlas-status-summary span\{[^}]*background:/s,'status metrics should not be three floating cards');
 assert.match(css,/\.atlas-node-actions/);
 assert.match(source,/data-label-reserved/);
});

test('mobile turns node actions into a safe bottom sheet and keeps studio compact',()=>{
 const css=read('graph/experience/visual-experience-v4.css');
 assert.match(css,/@media\(max-width:760px\)[\s\S]*\.atlas-node-actions\{[^}]*position:absolute[^}]*bottom:/);
 assert.match(css,/@media\(max-width:760px\)[\s\S]*\.atlas-experience-grid/);
 assert.match(css,/@media\(max-width:760px\)[\s\S]*\.atlas-experience-select-row/);
});

test('canonical renderer remains full-stage after UX overlays',()=>{
 const css=read('graph/experience/visual-experience-v4.css');
 assert.match(css,/\.graph-renderer-root\{[^}]*position:absolute[^}]*inset:0/s);
 assert.doesNotMatch(css,/\.graph-renderer-root,#graph-lab-canvas\{[^}]*position:relative/s);
});
