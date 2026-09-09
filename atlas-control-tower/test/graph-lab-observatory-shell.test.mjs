import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const theme=readFileSync(new URL('../graph-lab/obsidian-observatory.css',import.meta.url),'utf8');
const volume=readFileSync(new URL('../graph-lab/graph/volume-rendering.mjs',import.meta.url),'utf8');
const index=readFileSync(new URL('../graph-lab/index.html',import.meta.url),'utf8');

test('approved Obsidian Observatory changes the shell, not just token colours',()=>{
 assert.match(theme,/--topbar-height:\s*66px/);
 assert.match(theme,/\.lab-shell\s*\{[^}]*gap:\s*12px[^}]*padding:\s*12px/s);
 assert.match(theme,/\.stage\s*\{[^}]*border:\s*1px solid[^}]*border-radius:\s*22px/s);
 assert.match(theme,/\.cockpit\s*\{[^}]*border:\s*1px solid[^}]*border-radius:\s*19px/s);
 assert.match(theme,/\.lab-rail\s*\{[^}]*border:\s*1px solid[^}]*border-radius:\s*19px/s);
 assert.match(theme,/\.lab-brand b::before\s*\{[^}]*content:"NEXO"/s);
 assert.match(theme,/\.stage-dock\s*\{[^}]*padding:\s*8px/s);
});

test('shell matches the approved Atlas reference navigation and visual density',()=>{
 assert.match(index,/class="topbar-nav"/);
 for(const label of ['GRAPH LAB','DOMAINS','SSOT','ANALYTICS','DEPLOY','SETTINGS'])assert.match(index,new RegExp(`>${label}<`));
 assert.match(theme,/\.topbar-nav\s*\{/);
 assert.match(theme,/\.topbar-nav a\.is-active/);
 assert.match(theme,/\.stage::after\s*\{[^}]*radial-gradient[^}]*mix-blend-mode:\s*screen/s);
});

test('observatory background is a visible galaxy field while graph geometry remains external',()=>{
 assert.match(volume,/GraphLabRenderer\.prototype\.buildSpace=function/);
 assert.match(volume,/galaxyTexture/);
 assert.match(volume,/galaxy-disc/);
 assert.match(volume,/galaxyArmPoints/);
 assert.match(volume,/asteroidBelt/);
 assert.match(volume,/starShell\(1400,/);
 assert.match(volume,/starShell\(850,/);
 assert.match(volume,/CanvasTexture/);
 assert.match(volume,/AdditiveBlending/);
 assert.doesNotMatch(volume,/layoutNodes\s*=/);
});
