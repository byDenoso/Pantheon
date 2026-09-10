import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../graph-lab');
const read=relative=>readFile(path.join(root,relative),'utf8');

test('mobile shell reserves safe-area layout bands and 44px primary targets',async()=>{
 const css=await read('graph/experience/mobile-ui-v6.css');
 assert.match(css,/100dvh/);
 assert.match(css,/env\(safe-area-inset-bottom,\s*0px\)/);
 assert.match(css,/--atlas-mobile-nav-h/);
 assert.match(css,/\.atlas-mobile-nav/);
 assert.match(css,/min-height:\s*44px/);
 assert.match(css,/data-sheet-state=['"]compact['"]/);
 assert.match(css,/data-sheet-state=['"]expanded['"]/);
});

test('mobile navigation exposes canonical lanes plus Filamentos without a second state machine',async()=>{
 const source=await read('graph/experience/visual-experience-v4.mjs');
 assert.match(source,/atlas-mobile-nav/);
 assert.match(source,/FILAMENTOS/);
 assert.match(source,/aria-pressed/);
 assert.match(source,/onToggleFilaments/);
 assert.doesNotMatch(source,/mobileDomainState/);
});

test('mobile cockpit has explicit sheet states and can suspend expensive graph animation',async()=>{
 const app=await read('app.mjs');
 assert.match(app,/setCockpitSheetState/);
 assert.match(app,/dataset\.sheetState/);
 assert.match(app,/renderer\.stop\(\)/);
 assert.match(app,/renderer\.start\(\)/);
});

test('mobile UX keeps accessibility and a lightweight renderer budget explicit',async()=>{
 const css=await read('graph/experience/mobile-ui-v6.css');
 const presets=await read('graph/experience/experience-presets.mjs');
 assert.match(css,/:focus-visible/);
 assert.match(css,/prefers-reduced-motion/);
 const mobile=/MOBILE_CLEAN:freeze\(\{([\s\S]*?)\}\)/.exec(presets)?.[1]||'';
 assert.match(mobile,/rendererId:'canvas-2d'/);
 assert.match(mobile,/maxLabels:\d+/);
 assert.match(mobile,/maxVisibleNodes:\d+/);
 assert.match(mobile,/drift:0/);
});
