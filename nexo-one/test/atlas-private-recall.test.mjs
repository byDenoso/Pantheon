import test from 'node:test';
import assert from 'node:assert/strict';
import {recallLocal, privateRecall, RECALL_PROVIDERS} from '../src/private-legacy/recall.ts';
import {runtimeHolder} from '../src/private-legacy/state.ts';
import {makeRuntime, makeWorld, FP} from './helpers/synthetic-runtime.mjs';

const worldWith = (items, providers) => ({...makeWorld(FP), items, providers});
const item = (id, title, source, extra = {}) => ({id, kind: 'ENTITY', title, source, sourceRef: `synthetic://${id}`, authority: 'DERIVED', freshness: {state: 'SNAPSHOT', observedAt: 'x', expiresAt: 'y'}, attention: 'NOTICE', actions: [], observedAt: 'x', ...extra});
const prov = (id, status = 'AVAILABLE') => ({id, label: id, status, lastSuccessAt: null, checkedAt: 'x', revision: null, message: '', partial: false, count: 99});

test('recall is lexical over title/summary/context of the authenticated items only', () => {
  const w = worldWith([item('a', 'Alfa sintético', 'nexo'), item('b', 'Beta', 'nexo', {summary: 'contém ALFA aqui'}), item('c', 'Gama', 'atlas', {contextId: 'NEXO'})], [prov('nexo'), prov('atlas')]);
  const r = recallLocal(w, '  alfa ');
  assert.deepEqual(r.items.map(i => i.id), ['a', 'b']);
  assert.equal(r.scope, 'LOCAL_SNAPSHOT');
  assert.equal(recallLocal(w, 'nexo').items.map(i => i.id).join(), 'c');
  assert.equal(recallLocal(w, 'zzz').items.length, 0);
  assert.equal(recallLocal(w, '').items.length, 0, 'empty query never lists everything');
});

test('providers absent from the runtime are UNAVAILABLE (null count), present ones count matches, never invented success', () => {
  const w = worldWith([item('a', 'Alfa', 'nexo')], [prov('nexo'), prov('atlas', 'STALE')]);
  const r = recallLocal(w, 'alfa');
  assert.deepEqual(r.providers.map(p => p.id), [...RECALL_PROVIDERS]);
  const by = Object.fromEntries(r.providers.map(p => [p.id, p]));
  assert.equal(by.nexo.status, 'AVAILABLE'); assert.equal(by.nexo.count, 1);
  assert.equal(by.atlas.status, 'STALE'); assert.equal(by.atlas.count, null);
  for (const id of ['drive', 'gmail', 'github']) { assert.equal(by[id].status, 'UNAVAILABLE'); assert.equal(by[id].count, null); assert.equal(by[id].partial, true); }
});

test('query is bounded and results are capped; input world is not mutated', () => {
  const items = Array.from({length: 300}, (_, n) => item(`i${n}`, 'comum', 'nexo'));
  const w = worldWith(items, [prov('nexo')]);
  const before = JSON.stringify(w);
  const r = recallLocal(w, 'comum');
  assert.equal(r.items.length, 200); assert.equal(r.total_matches, 300);
  assert.equal(recallLocal(w, 'x'.repeat(500)).query.length, 200);
  assert.equal(JSON.stringify(w), before);
});

test('privateRecall: in-memory Response, never touches fetch/network; 503 when no generation; abort honoured', async () => {
  const realFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = () => { calls += 1; throw new Error('network is forbidden'); };
  try {
    runtimeHolder.clear();
    assert.equal((await privateRecall('x')).status, 503);
    runtimeHolder.set(makeRuntime());
    const res = await privateRecall('sintético');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.scope, 'LOCAL_SNAPSHOT'); assert.equal(body.access, 'PRIVATE'); assert.ok(body.items.length >= 1);
    assert.equal((await privateRecall('   ')).status, 400);
    const ac = new AbortController(); ac.abort();
    await assert.rejects(privateRecall('x', ac.signal), {name: 'AbortError'});
    assert.equal(calls, 0);
  } finally { globalThis.fetch = realFetch; runtimeHolder.clear(); }
});
