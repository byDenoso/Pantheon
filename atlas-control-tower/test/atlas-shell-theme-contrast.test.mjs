import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Real bug reported: Observatório/Cockpit/shell chrome rendered dark-navy card
// backgrounds with near-black text on top in the Clássico (light) theme -- illegible.
// Root cause: the legacy --atlas-* variables ARE already correctly re-aliased to the
// theme-aware premium tokens in premium-theme.css, but several component rules in
// atlas-shell.css bypassed those variables with hardcoded literal rgba()/hex colors,
// so those specific surfaces never actually followed the active theme. This locks
// that the known-affected shell chrome selectors reference the theme-aware --atlas-*
// tokens instead of a hardcoded literal, so switching themes actually changes them.
const css = readFileSync(new URL('../src/styles/atlas-shell.css', import.meta.url), 'utf8');

function ruleFor(selector) {
  for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = match[1].split(',').map(part => part.trim());
    if (selectors.includes(selector)) return match[2];
  }
  assert.fail(`expected to find a rule for ${selector}`);
}

const THEME_AWARE_SURFACE_SELECTORS = [
  '.atlas-topbar',
  '.global-search',
  '.sync-button',
  '.profile-button',
  '.atlas-sidebar',
  '.record-row',
  '.atlas-inspector',
  '.atlas-graph-transition',
  '.atlas-graph-renderer-fallback',
  '.atlas-canvas-fallback-badge'
];

for (const selector of THEME_AWARE_SURFACE_SELECTORS) {
  test(`${selector} uses a theme-aware --atlas-*/--graph-* background, not a hardcoded literal color`, () => {
    const rule = ruleFor(selector);
    const backgroundDeclaration = rule.match(/background:\s*[^;}]+[;}]?/)?.[0] || '';
    assert.ok(backgroundDeclaration.length > 0, `expected ${selector} to declare a background`);
    assert.match(backgroundDeclaration, /var\(--(atlas|graph)-/, `${selector}'s background must reference a theme-aware token: ${backgroundDeclaration}`);
  });
}

test('the knowledge-graph canvas stage never hardcodes a near-black background under the locked map contract', () => {
  const rule = ruleFor('.graph-stage');
  assert.doesNotMatch(rule, /#02[0-9a-f]{4}\b/i, 'graph-stage must not fall back to a hardcoded near-black hex background');
  assert.match(rule, /var\(--graph-background\)/);
});
