import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/data/shared-json.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;

function setup() {
  const calls = [];
  const exports = {};
  const fetch = (url, init) => new Promise((resolve, reject) => {
    const call = {url, init, resolve: value => resolve({ok: true, json: async () => value}), reject};
    calls.push(call);
    init.signal?.addEventListener('abort', () => reject(init.signal.reason), {once: true});
  });
  vm.runInNewContext(compiled, {exports, fetch, Headers, AbortController, DOMException});
  return {...exports, calls};
}
const aborted = promise => assert.rejects(promise, error => error?.name === 'AbortError');

test('concurrent equivalent GETs share only the in-flight response', async () => {
  const {fetchSharedJson, calls} = setup();
  const a = fetchSharedJson('/projection'), b = fetchSharedJson('/projection');
  assert.equal(calls.length, 1);
  calls[0].resolve({revision: 1});
  assert.deepEqual(await a, {revision: 1});
  assert.deepEqual(await b, {revision: 1});
  const c = fetchSharedJson('/projection');
  assert.equal(calls.length, 2, 'a completed publication must be revalidated');
  calls[1].resolve({revision: 2});
  assert.deepEqual(await c, {revision: 2});
});

test('one cancelled consumer does not abort another mounted surface', async () => {
  const {fetchSharedJson, calls} = setup();
  const first = new AbortController(), second = new AbortController();
  const a = fetchSharedJson('/projection', {signal: first.signal});
  const b = fetchSharedJson('/projection', {signal: second.signal});
  const rejected = aborted(a);
  first.abort();
  await rejected;
  assert.equal(calls[0].init.signal.aborted, false);
  calls[0].resolve('still needed');
  assert.equal(await b, 'still needed');
});

test('last cancelled consumer aborts network and a later mount gets a fresh request', async () => {
  const {fetchSharedJson, calls} = setup();
  const first = new AbortController(), second = new AbortController();
  const a = fetchSharedJson('/projection', {signal: first.signal});
  const b = fetchSharedJson('/projection', {signal: second.signal});
  const rejected = Promise.all([aborted(a), aborted(b)]);
  first.abort(); second.abort();
  assert.equal(calls[0].init.signal.aborted, true);
  const c = fetchSharedJson('/projection');
  assert.equal(calls.length, 2);
  await rejected;
  const d = fetchSharedJson('/projection');
  assert.equal(calls.length, 2, 'old completion must not evict the replacement');
  calls[1].resolve('fresh');
  assert.deepEqual(await Promise.all([c, d]), ['fresh', 'fresh']);
});

test('a consumer without a signal retains the shared network request', async () => {
  const {fetchSharedJson, calls} = setup();
  const ctrl = new AbortController();
  const a = fetchSharedJson('/projection', {signal: ctrl.signal});
  const b = fetchSharedJson('/projection');
  const rejected = aborted(a); ctrl.abort(); await rejected;
  assert.equal(calls[0].init.signal.aborted, false);
  calls[0].resolve('retained');
  assert.equal(await b, 'retained');
});

test('already-aborted callers do not start a network request', async () => {
  const {fetchSharedJson, calls} = setup();
  const ctrl = new AbortController(); ctrl.abort();
  await aborted(fetchSharedJson('/projection', {signal: ctrl.signal}));
  assert.equal(calls.length, 0);
});

test('POST retains its signal and is never deduplicated', async () => {
  const {fetchSharedJson, calls} = setup();
  const ctrl = new AbortController();
  const a = fetchSharedJson('/command', {method: 'POST', body: '{}', signal: ctrl.signal});
  const b = fetchSharedJson('/command', {method: 'POST', body: '{}', signal: ctrl.signal});
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.signal, ctrl.signal);
  const rejected = Promise.all([aborted(a), aborted(b)]); ctrl.abort(); await rejected;
});

test('different credentials, cache, mode, redirect or integrity never share', async () => {
  const {fetchSharedJson, calls} = setup();
  const options = [
    {}, {credentials: 'include'}, {credentials: 'omit'}, {cache: 'no-store'},
    {mode: 'cors'}, {mode: 'same-origin'}, {redirect: 'error'}, {integrity: 'sha256-example'},
  ];
  const promises = options.map(init => fetchSharedJson('/projection', init));
  assert.equal(calls.length, options.length);
  calls.forEach((call, i) => call.resolve(i));
  assert.deepEqual(await Promise.all(promises), options.map((_, i) => i));
});

test('header casing/order and method case are normalized', async () => {
  const {fetchSharedJson, calls} = setup();
  const a = fetchSharedJson('/projection', {method: 'get', headers: {'X-Trace': '1', Accept: 'application/json'}});
  const b = fetchSharedJson('/projection', {headers: [['accept', 'application/json'], ['x-trace', '1']]});
  assert.equal(calls.length, 1);
  calls[0].resolve('same'); await Promise.all([a, b]);
});

test('failed requests release their entry and can be retried', async () => {
  const {fetchSharedJson, calls} = setup();
  const a = fetchSharedJson('/projection');
  const rejected = assert.rejects(a, /offline/);
  calls[0].reject(new Error('offline')); await rejected;
  const b = fetchSharedJson('/projection');
  assert.equal(calls.length, 2);
  calls[1].resolve('recovered'); assert.equal(await b, 'recovered');
});

test('clearing one URL preserves consumers and other URLs', async () => {
  const {fetchSharedJson, clearSharedJson, calls} = setup();
  const a = fetchSharedJson('/a'), b = fetchSharedJson('/b');
  clearSharedJson('/a');
  const c = fetchSharedJson('/a'), d = fetchSharedJson('/b');
  assert.equal(calls.length, 3);
  assert.equal(calls[0].init.signal.aborted, false);
  calls[0].resolve('old'); await a;
  const e = fetchSharedJson('/a');
  assert.equal(calls.length, 3, 'old completion cannot evict the new entry');
  calls[1].resolve('b'); calls[2].resolve('new');
  assert.deepEqual(await Promise.all([b, c, d, e]), ['b', 'new', 'b', 'new']);
});

test('settled consumers remove their abort listeners', async () => {
  const {fetchSharedJson, calls} = setup();
  const ctrl = new AbortController(); let adds = 0, removes = 0;
  const add = ctrl.signal.addEventListener.bind(ctrl.signal), remove = ctrl.signal.removeEventListener.bind(ctrl.signal);
  ctrl.signal.addEventListener = (...args) => { adds++; return add(...args); };
  ctrl.signal.removeEventListener = (...args) => { removes++; return remove(...args); };
  const a = fetchSharedJson('/projection', {signal: ctrl.signal});
  calls[0].resolve('done'); await a;
  assert.equal(adds, 1); assert.equal(removes, 1);
  ctrl.abort();
  assert.equal(calls[0].init.signal.aborted, false);
});
