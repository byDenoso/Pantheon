import test from 'node:test';
import assert from 'node:assert/strict';
import {areaFromHash, createAreaStore} from '../src/app/area.ts';
import {fakeTarget} from './helpers/atlas-mock.mjs';

test('hash → area mapping', () => {
  for (const h of ['', '#', '#/', '#/agora', '#/privadoX', '#/privado-x', '#/public/privado']) assert.equal(areaFromHash(h), 'public', h);
  for (const h of ['#/privado', '#privado', '#/privado/', '#/privado?x=1', '#/privado/sub']) assert.equal(areaFromHash(h), 'private', h);
});

test('store re-reads on hashchange and popstate and unsubscribes cleanly', () => {
  const w = fakeTarget(); const s = createAreaStore(w);
  let n = 0; const off = s.subscribe(() => n++);
  assert.equal(s.getSnapshot(), 'public');
  w.location.hash = '#/privado'; w.emit('hashchange'); assert.equal(s.getSnapshot(), 'private');
  w.location.hash = '#/'; w.emit('popstate'); assert.equal(s.getSnapshot(), 'public');
  assert.equal(n, 2);
  off(); assert.equal(w.count('hashchange'), 0); assert.equal(w.count('popstate'), 0);
});
