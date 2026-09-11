import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../src/pages/UniversePage.tsx',import.meta.url),'utf8');
const navigator=readFileSync(new URL('../src/components/DomainNavigator/DomainNavigator.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/design/domain-navigator.css',import.meta.url),'utf8');

test('universe page promotes domain navigator above the entity list',()=>{
  assert.equal(page.includes('DomainNavigator'),true);
  assert.equal(page.includes('buildDomainNavigatorModel'),true);
  assert.equal(page.includes('model.subdomains.length'),true);
});

test('domain navigator is keyboard navigable and supports reusable drill-down paths',()=>{
  assert.equal(navigator.includes('role="button"'),true);
  assert.equal(navigator.includes('onKeyDown'),true);
  assert.equal(navigator.includes('basePath'),true);
  assert.equal(navigator.includes('/universes/${universeId}'),true);
  assert.equal(navigator.includes('navigate(`${root}/${domain.id}`)'),true);
  assert.equal(navigator.includes('Escape'),true);
});

test('2.5D canvas has depth layers, glow and explicit selection styling',()=>{
  assert.equal(css.includes('perspective'),true);
  assert.equal(css.includes('domain-node.selected'),true);
  assert.equal(css.includes('domain-depth-ring'),true);
});

test('domain navigator stays independent from the structural Three renderer',()=>{
  assert.equal(navigator.includes('AtlasCanvas'),false);
  assert.equal(navigator.includes('@react-three/fiber'),false);
  assert.equal(navigator.includes('<svg'),true);
});
