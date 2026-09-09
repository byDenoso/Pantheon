import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');
const rework=path.join(lab,'graph/canvas-reference-background.mjs');
const index=path.join(lab,'index.html');

const source=()=>fs.readFileSync(rework,'utf8');
const html=()=>fs.readFileSync(index,'utf8');

test('renderer matrix exposes 2D, 2.5D and 3D renderer options across engines',()=>{
 const text=source();
 assert.match(text,/RENDERER_REGISTRY/);
 assert.match(text,/canvas-2d/);
 assert.match(text,/canvas-25d/);
 assert.match(text,/three-25d/);
 assert.match(text,/three-3d/);
 assert.match(text,/babylon-25d/);
 assert.match(text,/babylon-3d/);
 assert.match(text,/mobileSafe:\s*false/);
});

test('viewport spacing separates desktop from mobile instead of saving one global distance',()=>{
 const text=source();
 assert.match(text,/VIEWPORT_PRESETS/);
 assert.match(text,/DESKTOP_WIDE/);
 assert.match(text,/MOBILE/);
 assert.match(text,/layoutSpacing/);
 assert.match(text,/fitPadding/);
 assert.match(text,/desktop/);
 assert.match(text,/mobile/);
 assert.match(text,/nexo-atlas-renderer-lab-v3/);
});

test('light contrast is legible for graph labels and not the washed out pastel preset',()=>{
 const text=source();
 assert.match(text,/LIGHT_CONTRAST/);
 assert.match(text,/Solar Observatory Contrast/);
 assert.match(text,/#051c30/i);
 assert.match(text,/#ffffff/i);
 assert.match(text,/setProperty\('--graph-label-bg'/);
});

test('renderer lab UI is upgraded from one flat preset select to engine and viewport controls',()=>{
 const text=source();
 const page=html();
 assert.match(text,/upgradeRendererLabV3/);
 assert.match(text,/Dimension Mode/);
 assert.match(text,/Viewport Profile/);
 assert.match(text,/Save desktop/i);
 assert.match(text,/Save mobile/i);
 assert.match(page,/id='renderer'/);
});
