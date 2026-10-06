import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css = readFileSync(new URL('../src/atlas/atlas-theme.css', import.meta.url), 'utf8');
const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = hex => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const block = sel => { const i = css.indexOf(sel); const j = css.indexOf('}', i); return css.slice(i, j); };
const tok = (b, name) => new RegExp(`--${name}:(#[0-9a-fA-F]{6})`).exec(b)?.[1];

for (const [name, sel] of [['light', ':root{'], ['dark', ':root[data-theme="dark"]{']]) {
  test(`${name} theme: text, links, controls and focus meet WCAG AA (>=4.5 text, >=3 focus)`, () => {
    const b = block(sel); const get = n => tok(b, n);
    const bg = get('bg'), bg2 = get('bg-2');
    for (const [fg, on] of [['fg', 'bg'], ['fg', 'bg-2'], ['fg-2', 'bg'], ['fg-2', 'bg-2'], ['cyan', 'bg'], ['orange', 'bg'], ['orange', 'bg-2'], ['on-cyan', 'cyan']]) {
      assert.ok(ratio(get(fg), get(on)) >= 4.5, `${name} ${fg} on ${on} = ${ratio(get(fg), get(on)).toFixed(2)}`);
    }
    assert.ok(ratio(get('focus'), bg) >= 3);
    assert.ok(bg && bg2);
  });
}
test('palette semantics: one blue family on white (light) and on black (dark); system font stack only', () => {
  for (const sel of [':root{', ':root[data-theme="dark"]{']) for (const n of ['cyan', 'orange', 'focus', 'on-cyan', 'fg', 'fg-2', 'line', 'bg-2']) { const hex = tok(block(sel), n), v = parseInt(hex.slice(1), 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255; assert.ok(b >= g && g >= r, `${sel} --${n} ${hex} is black, white, grey-blue or blue`); }
  assert.equal(tok(block(':root{'), 'bg'), '#ffffff');
  assert.equal(tok(block(':root[data-theme="dark"]{'), 'bg'), '#000000');
  assert.doesNotMatch(css, /@import|url\(|fonts\.g/);
});
test('reduced motion and bfcache hiding rules exist', () => {
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /html\[data-atlas-private="hidden"\] \.private-root\{visibility:hidden\}/);
});
