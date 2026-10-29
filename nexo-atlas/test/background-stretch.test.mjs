import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const view=readFileSync('src/atlas/ui/CosmologicalBackdrop.tsx','utf8');
const css=readFileSync('src/atlas/game-motion.css','utf8');
const base=readFileSync('src/atlas/cinema/cosmological-backdrop.css','utf8');
test('cosmic illustration has no synthetic dots or orbit overlays',()=>{
 assert.doesNotMatch(view,/CosmicMotionField|nexo-depth-lights|nexo-expansion-rings/);
 assert.equal(existsSync('src/atlas/ui/CosmicMotionField.tsx'),false);
 assert.doesNotMatch(css,/nexo-depth-flight|nexo-cmb-orbits|nexo-depth-lights/);
});
test('only expansion artwork stretches directly, with pause and reduced-motion support',()=>{
 assert.match(css,/data-illustration=cosmic-expansion\] \.nexo-cosmic-image\{animation:nexo-image-stretch/);
 assert.match(css,/@keyframes nexo-image-stretch\{0%\{transform:scale\(1\.04,1\.04\)\}50%\{transform:scale\(1\.17,1\.08\)\}100%\{transform:scale\(1\.28,1\.18\)\}\}/);
 assert.match(css,/data-cinema-paused=true/);
 assert.match(css,/data-paused=true/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(view,/data-paused=\{paused \|\| hidden\}/);
});
test('CMB does not rotate in either animation stylesheet',()=>{
 assert.match(css,/data-illustration=cmb\]\.nexo-reactive\[data-hover=true\]\{transform:none\}/);
 assert.doesNotMatch(css+base,/nexo-cmb-turn|nexo-cmb-drift|nexo-orbit-turn/);
 assert.match(base,/is-cmb \.nexo-themed-image\{animation:none;transform:scale\(1\.12\)/);
 assert.match(css,/is-cmb \.nexo-themed-image\{animation:none;transform:scale\(1\.12\)/);
});
