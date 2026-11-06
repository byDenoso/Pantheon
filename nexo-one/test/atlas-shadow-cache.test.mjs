import test from 'node:test';
import assert from 'node:assert/strict';
import {cachedShadowReader, openBoard, sealBoard, SHADOW_CACHE_KEY, SHADOW_COOLDOWN_KEY, SHADOW_LOCK_KEY} from '../server/atlas/shadow-cache.mjs';

const BOARD = {contract: 'NEXO_SHADOW_BOARD_V1', mural: [{data: '2026-11-06', texto: 'linha'}]};
function memory() {
  const data = new Map();
  const store = async (command, key, value, ...rest) => {
    if (command === 'GET') return data.get(key) ?? null;
    if (command === 'DEL') { data.delete(key); return 1; }
    if (command === 'SET') {
      if (rest.includes('NX') && data.has(key)) return null;
      data.set(key, value); return 'OK';
    }
    throw new Error(`unexpected ${command}`);
  };
  return {store, data};
}
const limited = (ms = 120000) => Object.assign(new Error('RATE_LIMITED'), {code: 'RATE_LIMITED', googleDiagnostic: 'CONNECT_RATE_LIMITED', retryDelayMs: ms});

test('sealed value round-trips and does not expose rows or open with another secret', () => {
  const sealed = sealBoard({fetchedAt: 1, board: BOARD}, 's1');
  assert.doesNotMatch(Buffer.from(sealed, 'base64').toString('latin1'), /linha/);
  assert.deepEqual(openBoard(sealed, 's1').board, BOARD);
  assert.throws(() => openBoard(sealed, 's2'));
});

test('a fresh copy answers without touching the source', async () => {
  const {store} = memory();
  let reads = 0, t = 1000000;
  const read = cachedShadowReader({store, secret: 's', now: () => t, readShadow: async () => { reads++; return BOARD; }});
  assert.equal((await read()).cache.stale, false);
  t += 60000;
  const second = await read();
  assert.equal(reads, 1);
  assert.equal(second.cache.ageSeconds, 60);
  assert.deepEqual(second.mural, BOARD.mural);
});

test('a 429 serves the last good board, opens a shared cooldown and stops further reads', async () => {
  const {store, data} = memory();
  let t = 1000000, fail = false, reads = 0;
  const reader = () => cachedShadowReader({store, secret: 's', now: () => t, readShadow: async () => { reads++; if (fail) throw limited(); return BOARD; }});
  await reader()();
  t += 600000; fail = true;
  const stale = await reader()();
  assert.equal(stale.cache.stale, true);
  assert.equal(stale.cache.reason, 'CONNECT_RATE_LIMITED');
  assert.equal(stale.cache.ageSeconds, 600);
  assert.ok(data.has(SHADOW_COOLDOWN_KEY));
  assert.ok(!data.has(SHADOW_LOCK_KEY));
  const before = reads;
  const again = await reader()();
  assert.equal(reads, before);
  assert.equal(again.cache.stale, true);
});

test('without a copy the rate limit still reaches the caller, with its diagnostic', async () => {
  const {store} = memory();
  const read = cachedShadowReader({store, secret: 's', readShadow: async () => { throw limited(); }});
  await assert.rejects(read(), e => e.googleDiagnostic === 'CONNECT_RATE_LIMITED');
  await assert.rejects(read(), e => e.googleDiagnostic === 'CONNECT_RATE_LIMITED');
});

test('another worker refreshing returns the copy instead of a second token request', async () => {
  const {store, data} = memory();
  let t = 1000000, reads = 0;
  const read = cachedShadowReader({store, secret: 's', now: () => t, readShadow: async () => { reads++; return BOARD; }});
  await read();
  t += 600000;
  data.set(SHADOW_LOCK_KEY, '1');
  const value = await read();
  assert.equal(reads, 1);
  assert.equal(value.cache.reason, 'REFRESH_IN_PROGRESS');
});

test('a store outage degrades to a direct read', async () => {
  const read = cachedShadowReader({store: async () => { throw new Error('down'); }, secret: 's', readShadow: async () => BOARD});
  assert.equal((await read()).cache.stale, false);
});

test('a copy sealed under a rotated credential is ignored', async () => {
  const {store, data} = memory();
  data.set(SHADOW_CACHE_KEY, sealBoard({fetchedAt: 1000000, board: {old: true}}, 'old'));
  let reads = 0;
  const read = cachedShadowReader({store, secret: 'new', now: () => 1000001, readShadow: async () => { reads++; return BOARD; }});
  assert.deepEqual((await read()).mural, BOARD.mural);
  assert.equal(reads, 1);
});
