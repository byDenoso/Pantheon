import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameBridge} from '../src/atlas/privateFrameBridge.ts';
import {FRAME, HOST, parseFromFrame, parseToFrame, trusted} from '../src/atlas/frameProtocol.ts';
import {fakeTarget} from './helpers/atlas-mock.mjs';

const O = 'https://atlas.example.test';
function setup(over = {}) {
  const win = fakeTarget(); const posted = []; const frameWin = {postMessage: (m, o) => posted.push([m, o])};
  const calls = {ready: 0, logout: 0, errors: []};
  const data = {marker: 'synthetic'};
  const b = createFrameBridge({win, origin: O, getFrameWindow: () => frameWin, getData: () => data, onReady: () => calls.ready++, onLogout: () => calls.logout++, onError: c => calls.errors.push(c), ...over});
  const emit = (e) => win.emit('message', e);
  return {win, posted, frameWin, calls, b, emit, data};
}
const msg = (type, extra = {}) => ({channel: FRAME, type, ...extra});

test('READY from the guarded frame (origin AND source) gets the runtime, targeted at the same origin only', () => {
  const t = setup();
  t.emit({origin: O, source: t.frameWin, data: msg('READY')});
  assert.equal(t.posted.length, 1); assert.equal(t.posted[0][1], O); assert.notEqual(t.posted[0][1], '*');
  assert.deepEqual(t.posted[0][0], {channel: HOST, type: 'RUNTIME', data: t.data}); assert.equal(t.calls.ready, 1);
});

test('ACCEPTED (frame validated the runtime) is distinct from READY and only honoured from the trusted frame', () => {
  let accepted = 0; const t = setup({onAccepted: () => accepted++});
  t.emit({origin: O, source: t.frameWin, data: msg('ACCEPTED')});
  t.emit({origin: 'https://evil.example.test', source: t.frameWin, data: msg('ACCEPTED')});
  assert.equal(accepted, 1); assert.equal(t.posted.length, 0);
});

test('foreign origin, foreign source, missing source, or malformed channel are all ignored', () => {
  const t = setup();
  t.emit({origin: 'https://evil.example.test', source: t.frameWin, data: msg('READY')});
  t.emit({origin: O, source: {postMessage() {}}, data: msg('READY')});
  t.emit({origin: O, source: null, data: msg('READY')});
  t.emit({origin: O, source: t.frameWin, data: {channel: 'other', type: 'READY'}});
  t.emit({origin: O, source: t.frameWin, data: 'READY'});
  t.emit({origin: O, source: t.frameWin, data: msg('SESSION_ACTION', {action: 'delete-everything'})});
  assert.equal(t.posted.length, 0); assert.equal(t.calls.logout, 0); assert.equal(t.calls.errors.length, 0);
});

test('session action and frame errors reach the shell only from the trusted frame', () => {
  const t = setup();
  t.emit({origin: O, source: t.frameWin, data: msg('SESSION_ACTION', {action: 'logout'})});
  t.emit({origin: O, source: t.frameWin, data: msg('ERROR', {code: 'CHUNK_LOAD'})});
  t.emit({origin: 'https://evil.example.test', source: t.frameWin, data: msg('SESSION_ACTION', {action: 'logout'})});
  assert.equal(t.calls.logout, 1); assert.deepEqual(t.calls.errors, ['CHUNK_LOAD']);
});

test('no data (session ended) means no runtime is ever posted', () => {
  const t = setup({getData: () => null});
  t.emit({origin: O, source: t.frameWin, data: msg('READY')});
  assert.equal(t.posted.length, 0);
});

test('an opaque ("null") origin never receives data and never validates messages', () => {
  const t = setup({origin: 'null'});
  t.emit({origin: 'null', source: t.frameWin, data: msg('READY')});
  assert.equal(t.posted.length, 0);
  assert.equal(trusted({origin: 'null', source: 1, data: 1}, 'null', 1), false);
  assert.equal(trusted({origin: O, source: 1, data: 1}, O, null), false);
});

test('a frame that is gone (contentWindow null) receives nothing', () => {
  const t = setup({getFrameWindow: () => null});
  t.emit({origin: O, source: null, data: msg('READY')});
  assert.equal(t.posted.length, 0);
});

test('dispose tears the frame down, then ignores everything and removes its listener', () => {
  const t = setup();
  t.b.dispose();
  assert.deepEqual(t.posted.map(p => p[0].type), ['TEARDOWN']); assert.equal(t.win.count('message'), 0);
  t.emit({origin: O, source: t.frameWin, data: msg('READY')});
  assert.equal(t.posted.length, 1);
});

test('protocol parsers accept only the documented messages', () => {
  assert.equal(parseFromFrame(null), null); assert.equal(parseFromFrame({channel: FRAME, type: 'ERROR', code: 3}), null);
  assert.equal(parseFromFrame({channel: FRAME, type: 'ERROR', code: 'x'.repeat(200)}).code.length, 64);
  assert.equal(parseToFrame({channel: HOST, type: 'RUNTIME', data: 1}).type, 'RUNTIME');
  assert.equal(parseToFrame({channel: FRAME, type: 'RUNTIME'}), null); assert.equal(parseToFrame([]), null);
});

test('hung refresh times out, releases single-flight for retry and aborts on disposal',async()=>{
 const signals=[];const t=setup({refreshTimeoutMs:10,onRefresh:signal=>{signals.push(signal);return new Promise(()=>{});}});
 const refresh=id=>t.emit({origin:O,source:t.frameWin,data:msg('REFRESH',{id})});
 refresh('one');await new Promise(r=>setTimeout(r,20));
 assert.equal(signals[0].aborted,true);assert.equal(t.posted.at(-1)[0].code,'TIMEOUT');
 refresh('two');assert.equal(signals.length,2);t.b.dispose();assert.equal(signals[1].aborted,true);
 await new Promise(r=>setTimeout(r,20));assert.equal(t.posted.at(-1)[0].type,'TEARDOWN');
});

test('locale: the shell language reaches the guarded frame before the runtime, and later changes go through the same channel only', () => {
  let locale = 'en'; const s = setup({getLocale: () => locale});
  assert.equal(s.b.setLocale('en'), false, 'nothing is sent before the frame said READY'); assert.equal(s.posted.length, 0);
  s.emit({origin: O, source: s.frameWin, data: msg('READY')});
  assert.deepEqual(s.posted, [[{channel: HOST, type: 'LOCALE', locale: 'en'}, O], [{channel: HOST, type: 'RUNTIME', data: s.data}, O]], 'language first, then the runtime, both targeted at the same origin');
  locale = 'pt-BR'; assert.equal(s.b.setLocale(locale), true); assert.deepEqual(s.posted[2], [{channel: HOST, type: 'LOCALE', locale: 'pt-BR'}, O]);
  for (const bad of ['fr', 'EN', 'pt', '', '<script>', 'en-US']) assert.equal(s.b.setLocale(bad), false, `unsupported locale ${bad} is never sent`); assert.equal(s.posted.length, 3);
  s.b.dispose(); const n = s.posted.length; assert.equal(s.b.setLocale('en'), false); assert.equal(s.posted.length, n, 'nothing after dispose');
});
test('locale: no locale provider means no LOCALE message; an unsupported shell value is dropped; an opaque origin or a gone frame gets nothing', () => {
  const a = setup(); a.emit({origin: O, source: a.frameWin, data: msg('READY')}); assert.deepEqual(a.posted.map(p => p[0].type), ['RUNTIME']);
  const b = setup({getLocale: () => 'de'}); b.emit({origin: O, source: b.frameWin, data: msg('READY')}); assert.deepEqual(b.posted.map(p => p[0].type), ['RUNTIME']);
  const win = fakeTarget(), posted = []; const fw = {postMessage: (m, o) => posted.push([m, o])};
  const c = createFrameBridge({win, origin: 'null', getFrameWindow: () => fw, getData: () => ({}), getLocale: () => 'en', onLogout() {}, onError() {}}); win.emit('message', {origin: 'null', source: fw, data: msg('READY')}); assert.equal(c.setLocale('en'), false); assert.equal(posted.length, 0);
});
test('locale: the frame-side parser accepts only the two supported locales and nothing else rides on the message', () => {
  assert.deepEqual(parseToFrame({channel: HOST, type: 'LOCALE', locale: 'en'}), {channel: HOST, type: 'LOCALE', locale: 'en'});
  assert.deepEqual(parseToFrame({channel: HOST, type: 'LOCALE', locale: 'pt-BR', data: {secret: 1}, extra: 'x'}), {channel: HOST, type: 'LOCALE', locale: 'pt-BR'});
  for (const bad of ['fr', 'EN', 7, null, undefined, {}, ['en'], 'en-US']) assert.equal(parseToFrame({channel: HOST, type: 'LOCALE', locale: bad}), null);
  assert.equal(parseToFrame({channel: FRAME, type: 'LOCALE', locale: 'en'}), null, 'wrong channel'); assert.equal(parseFromFrame({channel: FRAME, type: 'LOCALE', locale: 'en'}), null, 'the frame cannot send it');
});
