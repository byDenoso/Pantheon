import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/atlas/site-living.css',import.meta.url),'utf8');
test('map SVG sizing is scoped to visualization, never navigation icons',()=>{assert.doesNotMatch(css,/\.nexo-map-stage\s+svg\s*\{/);assert.match(css,/svg\.nexo-arrow-icon\{width:18px!important;height:18px!important/);});
test('mobile map cannot derive width from fixed minimum height and aspect ratio',()=>{assert.match(css,/\.nexo-map-v2 \.nexo-constellation\{aspect-ratio:auto;width:100%;max-width:100%;height:330px;min-height:0;min-width:0/);});
