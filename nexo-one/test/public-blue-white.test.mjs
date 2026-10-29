import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css = readFileSync(new URL('../src/atlas/public-presentation.css', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../src/atlas/ui/Shell.tsx', import.meta.url), 'utf8');
const identity = css.split('/* Public presentation identity:')[1];
const luminance = hex => {
  const rgb = hex.match(/[a-f0-9]{2}/gi).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
test('public blue and white identity is scoped, not applied to private tokens', () => {
  assert.match(identity, /\.atlas-app\[data-area="public"\]\{/);
  assert.doesNotMatch(identity, /:root|data-area="private"|!important/);
  assert.match(identity, /--bg:#ffffff/);
  assert.match(identity, /background:var\(--bg\);color:var\(--fg\)/);
  assert.match(identity, /color-scheme:light/);
});
test('public text, blue links, buttons and focus meet AA contrast', () => {
  for (const color of ['0a1220', '48566c', '1e5bff', '12348f']) {
    const ratio = contrast(color, 'ffffff');
    assert.ok(ratio >= 4.5, `${color}: ${ratio}`);
    assert.ok(identity.includes(`#${color}`));
  }
});
test('private theme selection remains available without misleading public toggles', () => {
  assert.match(shell, /area === 'private' && <div className="atlas-seg" role="group" aria-label=\{m.themeLabel\}/);
  assert.match(identity, /\.atlas-app\[data-area="public"\] \.atlas-web-art\{filter:invert\(1\) hue-rotate\(180deg\);mix-blend-mode:multiply\}/);
});
