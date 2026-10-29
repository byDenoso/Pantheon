import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectCinemaSource, createCinemaMedia} from '../src/atlas/cinema/media-controller.mjs';
const assets = {videos: {}, videosHd: {}, posters: {}};
for (const theme of ['dark', 'light']) {
  assets.videos[theme] = {}; assets.posters[theme] = {};
  assets.videosHd[theme] = {landscape: `${theme}-1080.mp4`};
  for (const orientation of ['landscape', 'portrait']) {
    assets.videos[theme][orientation] = `${theme}-${orientation}-540.mp4`;
    assets.posters[theme][orientation] = [1, 2, 3].map(i => `${theme}-${orientation}-${i}.jpg`);
  }
}
test('suitable desktop selects real 1080 film and mobile selects lightweight film', () => {
  assert.equal(selectCinemaSource(assets, 'dark', 'landscape', {width: 1440}), 'dark-1080.mp4');
  assert.equal(selectCinemaSource(assets, 'light', 'portrait', {width: 390}), 'light-portrait-540.mp4');
  assert.equal(selectCinemaSource(assets, 'light', 'landscape', {width: 1024, coarse: true}), 'light-landscape-540.mp4');
});
test('save-data, reduced-data and slow connection avoid high-resolution downloads', () => {
  for (const option of [{saveData: true}, {effectiveType: 'slow-2g'}, {effectiveType: '2g'}, {effectiveType: '3g'}])
    assert.equal(selectCinemaSource(assets, 'dark', 'landscape', {width: 1440, ...option}), 'dark-landscape-540.mp4');
});
test('missing high-resolution variant safely retains its native oriented film', () => {
  assert.equal(selectCinemaSource(assets, 'dark', 'portrait', {width: 1000}), 'dark-portrait-540.mp4');
  assert.equal(selectCinemaSource({...assets, videosHd: undefined}, 'dark', 'landscape', {width: 1440}), 'dark-landscape-540.mp4');
});
class Events {
  listeners = new Map();
  addEventListener(type, f) {if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(f);}
  removeEventListener(type, f) {this.listeners.get(type)?.delete(f);}
  emit(type) {for (const f of this.listeners.get(type) || []) f({type});}
}
class Element extends Events {
  attrs = {}; currentTime = 0; duration = 27; readyState = 3; plays = 0; children = [];
  setAttribute(k, v) {this.attrs[k] = v;} getAttribute(k) {return k === 'src' ? this.src : this.attrs[k];}
  removeAttribute(k) {delete this.attrs[k]; if (k === 'src') this.src = undefined;}
  append(...els) {this.children.push(...els);} pause() {} play() {this.plays++; return Promise.resolve();} load() {} remove() {}
}
function setup(reduced = false) {
  const win = new Events(), doc = new Events(), connection = new Events(), queries = new Map();
  win.innerWidth = 1440; win.innerHeight = 900; win.navigator = {connection};
  win.matchMedia = q => {if (!queries.has(q)) {const m = new Events(); m.matches = q.includes('reduced-motion') && reduced; queries.set(q, m);} return queries.get(q);};
  win.MutationObserver = class {observe() {} disconnect() {}};
  doc.defaultView = win; doc.documentElement = {dataset: {theme: 'dark'}}; doc.hidden = false;
  doc.createElement = () => new Element();
  const container = new Element(); container.ownerDocument = doc; container.dataset = {};
  const api = createCinemaMedia(container, assets);
  return {api, win, connection, queries, video: container.children[1]};
}
test('network and preference changes switch one source and retain the cinematic time', () => {
  const e = setup(); assert.equal(e.video.src, 'dark-1080.mp4'); e.video.currentTime = 13.5;
  e.connection.saveData = true; e.connection.emit('change');
  assert.equal(e.video.src, 'dark-landscape-540.mp4'); e.video.currentTime = 0; e.video.emit('loadedmetadata'); assert.equal(e.video.currentTime, 13.5);
  e.connection.saveData = false; e.connection.emit('change'); assert.equal(e.video.src, 'dark-1080.mp4');
  const m = e.queries.get('(prefers-reduced-data: reduce)'); m.matches = true; m.emit('change'); assert.equal(e.video.src, 'dark-landscape-540.mp4');
  e.api.dispose(); assert.equal(e.connection.listeners.get('change').size, 0);
  for (const query of e.queries.values()) assert.equal(query.listeners.get('change').size, 0);
});
test('reduced motion never starts either high or lightweight film', () => {
  const e = setup(true); assert.equal(e.video.src, undefined); assert.equal(e.video.plays, 0); e.api.dispose();
});

test('both real desktop assets are packaged as fast-start MP4s', () => {
  for (const theme of ['dark', 'light']) {
    const bytes = readFileSync(new URL(`../src/atlas/cinema/assets/cinema-${theme}-landscape-1080.mp4`, import.meta.url));
    assert.ok(bytes.length > 1_000_000);
    assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
    assert.ok(bytes.indexOf('moov') > 0 && bytes.indexOf('moov') < bytes.indexOf('mdat'));
  }
});
