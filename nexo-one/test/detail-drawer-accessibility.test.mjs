import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { restoreFocus } from '../src/components/focus-return.ts';

test('drawer restores the connected trigger without scrolling', () => {
  const calls = [];
  assert.equal(restoreFocus({ isConnected: true, focus: options => calls.push(options) }), true);
  assert.deepEqual(calls, [{ preventScroll: true }]);
});

test('drawer does not focus a trigger removed by browser navigation', () => {
  let focused = false;
  assert.equal(restoreFocus({ isConnected: false, focus: () => { focused = true; } }), false);
  assert.equal(focused, false);
  assert.equal(restoreFocus(null), false);
});

test('drawer handles Escape cleanup, click dismissal and accessible close control', async () => {
  const source = await readFile(new URL('../src/components/DetailDrawer.tsx', import.meta.url), 'utf8');
  assert.match(source, /const returnTarget = document\.activeElement instanceof HTMLElement/);
  assert.match(source, /closeRef\.current\?\.focus\(\)/);
  assert.match(source, /event\.key !== 'Escape'/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /onCloseRef\.current\(\)/);
  assert.match(source, /restoreFocus\(returnTarget\)/);
  assert.match(source, /detail-drawer-scrim" onClick=\{onClose\} aria-hidden="true"/);
  assert.match(source, /aria-label="Fechar detalhe"/);
  assert.match(source, /role="dialog" aria-modal="false" aria-label=\{title\}/);
});

test('close target is at least 44px and has a visible keyboard focus ring', async () => {
  const css = await readFile(new URL('../src/components/DetailDrawer.css', import.meta.url), 'utf8');
  assert.match(css, /\.detail-drawer header button\{[^}]*width:44px;height:44px/);
  assert.match(css, /\.detail-drawer header button:focus-visible\{[^}]*outline:2px solid/);
  assert.match(css, /@media \(max-width:760px\)/, 'mobile bottom-sheet breakpoint remains covered');
});
