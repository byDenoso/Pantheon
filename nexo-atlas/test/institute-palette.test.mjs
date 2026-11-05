import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contrast,TOKENS} from '../src/tower-web/palette.ts';

// Contrast is calculated from the actual registered CSS tokens; it does not
// replace browser, keyboard or assistive-technology review.
function block(css, marker) {
  const start=css.indexOf(marker); assert.ok(start>=0,marker);
  return css.slice(start,css.indexOf('}',start));
}
function value(css, name) {
  const match=css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`,'i'));
  assert.ok(match,`missing ${name}`);return match[1];
}
test('public and private light/dark text, accent and action colors remain legible',()=>{
 const pub=readFileSync('public-extra/assets/nexo-research.css','utf8');
 const dark=block(pub,'html:root[data-theme="dark"] .atlas-app[data-area="public"]');
 const light=block(pub,'html:root[data-theme="light"] .atlas-app[data-area="public"]');
 const css=readFileSync('src/private-design/private-design.css','utf8');
 const privateDark=block(css,'.pw.pd{');
 const privateLight=block(css,'.pw.pd[data-theme=light]{');
 for(const [name,theme] of [['public dark',dark],['public light',light]]){
  assert.ok(contrast(value(theme,'fg'),value(theme,'bg'))>=4.5,name+' body');
  assert.ok(contrast(value(theme,'fg-2'),value(theme,'bg-2'))>=4.5,name+' secondary');
  assert.ok(contrast(value(theme,'cyan'),value(theme,'bg'))>=4.5,name+' accent');
  assert.ok(contrast(value(theme,'on-action'),value(theme,'action'))>=4.5,name+' action');
  assert.ok(contrast(value(theme,'control-line'),value(theme,'bg'))>=3,name+' control boundary');
 }
 for(const [name,theme] of [['private dark',privateDark],['private light',privateLight]]){
  assert.ok(contrast(value(theme,'pd-ink'),value(theme,'pd-bg'))>=4.5,name+' body');
  assert.ok(contrast(value(theme,'pd-ink-2'),value(theme,'pd-surface-2'))>=4.5,name+' secondary');
  assert.ok(contrast(value(theme,'pd-blue-ink'),value(theme,'pd-bg'))>=4.5,name+' accent');
  assert.ok(contrast(value(theme,'pd-on-blue'),value(theme,'pd-blue'))>=4.5,name+' action');
  assert.ok(contrast(value(theme,'pd-edge'),value(theme,'pd-bg'))>=3,name+' control boundary');
 }
 for(const [theme,tokens] of Object.entries(TOKENS)){
  assert.ok(contrast(tokens.text,tokens.bg)>=4.5,theme+' web body');
  assert.ok(contrast(tokens.secondary,tokens.surface)>=4.5,theme+' web secondary');
  assert.ok(contrast(tokens.accentText,tokens.bg)>=4.5,theme+' web accent');
 }
});
