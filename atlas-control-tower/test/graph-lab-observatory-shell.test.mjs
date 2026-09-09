import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const theme=readFileSync(new URL('../graph-lab/obsidian-observatory.css',import.meta.url),'utf8');
const volume=readFileSync(new URL('../graph-lab/graph/volume-rendering.mjs',import.meta.url),'utf8');

test('approved Obsidian Observatory changes the shell, not just token colours',()=>{
 assert.match(theme,/--topbar-height:\s*68px/);
 assert.match(theme,/\.lab-shell\s*\{[^}]*gap:\s*12px[^}]*padding:\s*12px/s);
 assert.match(theme,/\.stage\s*\{[^}]*border:\s*1px solid[^}]*border-radius:\s*22px/s);
 assert.match(theme,/\.cockpit\s*\{[^}]*border:\s*1px solid[^}]*border-radius:\s*18px/s);
 assert.match(theme,/\.lab-rail\s*\{[^}]*border:\s*1px solid[^}]*border-radius:\s*18px/s);
 assert.match(theme,/\.lab-brand b\s*\{[^}]*font-size:\s*15px/s);
 assert.match(theme,/\.stage-dock\s*\{[^}]*padding:\s*7px/s);
});

test('observatory background is visibly galactic while graph geometry remains external',()=>{
 assert.match(volume,/GraphLabRenderer\.prototype\.buildSpace=function/);
 assert.match(volume,/starShell\(900,/);
 assert.match(volume,/starShell\(520,/);
 assert.match(volume,/AdditiveBlending/);
 assert.doesNotMatch(volume,/layoutNodes\s*=/);
});
