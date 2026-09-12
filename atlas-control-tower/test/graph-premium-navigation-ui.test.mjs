import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('3D graph exposes a compact HUD and keeps the inspector demand-driven', () => {
  const source = read('src/graph-engine/GraphScene3D.tsx');
  assert.match(source, /graph-3d-focus-card/);
  assert.match(source, /graph-3d-nav-hint/);
  assert.match(source, /selected\|\|selectedEdge\?/);
  assert.doesNotMatch(source, /<h3>Mapa orbital<\/h3>/);
});

test('premium graph stage follows the dark orbital reference grammar', () => {
  const css = read('src/design/graph-3d.css');
  assert.match(css, /graph-3d-ambient-grid/);
  assert.match(css, /radial-gradient\(circle at 50% 48%/);
  assert.match(css, /height:100%/);
  assert.match(css, /graph-3d-nav-hint/);
  assert.match(css, /graph-3d-inspector\.is-open/);
});

test('R3F labels can anchor on either side of the node instead of drifting as loose cards', () => {
  const source = read('src/scene/LabelOverlay.tsx');
  const css = read('src/styles/react-atlas.css');
  assert.match(source, /side='left'/);
  assert.match(source, /translateX\(-100%\)/);
  assert.match(css, /atlas-label\.left:before/);
  assert.match(css, /atlas-label\.right:before/);
});

test('orbital layout uses a large readable outer ring around the focus', () => {
  const source = read('src/scene/types.ts');
  assert.match(source, /directRadius/);
  assert.match(source, /ringRadius/);
  assert.match(source, /compareVisualRank/);
});
