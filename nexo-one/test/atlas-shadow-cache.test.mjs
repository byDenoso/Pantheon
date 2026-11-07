import test from 'node:test';
import assert from 'node:assert/strict';
import {cachedShadowReader, openBoard, sealBoard, SHADOW_CACHE_KEY, SHADOW_COOLDOWN_KEY, SHADOW_LOCK_KEY} from '../server/atlas/shadow-cache.mjs';

const BOARD = {contract: 'NEXO_SHADOW_BOARD_V1', mural: [{data: '2026-11-06', texto: 'linha'}]};
function memory() {
  const data = new Map(), calls = [];
  const store = async (command, key, value, ...rest) => {
    calls.push(command);
    if (command === 'MGET') return [data.get(key) ?? null, data.get(value) ?? null];
    if (command === 'EVAL') {
      const [lockKey, cacheKey, cooldownKey, owner, action, payload] = rest;
      if (data.get(lockKey) !== owner) return 0;
      if (action === 'ready') {
        if (payload) data.set(cacheKey, payload);
        data.delete(cooldownKey);
      } else if (action === 'limited') {
        data.set(cooldownKey, '1');
      }
      data.delete(lockKey);
      return 1;
    }
    if (command === 'SET') {
      if (rest.includes('NX') && data.has(key)) return null;
      data.set(key, value); return 'OK';
    }
    throw new Error(`unexpected ${command}`);
  };
  return {store, data, calls};
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

test('concurrent cold starts acquire one token and preserve the active lease', async () => {
  const {store, data} = memory();
  let release, started;
  const pending = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { started = resolve; });
  let reads = 0;
  const worker = () => cachedShadowReader({store, secret: 's', readShadow: async () => {
    reads++;
    started();
    await pending;
    return BOARD;
  }});
  const first = worker()();
  await ready;
  const lease = data.get(SHADOW_LOCK_KEY);
  await assert.rejects(worker()(), /SHADOW_REFRESH_IN_PROGRESS/);
  assert.equal(data.get(SHADOW_LOCK_KEY), lease);
  release();
  await first;
  assert.equal(reads, 1);
  assert.equal(data.has(SHADOW_LOCK_KEY), false);
});

test('finishing after the lease expires cannot delete a successor lease', async () => {
  const {store, data} = memory();
  const read = cachedShadowReader({store, secret: 's', readShadow: async () => {
    data.set(SHADOW_LOCK_KEY, 'successor');
    return BOARD;
  }});
  await read();
  assert.equal(data.get(SHADOW_LOCK_KEY), 'successor');
});

test('a Connect cooldown cannot block the newly configured service account', async () => {
  const {store, data} = memory();
  data.set(SHADOW_COOLDOWN_KEY, '1');
  const read = cachedShadowReader({store, secret: 's', serviceAccount: true, readShadow: async () => BOARD});
  assert.deepEqual((await read()).mural, BOARD.mural);
  assert.equal(data.get(SHADOW_COOLDOWN_KEY), '1');
});

test('a worker that lost its lease cannot overwrite the newer snapshot', async () => {
  const {store, data} = memory();
  const now = () => 1000000;
  const newer = {...BOARD, mural:[{texto:'mais recente'}]};
  const read = cachedShadowReader({store, secret:'s', now, readShadow:async()=>{
    data.set(SHADOW_CACHE_KEY, sealBoard({fetchedAt:now(), board:newer}, 's'));
    data.set(SHADOW_LOCK_KEY, 'successor');
    return BOARD;
  }});
  assert.deepEqual((await read()).mural, newer.mural);
  assert.deepEqual(openBoard(data.get(SHADOW_CACHE_KEY),'s').board,newer);
});

test('stale fallback does not expose unexpected errors from upstream', async () => {
  const {store} = memory();
  let t = 1000000, fail = false;
  const read = cachedShadowReader({store, secret:'s', now:()=>t, readShadow:async()=>{
    if(fail) throw new Error('upstream leaked a private resource name');
    return BOARD;
  }});
  await read();
  fail = true;
  t += 300000;
  const result=await read();
  assert.equal(result.cache.reason,'SHADOW_SOURCE_UNAVAILABLE');
});


test('a cold refresh uses four Redis calls and a cache hit uses one',async()=>{
  const {store,calls}=memory();
  const read=cachedShadowReader({store,secret:'s',readShadow:async()=>BOARD});
  await read();
  assert.deepEqual(calls,['MGET','SET','MGET','EVAL']);
  await read();
  assert.deepEqual(calls.slice(4),['MGET']);
});
