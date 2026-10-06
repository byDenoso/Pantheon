import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocaleController, fromBrowserLanguages, STORAGE_KEY} from '../src/i18n/locale.ts';
import {MESSAGES} from '../src/i18n/messages.ts';
import {defer, fakeTarget, flush, json, mockFetch} from './helpers/atlas-mock.mjs';

const mem = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), m}; };
const LOC = (locale, source = 'browser') => json({contract: 'ATLAS_LOCALE_V1', locale, source, supported: ['pt-BR', 'en']});

test('precedence: saved manual choice wins over server and browser, and no server call is needed', async () => {
  const st = mem(); st.setItem(STORAGE_KEY, 'en');
  const calls = [];
  const c = createLocaleController({fetch: mockFetch({'GET /api/atlas-locale': () => LOC('pt-BR')}, calls), storage: () => st, languages: ['pt-BR']});
  c.start(); await flush();
  assert.equal(c.getSnapshot().locale, 'en'); assert.equal(c.getSnapshot().mode, 'manual');
  assert.equal(calls.length, 0);
});

test('automatic mode: server answer (no lang param, nothing persisted)', async () => {
  const st = mem(); const calls = [];
  const c = createLocaleController({fetch: mockFetch({'GET /api/atlas-locale': () => LOC('en', 'country')}, calls), storage: () => st, languages: ['pt-BR']});
  c.start(); await flush();
  assert.equal(c.getSnapshot().locale, 'en'); assert.equal(c.getSnapshot().source, 'country');
  assert.equal(calls[0].url, '/api/atlas-locale');
  assert.equal(st.m.size, 0);
});

test('static hosting fallback: browser language, then default pt-BR', async () => {
  const mk = langs => createLocaleController({fetch: mockFetch({}), storage: () => mem(), languages: langs});
  let c = mk(['en-GB']); c.start(); await flush(); assert.equal(c.getSnapshot().locale, 'en');
  c = mk(['fr-FR']); c.start(); await flush(); assert.equal(c.getSnapshot().locale, 'pt-BR');
  assert.equal(fromBrowserLanguages(['de', 'pt-PT']), 'pt-BR');
});

test('RACE: manual choice during an in-flight server request is not overwritten by the late response', async () => {
  const d = defer(); const st = mem();
  const c = createLocaleController({fetch: mockFetch({'GET /api/atlas-locale': () => d.promise}), storage: () => st, languages: ['pt-BR']});
  c.start(); await flush();
  c.choose('en');
  d.resolve(LOC('pt-BR')); await flush();
  assert.equal(c.getSnapshot().locale, 'en'); assert.equal(c.getSnapshot().mode, 'manual');
  assert.equal(st.getItem(STORAGE_KEY), 'en');
});

test('RACE: manual choice saved by another tab (storage) while auto request is pending wins', async () => {
  const d = defer(); const st = mem(); const win = fakeTarget();
  const c = createLocaleController({fetch: mockFetch({'GET /api/atlas-locale': () => d.promise}), storage: () => st, languages: ['pt-BR'], win});
  c.start(); await flush();
  st.setItem(STORAGE_KEY, 'en'); // another tab wrote it, no storage event delivered yet
  d.resolve(LOC('pt-BR')); await flush();
  assert.equal(c.getSnapshot().locale, 'en', 're-read of manual after await must beat the server answer');
  assert.equal(c.getSnapshot().mode, 'manual');
});

test('storage event from another tab switches to manual locale', async () => {
  const st = mem(); const win = fakeTarget();
  const c = createLocaleController({fetch: mockFetch({'GET /api/atlas-locale': () => LOC('pt-BR')}), storage: () => st, languages: ['pt-BR'], win});
  c.start(); await flush();
  st.setItem(STORAGE_KEY, 'en'); win.emit('storage', {key: STORAGE_KEY});
  assert.equal(c.getSnapshot().locale, 'en'); assert.equal(c.getSnapshot().mode, 'manual');
});

test('storage unavailable: manual choice still works in memory and blocks server overwrite', async () => {
  const d = defer();
  const bad = () => { throw new Error('denied'); };
  const c = createLocaleController({fetch: mockFetch({'GET /api/atlas-locale': () => d.promise}), storage: bad, languages: ['pt-BR']});
  c.start(); await flush();
  c.choose('en');
  assert.equal(c.getSnapshot().persisted, false);
  d.resolve(LOC('pt-BR')); await flush();
  assert.equal(c.getSnapshot().locale, 'en');
});

test('setAuto clears the stored choice and re-resolves from the server', async () => {
  const st = mem(); st.setItem(STORAGE_KEY, 'pt-BR');
  const c = createLocaleController({fetch: mockFetch({'GET /api/atlas-locale': () => LOC('en')}), storage: () => st, languages: ['pt-BR']});
  c.start(); await c.setAuto();
  assert.equal(st.getItem(STORAGE_KEY), null); assert.equal(c.getSnapshot().locale, 'en'); assert.equal(c.getSnapshot().mode, 'auto');
});

test('invalid stored values are ignored; dispose stops late updates', async () => {
  const st = mem(); st.setItem(STORAGE_KEY, 'klingon');
  const d = defer();
  const c = createLocaleController({fetch: mockFetch({'GET /api/atlas-locale': () => d.promise}), storage: () => st, languages: ['en']});
  assert.equal(c.getSnapshot().mode, 'auto');
  c.start(); await flush(); c.dispose(); d.resolve(LOC('pt-BR')); await flush();
  assert.equal(c.getSnapshot().locale, 'en');
});

test('both locales define every message key and the PT copy avoids the banned contrast pattern', () => {
  const k = o => Object.keys(o).sort().join();
  assert.equal(k(MESSAGES['pt-BR']), k(MESSAGES.en));
  assert.equal(k(MESSAGES['pt-BR'].kinds), k(MESSAGES.en.kinds));
  assert.equal(k(MESSAGES['pt-BR'].notices), k(MESSAGES.en.notices));
  const all = JSON.stringify(MESSAGES['pt-BR']).toLowerCase();
  assert.doesNotMatch(all, /não é .*, mas|não se trata de|e sim /);
});

test('Automatic chosen in another tab clears this tab’s own earlier manual selection', async () => {
  const st = mem(), win = fakeTarget();
  const c = createLocaleController({fetch: mockFetch({'GET /api/atlas-locale': () => LOC('pt-BR')}), storage: () => st, languages: ['en'], win});
  c.start(); await flush(); c.choose('en');
  st.removeItem(STORAGE_KEY); win.emit('storage', {key: STORAGE_KEY}); await flush();
  assert.equal(c.getSnapshot().mode, 'auto'); assert.equal(c.getSnapshot().locale, 'pt-BR'); assert.equal(st.getItem(STORAGE_KEY), null); c.dispose();
});

test('cross-tab clear after replacing a manual locale does not revive stale in-memory locale', async () => {
  const st = mem(), win = fakeTarget();
  const c = createLocaleController({fetch: mockFetch({'GET /api/atlas-locale': () => LOC('pt-BR')}), storage: () => st, languages: ['en'], win});
  c.start(); await flush(); c.choose('en');
  st.setItem(STORAGE_KEY, 'pt-BR'); win.emit('storage', {key: STORAGE_KEY});
  st.removeItem(STORAGE_KEY); win.emit('storage', {key: null}); await flush();
  assert.equal(c.getSnapshot().mode, 'auto'); assert.equal(c.getSnapshot().locale, 'pt-BR'); c.dispose();
});

test('manual choice followed immediately by Automatic retries an aborted locale request', async () => {
  const first = defer(); let calls = 0;
  const c = createLocaleController({fetch: mockFetch({'GET /api/atlas-locale': () => ++calls === 1 ? first.promise : LOC('en')}), storage: () => mem(), languages: ['pt-BR']});
  c.start(); await flush(); c.choose('pt-BR'); await c.setAuto();
  assert.equal(calls, 2); assert.equal(c.getSnapshot().locale, 'en'); assert.equal(c.getSnapshot().mode, 'auto'); c.dispose();
});

test('failed manual write and failed Automatic removal honor newest local selection', async () => {
  const st = mem(); st.setItem(STORAGE_KEY, 'pt-BR');
  const storage = {...st, setItem() { throw new Error('read-only'); }, removeItem() { throw new Error('read-only'); }};
  const c = createLocaleController({fetch: mockFetch({'GET /api/atlas-locale': () => LOC('en')}), storage: () => storage, languages: ['pt-BR']});
  c.start(); c.choose('en'); assert.equal(c.getSnapshot().locale, 'en'); assert.equal(c.getSnapshot().persisted, false);
  await c.setAuto(); assert.equal(c.getSnapshot().mode, 'auto'); assert.equal(c.getSnapshot().locale, 'en'); c.dispose();
});

test('cross-tab Automatic notification performs no storage write', async () => {
  const st = mem(), win = fakeTarget(); let removals = 0;
  const storage = {...st, removeItem(k) { removals++; st.removeItem(k); }};
  const c = createLocaleController({fetch: mockFetch({'GET /api/atlas-locale': () => LOC('pt-BR')}), storage: () => storage, languages: ['en'], win});
  c.start(); await flush(); c.choose('en'); st.removeItem(STORAGE_KEY);
  win.emit('storage', {key: STORAGE_KEY}); await flush();
  assert.equal(removals, 0); assert.equal(c.getSnapshot().mode, 'auto'); c.dispose();
});
