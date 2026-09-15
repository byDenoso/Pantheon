import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAtlasV4Entry } from '../src/atlas-v3/entry-v4.mjs';

test('project root resolves directly to atlas-v3 while preserving search and hash', () => {
  assert.equal(
    resolveAtlasV4Entry('https://bydenoso.github.io/Pantheon/?atlas-view=science#focus'),
    'https://bydenoso.github.io/Pantheon/atlas-v3/?atlas-view=science#focus'
  );
});

test('local root resolves directly to atlas-v3', () => {
  assert.equal(
    resolveAtlasV4Entry('http://localhost:4173/?q=nexo'),
    'http://localhost:4173/atlas-v3/?q=nexo'
  );
});

test('deep product routes are not hijacked', () => {
  assert.equal(resolveAtlasV4Entry('https://bydenoso.github.io/Pantheon/grafos'), null);
  assert.equal(resolveAtlasV4Entry('http://localhost:4173/cockpit'), null);
});

test('atlas-v3 route does not redirect itself', () => {
  assert.equal(resolveAtlasV4Entry('https://bydenoso.github.io/Pantheon/atlas-v3/'), null);
});
