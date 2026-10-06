import test from 'node:test';
import assert from 'node:assert/strict';
import {PERSISTABLE_KEYS, createGuardedStorage, installGuards, isApprovedSourceUrl, linkStaysInDocument} from '../src/private-legacy/guards.ts';
import {createRuntimeHolder, validateRuntime} from '../src/private-legacy/runtime.ts';
import {makeRuntime} from './helpers/synthetic-runtime.mjs';

const realStore = () => { const m = new Map(); return {m, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear()}; };
function fakeWin(real = realStore()) {
  const listeners = {};
  const doc = {addEventListener: (t, f, c) => ((listeners[`${t}:${!!c}`] ??= new Set()).add(f)), removeEventListener: (t, f, c) => listeners[`${t}:${!!c}`]?.delete(f)};
  const win = {location: {origin: 'https://atlas.example.test', href: 'https://atlas.example.test/api/atlas-private-ui#/agora'}, document: doc, navigator: {}, localStorage: real, sessionStorage: realStore()};
  return {win, real, listeners, fire: (t, cap, ev) => [...(listeners[`${t}:${cap}`] ?? [])].forEach(f => f(ev))};
}
const ev = (href, extra = {}) => { const a = {getAttribute: () => href, setAttribute() { a.blocked = true; }}; const e = {target: {closest: () => a}, defaultPrevented: false, preventDefault() { e.defaultPrevented = true; }, stopImmediatePropagation() { e.stopped = true; }, ...extra}; return {e, a}; };

test('storage: only generic theme/language keys reach real storage; everything else is memory-only', () => {
  const real = realStore(); const s = createGuardedStorage(() => real);
  for (const k of PERSISTABLE_KEYS) { s.setItem(k, 'v'); assert.equal(real.getItem(k), 'v', k); }
  for (const k of ['nexo.public-projection-receipt.v1', 'nexo.base', 'nexo.narration', 'selection', 'baseline', 'nexo-view', 'any-private-id']) {
    s.setItem(k, 'secret'); assert.equal(s.getItem(k), 'secret'); assert.equal(real.getItem(k), null, `${k} must not persist`);
  }
  assert.deepEqual([...real.m.keys()].sort(), [...PERSISTABLE_KEYS].sort());
});

test('storage: private keys already present in real storage are invisible to the frame; clear wipes memory', () => {
  const real = realStore(); real.setItem('nexo.base', 'old'); const s = createGuardedStorage(() => real);
  assert.equal(s.getItem('nexo.base'), null);
  s.setItem('x', '1'); s.clear(); assert.equal(s.getItem('x'), null); assert.equal(s.length, 0);
});

test('storage: unavailable real storage never throws', () => {
  const s = createGuardedStorage(() => { throw new Error('denied'); });
  s.setItem('nexo-theme', 'dark'); assert.equal(s.getItem('nexo-theme'), 'dark'); s.removeItem('nexo-theme'); assert.equal(s.getItem('nexo-theme'), null);
});

test('installGuards shadows storage and closes XHR/EventSource/WebSocket/open/sendBeacon; fetch never reaches the network', async () => {
  const {win, real} = fakeWin(); const h = createRuntimeHolder(); h.set(validateRuntime(makeRuntime()).runtime);
  const g = installGuards(win, h);
  win.localStorage.setItem('nexo.base', 'x'); win.sessionStorage.setItem('k', 'v');
  assert.equal(real.getItem('nexo.base'), null);
  for (const n of ['XMLHttpRequest', 'EventSource', 'WebSocket']) assert.throws(() => new win[n](), /CLOSED/, n);
  assert.equal(win.open('https://elsewhere.example.test'), null);
  assert.equal(win.navigator.sendBeacon('/x', 'y'), false);
  assert.equal((await win.fetch('/api/system')).status, 200);
  assert.equal((await win.fetch('https://elsewhere.example.test/x')).status, 501);
  assert.ok(g.denied.some(d => d.startsWith('FOREIGN_ORIGIN')));
  g.dispose(); assert.equal(g.storage.local.length, 0);
});

test('link decisions: only same-document hash navigation stays', () => {
  const base = 'https://atlas.example.test/api/atlas-private-ui#/agora';
  for (const h of ['#/lab/x', '#/galaxia', '#/agora?q=1']) assert.equal(linkStaysInDocument(h, base), true, h);
  for (const h of ['https://elsewhere.example.test/', 'https://atlas.example.test/other', '/api/atlas-private', 'mailto:x@y.z', 'javascript:void(0)', '', '//elsewhere.example.test/x', 'https://atlas.example.test/api/atlas-private-ui?x=1#/a']) assert.equal(linkStaysInDocument(h, base), false, h);
});

test('click/auxclick guard blocks external links (including target=_blank) and leaves hash links alone; forms cannot post natively', () => {
  const {win, fire} = fakeWin(); const h = createRuntimeHolder(); const g = installGuards(win, h);
  const ext = ev('https://elsewhere.example.test/x'); fire('click', true, ext.e);
  assert.equal(ext.e.defaultPrevented, true); assert.equal(ext.a.blocked, true);
  const aux = ev('https://elsewhere.example.test/x'); fire('auxclick', true, aux.e); assert.equal(aux.e.defaultPrevented, true);
  const inDoc = ev('#/lab/abc'); fire('click', true, inDoc.e); assert.equal(inDoc.e.defaultPrevented, false);
  const notLink = {target: {closest: () => null}, preventDefault() { throw new Error('should not'); }}; fire('click', true, notLink);
  const sub = {defaultPrevented: false, preventDefault() { sub.defaultPrevented = true; }}; fire('submit', false, sub); assert.equal(sub.defaultPrevented, true);
  g.dispose(); const after = ev('https://elsewhere.example.test/x'); fire('click', true, after.e); assert.equal(after.e.defaultPrevented, false, 'listeners removed on dispose');
});

const OWN = 'https://atlas.example.test';
test('approved source URLs: https only, no credentials, no sensitive params, not own origin, no loopback/IP/internal hosts', () => {
  for (const ok of ['https://source.example.test/a/b?x=1#frag', 'https://docs.example.test/file/d/ID123/view', 'https://repo.example.test/o/r/issues/7?q=aberto']) assert.equal(isApprovedSourceUrl(ok, OWN), true, ok);
  for (const bad of [
    'http://source.example.test/', 'javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'mailto:a@b.test', '//source.example.test/x', '/relative', '#/hash', '', null, undefined, 42,
    'https://user:pw@source.example.test/', 'https://user@source.example.test/',
    'https://source.example.test/?token=abc', 'https://source.example.test/?access_token=abc', 'https://source.example.test/?x=1&API_KEY=z', 'https://source.example.test/?sig=1',
    'https://source.example.test/?password=1', 'https://source.example.test/?session=1', 'https://source.example.test/?client_secret=1', 'https://source.example.test/?code=1',
    'https://source.example.test/#access_token=abc', 'https://source.example.test/#/x?token=1',
    `${OWN}/api/atlas-private`, `${OWN}/`, 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://[::1]/x', 'https://intranet/x', 'https://svc.internal/x', 'https://host.local/x',
    'https://source.example.test/ with space', 'https://source.example.test/\n', 'https://source.example.test/' + 'a'.repeat(2100),
  ]) assert.equal(isApprovedSourceUrl(bad, OWN), false, String(bad).slice(0, 70));
});

function openFixture({active = true} = {}) {
  const fx = fakeWin(); const opened = [];
  fx.win.open = (...a) => { opened.push(a); return {sentinel: true}; };
  fx.win.navigator = {userActivation: {isActive: active}};
  const holder = createRuntimeHolder();
  const g = installGuards(fx.win, holder);
  return {...fx, g, opened};
}
const anchor = (href, extra = {}) => ev(href, {isTrusted: true, type: 'click', button: 0, ...extra});

test('explicit trusted click on an approved https link opens a new tab with noopener,noreferrer; nothing else does', () => {
  const {fire, g, opened} = openFixture();
  const a = anchor('https://source.example.test/doc/1'); fire('click', true, a.e);
  assert.equal(a.e.defaultPrevented, true, 'native navigation replaced by the safe open');
  assert.deepEqual(opened, [['https://source.example.test/doc/1', '_blank', 'noopener,noreferrer']]);
  const mid = anchor('https://source.example.test/doc/2', {type: 'auxclick', button: 1}); fire('auxclick', true, mid.e);
  assert.equal(opened.length, 2);
  // not opened: right button on auxclick, untrusted (script-dispatched) click, unapproved URL
  const right = anchor('https://source.example.test/x', {type: 'auxclick', button: 2}); fire('auxclick', true, right.e);
  const synthetic = anchor('https://source.example.test/x', {isTrusted: false}); fire('click', true, synthetic.e);
  const sensitive = anchor('https://source.example.test/x?token=1'); fire('click', true, sensitive.e);
  const plain = anchor('http://source.example.test/x'); fire('click', true, plain.e);
  const own = anchor(`${OWN}/api/atlas-private`); fire('click', true, own.e);
  assert.equal(opened.length, 2);
  for (const b of [right, synthetic, sensitive, plain, own]) { assert.equal(b.e.defaultPrevented, true); assert.equal(b.a.blocked, true); }
  assert.equal(g.denied.filter(d => d.startsWith('LINK:')).length, 5);
});

test('blocked links are marked visibly (aria-disabled + reason), not silently dead', () => {
  const {fire} = openFixture();
  const attrs = {}; const a = {getAttribute: () => 'https://source.example.test/x?token=1', setAttribute: (k, v) => { attrs[k] = v; }};
  fire('click', true, {isTrusted: true, type: 'click', button: 0, target: {closest: () => a}, defaultPrevented: false, preventDefault() {}, stopImmediatePropagation() {}});
  assert.equal(attrs['aria-disabled'], 'true'); assert.match(attrs.title, /bloqueado/i); assert.equal(attrs['data-private-blocked'], 'true');
});

const trustedClick = fire => fire('click', true, {isTrusted: true, type: 'click', button: 0, target: {closest: () => null}, defaultPrevented: false, preventDefault() {}});
test('generic window.open remains closed during trusted clicks, microtasks and later tasks',async()=>{
 const live=openFixture({active:true});
 trustedClick(live.fire);
 live.win.open('https://source.example.test/sync');
 await Promise.resolve();live.win.open('https://source.example.test/microtask');
 await new Promise(r=>setTimeout(r,5));live.win.open('https://source.example.test/timer');
 assert.deepEqual(live.opened,[]);assert.equal(live.g.denied.filter(x=>x.startsWith('OPEN:')).length,3);
});

test('click on an approved link without user activation is blocked (activation is required in addition to a trusted click)', () => {
  const {fire, opened} = openFixture({active: false});
  const a = anchor('https://source.example.test/ok'); fire('click', true, a.e);
  assert.equal(opened.length, 0); assert.equal(a.e.defaultPrevented, true);
});
