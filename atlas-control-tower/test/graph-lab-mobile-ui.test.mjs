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

test('mobile navigation proxies canonical graph controls instead of creating a second state machine',async()=>{
 const source=await read('graph/experience/mobile-ux-v6.mjs');
 const factory=await read('graph/renderers/renderer-factory.mjs');
 assert.match(source,/atlas-mobile-nav/);
 assert.match(source,/FILAMENTOS/);
 assert.match(source,/aria-pressed/);
 assert.match(source,/proxyDomain/);
 assert.match(source,/atlas-experience-bar/);
 assert.doesNotMatch(source,/mobileDomainState/);
 assert.match(factory,/installMobileUxV6/);
});

test('mobile cockpit has explicit sheet states and suspends expensive graph animation when expanded',async()=>{
 const source=await read('graph/experience/mobile-ux-v6.mjs');
 assert.match(source,/setCockpitSheetState/);
 assert.match(source,/dataset\.sheetState/);
 assert.match(source,/renderer\?\.stop\?\.\(\)/);
 assert.match(source,/renderer\?\.start\?\.\(\)/);
 assert.match(source,/aria-controls/);
});

test('mobile UX keeps accessibility and a lightweight renderer budget explicit',async()=>{
 const css=await read('graph/experience/mobile-ui-v6.css');
 const presets=await read('graph/experience/experience-presets.mjs');
 const visualPresets=await read('graph/renderers/visual-presets.mjs');
 assert.match(css,/:focus-visible/);
 assert.match(css,/prefers-reduced-motion/);
 const mobile=/MOBILE_CLEAN:freeze\(\{([\s\S]*?)\}\)/.exec(presets)?.[1]||'';
 assert.match(mobile,/rendererId:'canvas-2d'/);
 assert.match(mobile,/maxLabels:7/);
 assert.match(mobile,/maxVisibleNodes:42/);
 assert.match(mobile,/drift:0/);
 assert.match(visualPresets,/MOBILE_CLEAN:\{[^\n]*maxLabels:7,maxVisibleNodes:42[^\n]*autoOrbit:false/);
});

test('associative memory gets a compact auditable header without changing truth authority',async()=>{
 const cockpit=await read('cockpit.mjs');
 assert.match(cockpit,/cockpit-memory-strip/);
 assert.match(cockpit,/filamento mais forte/);
 assert.match(cockpit,/DERIVED_NOT_TRUTH/);
 assert.match(cockpit,/Próximo discriminante/);
});
