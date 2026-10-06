// The Atlas highlights are one blue family on white (light) / black (dark). Static checks of the cascade: the browser smoke of the legacy lab
// cannot reach its colour assertion in every environment, so the winning declarations are verified here from the stylesheets themselves.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const rd = p => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
/** value of the LAST declaration of `prop` inside rules whose selector list contains exactly `selector` */
const last = (css, selector, prop) => {
  let v = null; css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map(s => s.trim()).includes(selector)) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) if (d[1] === prop) v = d[2].trim().replace(/\s*!important$/, '');
  }
  return v;
};

test('legacy lab: the winning accent and background tokens are the blue family on black / white, in both themes', () => {
  const lab = rd('features/lab/LabApp.tsx');
  assert.ok(lab.indexOf("import './lab.css'") < lab.indexOf("import '../../styles/atlas-cinematic.css'"), 'atlas-cinematic.css is loaded after lab.css, so equal-specificity rules in it win');
  const css = rd('styles/atlas-cinematic.css'); const D = ':root[data-theme="dark"] .observatory', L = ':root[data-theme="light"] .observatory';
  assert.equal(last(css, D, '--o-accent'), '#6890ff'); assert.equal(last(css, L, '--o-accent'), '#1e5bff');
  assert.equal(last(css, D, '--o-void'), '#000000'); assert.equal(last(css, L, '--o-void'), '#ffffff');
  for (const [sel, hex] of [[D, '#6890ff'], [L, '#1e5bff']]) for (const p of ['--sig-gold', '--sig-oiii', '--v-ready']) assert.equal(last(css, sel, p), hex, `${sel} ${p}`);
  assert.equal(last(css, ':root[data-theme="light"]', '--obs-void'), '#ffffff');
  assert.match(css, /:root\[data-theme="light"\] body,:root\[data-theme="light"\] \.unified-shell\{background:#ffffff\}/);
});

test('legacy lab: no fixed gold / beige literal is left in the scene and trail code; other verdict colours are untouched', () => {
  for (const f of ['features/lab/LabApp.tsx', 'features/lab/ObservatoryScene.tsx']) assert.doesNotMatch(rd(f), /#d4bf95|#8a7a5c|#f0dfbd|#fff6e4|#fff4df|#7a5f35|#35291a|#130f08|#f2e6d1|#69471f|#9a8d75/i, f);
  const ramp = /const INFERNO = \[([^\]]+)\]/.exec(rd('features/lab/ObservatoryScene.tsx'))[1].match(/#[0-9a-f]{6}/gi); assert.equal(ramp.length, 6);
  for (const hex of ramp) { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; assert.ok(b >= g && g >= r, `${hex} is in the blue family`); }
  assert.match(rd('features/lab/LabApp.tsx'), /CONFIRMED: '#5fd0a0', REFUTED: '#e0664f', REVIEW: '#e0b24f', PROVISIONAL: '#9fb4d8', READY: '#6890ff'/);
});
