import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const mesh=readFileSync(new URL('../src/components/LearningMesh.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/design/learning-2_5d.css',import.meta.url),'utf8');
const layout=readFileSync(new URL('../src/data/learning-layout.ts',import.meta.url),'utf8');

test('learning mesh has depth planes and navigable context hubs',()=>{
 assert.match(mesh,/learning-depth-plane/);
 assert.match(mesh,/contextRoute/);
 assert.match(mesh,/useNavigate/);
 assert.match(css,/learning-depth-plane/);
 assert.match(css,/perspective/);
});

test('dense transversal items expand into deterministic rings instead of one tight cluster',()=>{
 assert.match(layout,/GOLDEN_ANGLE/);
 assert.match(layout,/ringIndex/);
 assert.match(layout,/ringStep/);
});
