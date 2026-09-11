import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('graph runtime uses PixiJS and GSAP',()=>{const source=read('src/graph-engine/runtime.ts');assert.match(source,/pixi\.js/);assert.match(source,/gsap/)});
test('Learning is an overlay, not primary navigation',()=>{assert.doesNotMatch(read('src/app/navigation.ts'),/label: 'Learning'/);assert.match(read('src/App.tsx'),/LearningRedirect/)});
test('projection contract discards undeclared and dangling edges',()=>{const source=read('src/graph-engine/projection.ts');assert.match(source,/declared===true/);assert.match(source,/ids\.has\(e\.source\)/);assert.match(source,/ids\.has\(e\.target\)/)});
test('v2 pages use one graph explorer',()=>{for(const page of ['GraphsV2Page.tsx','GraphDomainV2Page.tsx','GraphDetailV2Page.tsx'])assert.match(read('src/pages/'+page),/GraphExplorer/)});
test('legacy learning and universe deep links are retained',()=>{const source=read('src/App.tsx');assert.match(source,/LegacyUniverseRedirect/);assert.match(source,/LearningRedirect/);assert.match(source,/learning/)});
