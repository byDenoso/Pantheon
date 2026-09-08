import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../nextgen/styles.css', import.meta.url), 'utf8');
const engine = fs.readFileSync(new URL('../nextgen/graph/engine.mjs', import.meta.url), 'utf8');

test('NextGen layout replaces the reference-one shell with a semantic observatory', () => {
 for(const pattern of [/NEXO ATLAS/,/SCIENTIFIC KNOWLEDGE OBSERVATORY/,/MACRO/,/SCIENTIFIC/,/PROVENANCE/,/Universo científico/,/id="cosmos"/]) assert.match(index,pattern);
 assert.doesNotMatch(index,/class="reference-one"|reference-hero-stats|reference-graph-zone|reference-explore-card/);
});

test('NextGen keeps strong status hierarchy and provenance outside the graph labels', () => {
 assert.match(index,/id="health"/);
 assert.match(index,/id="active-count"/);
 assert.match(index,/id="provenance-health"/);
 assert.match(index,/id="inspector"/);
 assert.match(engine,/TYPE_COLOR/);
 assert.match(engine,/STATUS_DANGER/);
});

test('NextGen cosmic field reflows before mobile compression and preserves reduced motion', () => {
 assert.match(css,/radial-gradient/);
 assert.match(css,/@media\(max-width:980px\)/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/@media\(max-width:430px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(css,/#00e5ff|#00ffff/i);
});
