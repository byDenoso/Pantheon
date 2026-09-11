import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('orbital layout uses radial bands and cluster bubbles',()=>{const p=read('src/graph-engine/projection.ts');const e=read('src/graph-engine/expansion.mjs');assert.match(p,/orbitPoint/);assert.match(p,/ringRadius/);assert.match(e,/CLUSTER_RADIUS/);assert.match(e,/collisionPush/)});
test('atlas limits expansion to one active domain and subgraph',()=>{const s=read('src/pages/GraphsV2Page.tsx');assert.match(s,/activeDomainId/);assert.match(s,/activeSubgraphKey/);assert.doesNotMatch(s,/Object\.entries\(expandedDomains\)/)});
test('focused detail projection keeps its hub centered before local orbit packing',()=>{const s=read('src/graph-engine/projection.ts');assert.match(s,/rootRaw/);assert.match(s,/x:50,y:50,z:0/);assert.match(s,/rest\.forEach/)});
