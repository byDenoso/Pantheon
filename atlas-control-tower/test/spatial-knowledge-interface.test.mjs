import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const url = path => new URL(`../${path}`, import.meta.url);
const read = path => readFileSync(url(path), 'utf8');

test('spatial navigation has a dedicated scene-history state machine', async () => {
  const moduleUrl = url('lib/spatial-navigation.mjs');
  assert.equal(existsSync(moduleUrl), true, 'lib/spatial-navigation.mjs must exist');
  if (!existsSync(moduleUrl)) return;
  const { createNavigationState, captureFrame, pushFrame, goBack, goForward } = await import(moduleUrl.href);
  let state = createNavigationState({ rootNode: 'system:NEXO' });
  state = pushFrame(state, captureFrame({ rootNode: 'system:SCIENCE', selectedNode: 'domain:cosmology', camera: { x: 4, y: 2 }, zoom: 1.4, yaw: 8, pitch: -3, filters: { status: 'READY' }, expandedRelations: ['evidence'], visibleLayers: ['hierarchy', 'evidence'] }));
  state = pushFrame(state, captureFrame({ rootNode: 'domain:dark-energy', selectedNode: 'test:T-DE017', camera: { x: 9, y: 1 }, zoom: 2.1, yaw: 14, pitch: 2, filters: {}, expandedRelations: ['supports'], visibleLayers: ['evidence'] }));
  const back = goBack(state);
  assert.equal(back.frame.rootNode, 'system:SCIENCE');
  assert.equal(back.frame.zoom, 1.4);
  assert.deepEqual(back.frame.camera, { x: 4, y: 2 });
  const forward = goForward(back.state);
  assert.equal(forward.frame.rootNode, 'domain:dark-energy');
  assert.equal(forward.frame.selectedNode, 'test:T-DE017');
});

test('graph session exposes scene history, forward, pin and compare state', () => {
  const source = read('lib/graph-session.mjs');
  assert.match(source, /navigationStack/);
  assert.match(source, /navigationIndex/);
  assert.match(source, /forward\(\)/);
  assert.match(source, /pin\(id\)/);
  assert.match(source, /toggleCompare\(id\)/);
  assert.match(source, /setSceneState\(patch\)/);
});

test('live graph projection carries context-shell and relation-horizon roles', () => {
  const path = 'src/graph-engine/live-projection.ts';
  assert.equal(existsSync(url(path)), true, `${path} must exist`);
  if (!existsSync(url(path))) return;
  const source = read(path);
  assert.match(source, /contextRole:\s*'ancestor'/);
  assert.match(source, /contextRole:\s*'portal'/);
  assert.match(source, /navigationKind/);
});

test('GraphRenderer is Canvas-first and keeps WebGL as explicit opt-in', () => {
  const source = read('src/graph-engine/GraphRenderer.tsx');
  assert.match(source, /renderer'\)===['"]webgl['"]/);
  assert.match(source, /if\(!webgl\).*GraphExplorer/s);
  assert.match(source, /GraphScene3D/);
});

test('live graphs page uses the renderer abstraction instead of owning AtlasCanvas', () => {
  const source = read('src/pages/graphs-page.tsx');
  assert.match(source, /GraphRenderer/);
  assert.match(source, /buildLiveProjection/);
  assert.doesNotMatch(source, /import \{ AtlasCanvas \}/);
});

test('theme control supports system light dark deep-space and high-contrast', () => {
  const source = read('src/components/ThemeToggle.tsx');
  for (const theme of ['system', 'light', 'dark', 'deep-space', 'high-contrast']) assert.match(source, new RegExp(theme));
  assert.match(source, /atlas:theme-change/);
  const app = read('src/App.tsx');
  assert.match(app, /ThemeToggle/);
  const indexCss = read('src/design/index.css');
  assert.match(indexCss, /premium-theme\.css/);
});

test('semantic graph theme tokens exist for DOM and Canvas consumers', () => {
  const path = 'src/design/premium-theme.css';
  assert.equal(existsSync(url(path)), true, `${path} must exist`);
  if (!existsSync(url(path))) return;
  const css = read(path);
  for (const token of ['--graph-background', '--graph-grid', '--graph-edge', '--graph-label', '--graph-focus']) assert.match(css, new RegExp(token));
  assert.match(css, /data-theme="deep-space"/);
  assert.match(css, /data-theme="high-contrast"/);
});
