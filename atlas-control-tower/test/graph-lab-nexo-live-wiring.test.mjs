import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const lab=path.resolve(here,'../graph-lab');

test('Graph Lab renders graph.live on every SSOT graph swap and lets mini-claims focus their NEXO nodes',()=>{
 const app=fs.readFileSync(path.join(lab,'app.mjs'),'utf8');
 assert.match(app,/function renderNexoLive/);
 assert.match(app,/renderNexoLive\(graph\.live/);
 assert.match(app,/data-node-id/);
 assert.match(app,/nexo-mini-claims/);
 assert.match(app,/nexo-engineering-effects/);
});

test('NEXO LIVE styling stays an overlay and has a mobile contract',()=>{
 const html=fs.readFileSync(path.join(lab,'index.html'),'utf8');
 assert.match(html,/nexo-live\.css/);
 const cssPath=path.join(lab,'nexo-live.css');
 assert.ok(fs.existsSync(cssPath),'nexo-live.css missing');
 const css=fs.readFileSync(cssPath,'utf8');
 assert.match(css,/\.nexo-live\s*\{/);
 assert.match(css,/position:\s*absolute/);
 assert.match(css,/@media\s*\(max-width:\s*760px\)/);
});
