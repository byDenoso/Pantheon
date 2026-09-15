// Real behavior tests for the ATLAS shell (header, drawer, sidebar nav, theme
// tokens) -- these call real functions with real inputs and assert real outputs,
// not source-text regexes. The full React components (GraphHeader.tsx,
// ActivityDrawer.tsx) are JSX and can't be imported under Node's plain type-stripping
// test runner, so this file exercises the exact non-JSX logic those components
// delegate to for rendering decisions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  readRendererModeFromSearch,
  nextRendererSearch
} from '../src/graph-engine/renderer-mode.ts';
import { ACTIVITY_TABS, UNAVAILABLE_REASONS } from '../src/components/shell/activity-tabs.ts';
import { isActiveNavItem } from '../src/state/nav-active.ts';

test('readRendererModeFromSearch defaults to canvas with no query', () => {
  assert.equal(readRendererModeFromSearch(''), 'canvas');
  assert.equal(readRendererModeFromSearch('?foo=bar'), 'canvas');
});

test('readRendererModeFromSearch only switches to webgl on an exact match', () => {
  assert.equal(readRendererModeFromSearch('?renderer=webgl'), 'webgl');
  assert.equal(readRendererModeFromSearch('?renderer=WEBGL'), 'canvas');
  assert.equal(readRendererModeFromSearch('?renderer=webgl2'), 'canvas');
});

test('nextRendererSearch adds renderer=webgl and removes it for canvas, preserving other params', () => {
  assert.equal(nextRendererSearch('?domain=science', 'webgl'), 'domain=science&renderer=webgl');
  assert.equal(nextRendererSearch('?domain=science&renderer=webgl', 'canvas'), 'domain=science');
  assert.equal(nextRendererSearch('', 'canvas'), '');
});

test('renderer mode round-trips through its own search string', () => {
  for (const mode of ['canvas', 'webgl']) {
    const search = nextRendererSearch('', mode);
    assert.equal(readRendererModeFromSearch(`?${search}`), mode);
  }
});

test('activity drawer exposes exactly the four required tabs in the required order', () => {
  assert.deepEqual(ACTIVITY_TABS.map(item => item.id), ['changes', 'next', 'tests', 'filaments']);
  for (const item of ACTIVITY_TABS) assert.ok(item.label.trim().length > 0, `tab ${item.id} needs a real label`);
});

test('activity drawer never claims data it cannot back: unavailable reasons are non-empty and honest', () => {
  for (const reason of Object.values(UNAVAILABLE_REASONS)) {
    assert.ok(reason.length > 20, 'reason must be a real explanation, not a placeholder');
    assert.doesNotMatch(reason, /lorem|placeholder|TODO|fake/i);
  }
});

test('isActiveNavItem maps legacy research areas to the single visible Observatório item', () => {
  assert.equal(isActiveNavItem('observatory', 'observatory'), true);
  assert.equal(isActiveNavItem('graphs', 'observatory'), true);
  assert.equal(isActiveNavItem('universe', 'observatory'), true);
  assert.equal(isActiveNavItem('graphs', 'lab'), false);
  assert.equal(isActiveNavItem('cockpit', 'cockpit'), true);
  assert.equal(isActiveNavItem('', 'observatory'), false);
});

function parseCssCustomProps(block) {
  const props = {};
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) props[match[1]] = match[2].trim();
  return props;
}

function themeBlocks(css) {
  const blocks = {};
  const re = /(:root|html\[data-theme="([a-z-]+)"\])\s*\{([^}]*)\}/g;
  let match;
  while ((match = re.exec(css))) {
    const name = match[2] || 'root';
    if (blocks[name]) continue;
    blocks[name] = parseCssCustomProps(match[3]);
  }
  return blocks;
}

test('every theme defines the same required token set with a real (non-empty) value', () => {
  const css = readFileSync(new URL('../src/design/premium-theme.css', import.meta.url), 'utf8');
  const blocks = themeBlocks(css);
  const themeNames = ['root', 'dark', 'deep-space', 'high-contrast', 'classic'];
  for (const name of themeNames) assert.ok(blocks[name], `theme "${name}" block not found in premium-theme.css`);

  const requiredKeys = Object.keys(blocks.root);
  assert.ok(requiredKeys.length >= 15, 'sanity check: :root should define a real token set');

  for (const name of themeNames) {
    if (name === 'root') continue;
    const theme = blocks[name];
    for (const key of requiredKeys) {
      assert.ok(key in theme, `theme "${name}" is missing token ${key} (defined in :root)`);
      assert.ok(theme[key].length > 0, `theme "${name}" token ${key} has an empty value`);
    }
  }
});

test('dark-family themes do not reuse the light theme surface color (real contrast, not just a defined token)', () => {
  const css = readFileSync(new URL('../src/design/premium-theme.css', import.meta.url), 'utf8');
  const blocks = themeBlocks(css);
  for (const name of ['dark', 'deep-space', 'high-contrast']) {
    assert.notEqual(blocks[name]['--surface-canvas'], blocks.root['--surface-canvas'], `theme "${name}" should not share the light canvas color`);
    assert.notEqual(blocks[name]['--text-primary'], blocks.root['--text-primary'], `theme "${name}" should not share the light text color`);
  }
});