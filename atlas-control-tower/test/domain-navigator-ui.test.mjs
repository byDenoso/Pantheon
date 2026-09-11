import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../src/pages/UniversePage.tsx',import.meta.url),'utf8');
const navigator=readFileSync(new URL('../src/components/DomainNavigator/DomainNavigator.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/design/domain-navigator.css',import.meta.url),'utf8');

test('universe page promotes domain navigator above the entity list',()=>{
  assert.match(page,/DomainNavigator/);
  assert.match(page,/buildDomainNavigatorModel/);
  assert.match(page,/model\.subdomains\.length/);
});

test('domain navigator is keyboard navigable and routes to subdomains',()=>{
  assert.match(navigator,/role="button"/);
  assert.match(navigator,/onKeyDown/);
  assert.match(navigator,/navigate\(`\/universes\/\$\{universeId\}\/\$\{domain\.id\}`\)/);
  assert.match(navigator,/Escape/);
});

test('2.5D canvas has depth layers, glow and explicit selection styling',()=>{
  assert.match(css,/perspective/);
  assert.match(css,/filter:drop-shadow|box-shadow/);
  assert.match(css,/domain-node\.selected/);
  assert.match(css,/domain-depth-ring/);
});

test('domain navigator stays independent from the structural Three renderer',()=>{
  assert.doesNotMatch(navigator,/AtlasCanvas|@react-three\/fiber|from ['"]three/);
  assert.match(navigator,/<svg/);
});
