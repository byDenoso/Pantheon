import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MAP_CONFIG,SYSTEM_COLORS,MAP_THEMES} from '../ui/visual-config.mjs';

const graphSource = fs.readFileSync(new URL('../graph3d.mjs', import.meta.url), 'utf8');

test('principal systems have distinct semantic colors', () => {
 const ids=['system:NEXO','system:SCIENCE','system:LEARNING','system:AUTOMATION','system:ENGINEERING','system:OLYMPUS'];
 const values=ids.map(id=>SYSTEM_COLORS[id]);
 assert.ok(values.every(Boolean));
 assert.equal(new Set(values).size, ids.length);
});

test('Premium V2 graph keeps a strong primary-node hierarchy', () => {
 assert.ok(MAP_CONFIG.coreRadius >= 48, 'focus planet should be visually dominant');
 assert.ok(MAP_CONFIG.groupRadius >= 25, 'principal system planets should stay legible');
 assert.ok(MAP_CONFIG.domainRadius >= 17);
 assert.ok(MAP_CONFIG.nodeRadius >= 9, 'leaf nodes need usable hit/visual size');
 assert.ok(MAP_CONFIG.transitionMs >= 360 && MAP_CONFIG.transitionMs <= 520, 'node expansion should be fluid without becoming sluggish');
 assert.ok(MAP_CONFIG.fog <= .34, 'depth fog must not erase labels/nodes');
});

test('dark and light palettes keep labels high-contrast and do not restore click-template copy', () => {
 assert.equal(MAP_THEMES.dark.text.toLowerCase(), '#ffffff');
 assert.ok(['#0a1d31','#10243a','#13263a'].includes(MAP_THEMES.light.text.toLowerCase()));
 assert.doesNotMatch(graphSource, /CLIQUE PARA ABRIR/i);
});
