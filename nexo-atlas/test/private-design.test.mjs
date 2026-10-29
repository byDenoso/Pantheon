import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join,basename,extname} from 'node:path';
const read=p=>readFileSync(p,'utf8');

test('private design is additive and preserves canonical board and current visualization',()=>{
 const shell=read('src/private-workspace/PrivateWorkspace.tsx');
 assert.match(shell,/className="pw pd"/);
 assert.match(shell,/<PrivateNav /);
 assert.match(shell,/<AgentBoardView state=\{state\} lang=\{lang\}/);
 assert.match(shell,/<TowerCosmos tests=\{tests\}/);
 assert.doesNotMatch(shell,/private-design\/AgentBoard/);
 const nav=read('src/private-design/PrivateNav.tsx');
 assert.match(nav,/items\.slice\(inline\)/);
 assert.match(nav,/aria-expanded=\{open\}/);
 assert.match(nav,/event\.key === 'Escape'/);
 assert.match(nav,/event\.stopPropagation\(\)/);
 assert.match(nav,/toggle\.current\?\.focus\(\)/);
 assert.match(nav,/addEventListener\('hashchange', close\)/);
 assert.doesNotMatch(nav,/fetch\(|localStorage|sessionStorage|cockpit|galaxia/);
});

test('current mobile geometry, touch controls and reduced motion override the old demo layout',()=>{
 const css=read('src/private-design/current-workspace.css');
 assert.match(css,/--pw-head:52px/);
 assert.match(css,/\.pw\.pd \.pw-header\{z-index:40\}/);
 assert.match(css,/\.tc-2d:focus-visible\{outline-offset:-3px\}/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/\.pd-nav \[data-overflow\]\{display:none\}/);
 assert.match(css,/min-height:60px/);
 assert.match(css,/\.pd-nav>a:not\(\[data-overflow\]\)/);
 assert.doesNotMatch(css,/\.pd-nav>a,\.pw\.pd \.pd-nav-toggle\{display:flex/);
 assert.match(css,/top:auto;bottom:calc\(100% \+ 8px\)/);
 assert.match(css,/inset:0;border:0;border-radius:0;overflow:visible/);
 assert.match(css,/h3 a::after\{content:none\}/);
 assert.match(read('src/private-design/private-design.css'),/prefers-reduced-motion:reduce/);
 const main=read('src/private-legacy/main.tsx');
 assert.ok(main.indexOf('current-workspace.css')>main.indexOf('mobile-workspace.css'));
 assert.ok(main.indexOf('current-workspace.css')>main.indexOf('private-design.css'));
});

test('shared design artwork is correctly manifested while private UI code stays out of public output',async()=>{
 const manifest=JSON.parse(read('server/private-ui/manifest.json'));
 const artwork=[...read('src/private-design/private-design.css').matchAll(/--pd-gas:url\('([^']+)'\)/g)].map(match=>basename(match[1]));
 assert.deepEqual(artwork,['expansion-dark-v1.webp','cmb-light-v1.webp']);
 const {default:assets}=await import('../.sites-runtime/private-assets.mjs');
 const privateCss=Object.keys(manifest.files).filter(name=>name.endsWith('.css')).map(name=>read(join('server/private-ui',name))).join('\n');
 for(const source of artwork){
  const extension=extname(source),stem=basename(source,extension);
  const names=Object.keys(manifest.files).filter(name=>name.startsWith('assets/'+stem+'-')&&name.endsWith(extension));
  assert.equal(names.length,1,source+' must have one manifested build asset');
  assert.equal(assets[names[0]]?.type,'image/webp');
  assert.ok(privateCss.includes(basename(names[0])),source+' must be referenced by the built private CSS');
 }
 // These illustrations are intentionally shared with the public site; private UI code is not.
 const publicFiles=readdirSync('dist/client/assets');
 for(const name of publicFiles.filter(x=>/\.(css|js)$/.test(x)))assert.doesNotMatch(read(join('dist/client/assets',name)),/\.pw\.pd|pd-board|pw-board-post/);
});
